import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Wallet, ethers } from "ethers";
import { connectDb, marketplaceListingStatsCol, marketplaceListingsCol, marketplacePurchasesCol, sessionsCol, strategiesCol, usersCol, walletLinksCol, } from "../db.js";
import { registerMarketplaceRoutes, findUsdcTransfer } from "./marketplace.js";
let mongo;
function makeUser(id, tier) {
    return {
        _id: id,
        email: `${id}@example.com`,
        name: id,
        avatar: "",
        tier,
        subscribedAt: tier === "pro" ? new Date().toISOString() : null,
        expiresAt: tier === "pro" ? new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString() : null,
        googleId: "",
        passwordHash: "",
        createdAt: new Date().toISOString(),
    };
}
async function makeSession(userId, token) {
    const now = new Date();
    await sessionsCol().insertOne({
        _id: token,
        userId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60),
    });
}
function headers(token) {
    return { "x-session-token": token, "content-type": "application/json" };
}
async function makeApp() {
    const app = Fastify({ logger: false });
    await app.register(registerMarketplaceRoutes, { prefix: "/api/marketplace" });
    return app;
}
beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri("polyblocks_test");
    await connectDb();
});
afterAll(async () => {
    await mongo.stop();
});
beforeEach(async () => {
    await usersCol().deleteMany({});
    await sessionsCol().deleteMany({});
    await strategiesCol().deleteMany({});
    await marketplaceListingsCol().deleteMany({});
    await marketplaceListingStatsCol().deleteMany({});
    await marketplacePurchasesCol().deleteMany({});
    await walletLinksCol().deleteMany({});
});
describe("marketplace", () => {
    it("verifies wallet via challenge + signature", async () => {
        const app = await makeApp();
        const creatorId = "u_creator";
        const token = "t_creator";
        await usersCol().insertOne(makeUser(creatorId, "free"));
        await makeSession(creatorId, token);
        const wallet = Wallet.createRandom();
        const challengeRes = await app.inject({
            method: "POST",
            url: "/api/marketplace/wallet/challenge",
            headers: headers(token),
            payload: { walletAddress: wallet.address },
        });
        expect(challengeRes.statusCode).toBe(200);
        const challenge = challengeRes.json();
        const sig = await wallet.signMessage(challenge.message);
        const verifyRes = await app.inject({
            method: "POST",
            url: "/api/marketplace/wallet/verify",
            headers: headers(token),
            payload: { walletAddress: wallet.address, signature: sig, nonce: challenge.nonce },
        });
        expect(verifyRes.statusCode).toBe(200);
        const v = verifyRes.json();
        expect(v.verified).toBe(true);
        expect(v.walletAddress.toLowerCase()).toBe(wallet.address.toLowerCase());
    });
    it("enforces monthly publish limits (free=1, pro=5)", async () => {
        const app = await makeApp();
        const wallet = Wallet.createRandom();
        const freeId = "u_free";
        const freeToken = "t_free";
        await usersCol().insertOne(makeUser(freeId, "free"));
        await makeSession(freeId, freeToken);
        await walletLinksCol().insertOne({ _id: "wl1", userId: freeId, walletAddress: wallet.address, verifiedAt: new Date().toISOString() });
        await strategiesCol().insertOne({
            _id: "s1",
            userId: freeId,
            name: "Strategy 1",
            description: "",
            nodes: [],
            edges: [],
            status: "draft",
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        const pub1 = await app.inject({
            method: "POST",
            url: "/api/marketplace/listings",
            headers: headers(freeToken),
            payload: { sourceStrategyId: "s1", priceUsdc: 5, creatorWalletAddress: wallet.address },
        });
        expect(pub1.statusCode).toBe(200);
        const pub2 = await app.inject({
            method: "POST",
            url: "/api/marketplace/listings",
            headers: headers(freeToken),
            payload: { sourceStrategyId: "s1", priceUsdc: 5, creatorWalletAddress: wallet.address },
        });
        expect(pub2.statusCode).toBe(403);
        const proId = "u_pro";
        const proToken = "t_pro";
        await usersCol().insertOne(makeUser(proId, "pro"));
        await makeSession(proId, proToken);
        await walletLinksCol().insertOne({ _id: "wl2", userId: proId, walletAddress: wallet.address, verifiedAt: new Date().toISOString() });
        await strategiesCol().insertOne({
            _id: "s2",
            userId: proId,
            name: "Strategy 2",
            description: "",
            nodes: [],
            edges: [],
            status: "draft",
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        for (let i = 0; i < 5; i++) {
            const r = await app.inject({
                method: "POST",
                url: "/api/marketplace/listings",
                headers: headers(proToken),
                payload: { sourceStrategyId: "s2", priceUsdc: 5, creatorWalletAddress: wallet.address, title: `L${i}` },
            });
            expect(r.statusCode).toBe(200);
        }
        const r6 = await app.inject({
            method: "POST",
            url: "/api/marketplace/listings",
            headers: headers(proToken),
            payload: { sourceStrategyId: "s2", priceUsdc: 5, creatorWalletAddress: wallet.address, title: "L6" },
        });
        expect(r6.statusCode).toBe(403);
    });
    it("tracks views and unique views", async () => {
        const app = await makeApp();
        const wallet = Wallet.createRandom();
        const creatorId = "u_creator";
        const token = "t_creator";
        await usersCol().insertOne(makeUser(creatorId, "pro"));
        await makeSession(creatorId, token);
        await walletLinksCol().insertOne({ _id: "wl", userId: creatorId, walletAddress: wallet.address, verifiedAt: new Date().toISOString() });
        await strategiesCol().insertOne({
            _id: "s1",
            userId: creatorId,
            name: "S",
            description: "",
            nodes: [],
            edges: [],
            status: "draft",
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        const pub = await app.inject({
            method: "POST",
            url: "/api/marketplace/listings",
            headers: headers(token),
            payload: { sourceStrategyId: "s1", priceUsdc: 5, creatorWalletAddress: wallet.address },
        });
        const { id } = pub.json();
        await app.inject({ method: "POST", url: `/api/marketplace/listings/${id}/view`, headers: { "content-type": "application/json" }, payload: { sessionId: "sess1" } });
        await app.inject({ method: "POST", url: `/api/marketplace/listings/${id}/view`, headers: { "content-type": "application/json" }, payload: { sessionId: "sess1" } });
        const stats = await marketplaceListingStatsCol().findOne({ _id: id });
        expect(stats?.views).toBe(2);
        expect(stats?.uniqueViews).toBe(1);
    });
    it("requires verified purchase to clone for non-owners", async () => {
        const app = await makeApp();
        const wallet = Wallet.createRandom();
        const sellerId = "u_seller";
        const sellerToken = "t_seller";
        await usersCol().insertOne(makeUser(sellerId, "pro"));
        await makeSession(sellerId, sellerToken);
        await walletLinksCol().insertOne({ _id: "wl1", userId: sellerId, walletAddress: wallet.address, verifiedAt: new Date().toISOString() });
        await strategiesCol().insertOne({
            _id: "s_seller",
            userId: sellerId,
            name: "Seller Strat",
            description: "",
            nodes: [{ id: "n1" }],
            edges: [],
            status: "draft",
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        const pub = await app.inject({
            method: "POST",
            url: "/api/marketplace/listings",
            headers: headers(sellerToken),
            payload: { sourceStrategyId: "s_seller", priceUsdc: 5, creatorWalletAddress: wallet.address },
        });
        const { id: listingId } = pub.json();
        const buyerId = "u_buyer";
        const buyerToken = "t_buyer";
        await usersCol().insertOne(makeUser(buyerId, "free"));
        await makeSession(buyerId, buyerToken);
        const deny = await app.inject({
            method: "POST",
            url: `/api/marketplace/listings/${listingId}/clone`,
            headers: headers(buyerToken),
            payload: {},
        });
        expect(deny.statusCode).toBe(403);
        await marketplacePurchasesCol().insertOne({
            _id: "p1",
            listingId,
            buyerUserId: buyerId,
            sellerUserId: sellerId,
            amountUsdc: 5,
            chainId: 137,
            txHash: "0xabc",
            payerAddress: wallet.address,
            status: "verified",
            createdAt: new Date().toISOString(),
            verifiedAt: new Date().toISOString(),
        });
        const ok = await app.inject({
            method: "POST",
            url: `/api/marketplace/listings/${listingId}/clone`,
            headers: headers(buyerToken),
            payload: {},
        });
        expect(ok.statusCode).toBe(200);
        const data = ok.json();
        const created = await strategiesCol().findOne({ _id: data.strategyId });
        expect(created?.userId).toBe(buyerId);
    });
    it("parses a matching USDC Transfer log for payment verification", () => {
        const to = Wallet.createRandom().address;
        const from = Wallet.createRandom().address;
        const value = ethers.utils.parseUnits("5.000000", 6);
        const log = {
            address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
            topics: [
                ethers.utils.id("Transfer(address,address,uint256)"),
                ethers.utils.hexZeroPad(from, 32),
                ethers.utils.hexZeroPad(to, 32),
            ],
            data: ethers.utils.hexZeroPad(value.toHexString(), 32),
        };
        const match = findUsdcTransfer([log], to, 5);
        expect(match?.payerAddress.toLowerCase()).toBe(from.toLowerCase());
    });
});
//# sourceMappingURL=marketplace.test.js.map