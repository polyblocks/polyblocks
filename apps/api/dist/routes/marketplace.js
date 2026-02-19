import { nanoid } from "nanoid";
import * as crypto from "crypto";
import { ethers } from "ethers";
import { marketplaceListingsCol, marketplaceListingInteractionsCol, marketplaceListingStatsCol, marketplaceListingViewsCol, marketplacePurchasesCol, marketplaceVerifiedPerformanceCol, paperTradesCol, sessionsCol, strategiesCol, usersCol, walletChallengesCol, walletLinksCol, } from "../db.js";
const POLYGON_CHAIN_ID = 137;
const POLYGON_USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const ERC20_TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");
function getSessionToken(headers) {
    const token = headers["x-session-token"];
    return typeof token === "string" ? token : "";
}
async function resolveSession(token) {
    if (!token)
        return null;
    const session = await sessionsCol().findOne({ _id: token });
    if (!session)
        return null;
    if (session.expiresAt < new Date()) {
        await sessionsCol().deleteOne({ _id: token });
        return null;
    }
    return session.userId;
}
async function requireUser(app, req) {
    const token = getSessionToken(req.headers);
    const userId = await resolveSession(token);
    if (!userId)
        return null;
    const user = await usersCol().findOne({ _id: userId });
    if (!user)
        return null;
    if (user.tier === "pro" && user.expiresAt && new Date(user.expiresAt) < new Date()) {
        await usersCol().updateOne({ _id: user._id }, { $set: { tier: "free", subscribedAt: null, expiresAt: null } });
        return { ...user, tier: "free", subscribedAt: null, expiresAt: null };
    }
    return user;
}
function getMonthWindow(now) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    return { startIso: start.toISOString(), nextIso: next.toISOString() };
}
function safeLowerHex(s) {
    return s.trim().toLowerCase();
}
function ipHash(ip) {
    return crypto.createHash("sha256").update(ip || "unknown").digest("hex").slice(0, 24);
}
function toUsdcUnits(amountUsdc) {
    if (!Number.isFinite(amountUsdc))
        throw new Error("Invalid amount");
    if (amountUsdc < 0)
        throw new Error("Invalid amount");
    return ethers.utils.parseUnits(amountUsdc.toFixed(6), 6);
}
function decodeTopicAddress(topic) {
    return ethers.utils.getAddress(ethers.utils.hexDataSlice(topic, 12));
}
export function findUsdcTransfer(logs, toAddress, amountUsdc) {
    const expectedTo = ethers.utils.getAddress(toAddress);
    const expectedValue = toUsdcUnits(amountUsdc);
    for (const log of logs) {
        if (safeLowerHex(log.address) !== safeLowerHex(POLYGON_USDC_ADDRESS))
            continue;
        if (!Array.isArray(log.topics) || log.topics.length < 3)
            continue;
        if (log.topics[0] !== ERC20_TRANSFER_TOPIC)
            continue;
        const from = decodeTopicAddress(log.topics[1]);
        const to = decodeTopicAddress(log.topics[2]);
        const value = ethers.BigNumber.from(log.data);
        if (safeLowerHex(to) === safeLowerHex(expectedTo) && value.eq(expectedValue)) {
            return { payerAddress: from };
        }
    }
    return null;
}
async function getListingStatsMap(listingIds) {
    const stats = await marketplaceListingStatsCol().find({ _id: { $in: listingIds } }).toArray();
    const m = new Map();
    for (const s of stats)
        m.set(s._id, s);
    return m;
}
function computeTradeMetrics(trades) {
    const positions = new Map();
    let realizedPnl = 0;
    let volume = 0;
    let wins = 0;
    let losses = 0;
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    const equityCurve = [];
    const sorted = [...trades].sort((a, b) => a.executedAt.localeCompare(b.executedAt));
    for (const t of sorted) {
        const size = Number(t.size) || 0;
        const price = Number(t.price) || 0;
        if (size <= 0 || price < 0)
            continue;
        const tokenId = String(t.tokenId || "");
        if (!tokenId)
            continue;
        if (t.side === "BUY") {
            const pos = positions.get(tokenId) || { size: 0, cost: 0 };
            pos.size += size;
            pos.cost += price * size;
            positions.set(tokenId, pos);
            volume += price * size;
        }
        else {
            const pos = positions.get(tokenId) || { size: 0, cost: 0 };
            const sellSize = Math.min(size, pos.size);
            if (sellSize > 0 && pos.size > 0) {
                const avgCost = pos.cost / pos.size;
                const pnl = (price - avgCost) * sellSize;
                realizedPnl += pnl;
                equity += pnl;
                volume += price * sellSize;
                if (pnl > 0)
                    wins += 1;
                else if (pnl < 0)
                    losses += 1;
                pos.size -= sellSize;
                pos.cost -= avgCost * sellSize;
                if (pos.size <= 0.0000001) {
                    positions.delete(tokenId);
                }
                else {
                    positions.set(tokenId, pos);
                }
            }
        }
        peak = Math.max(peak, equity);
        const drawdown = peak > 0 ? (peak - equity) / peak : 0;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
        equityCurve.push({ t: t.executedAt, v: Number(equity.toFixed(6)) });
    }
    const tradesCount = sorted.length;
    const winRatePct = tradesCount > 0 ? (wins / Math.max(1, wins + losses)) * 100 : 0;
    const maxCapital = volume > 0 ? volume : 1;
    const roiPct = (realizedPnl / maxCapital) * 100;
    return {
        realizedPnlUsdc: Number(realizedPnl.toFixed(6)),
        roiPct: Number(roiPct.toFixed(4)),
        winRatePct: Number(winRatePct.toFixed(2)),
        maxDrawdownPct: Number((maxDrawdown * 100).toFixed(2)),
        trades: tradesCount,
        volumeUsdc: Number(volume.toFixed(6)),
        equityCurve,
    };
}
export async function registerMarketplaceRoutes(app) {
    app.get("/listings", async (req) => {
        const { limit, offset, search, sort } = req.query;
        const take = Math.max(1, Math.min(50, Number(limit) || 20));
        const skip = Math.max(0, Number(offset) || 0);
        const filter = { status: "active", visibility: "public" };
        if (typeof search === "string" && search.trim()) {
            const q = search.trim().slice(0, 80);
            filter.$or = [
                { title: { $regex: q, $options: "i" } },
                { description: { $regex: q, $options: "i" } },
            ];
        }
        const sortSpec = sort === "new" ? { publishedAt: -1 } : { publishedAt: -1 };
        const listings = await marketplaceListingsCol().find(filter).sort(sortSpec).skip(skip).limit(take).toArray();
        const statsMap = await getListingStatsMap(listings.map((l) => l._id));
        return {
            listings: listings.map((l) => {
                const s = statsMap.get(l._id);
                return {
                    id: l._id,
                    ownerUserId: l.ownerUserId,
                    title: l.title,
                    description: l.description,
                    tags: l.tags,
                    status: l.status,
                    visibility: l.visibility,
                    creatorWalletAddress: l.creatorWalletAddress,
                    priceUsdc: l.priceUsdc,
                    chainId: l.chainId,
                    currency: l.currency,
                    publishedAt: l.publishedAt,
                    stats: s ? { views: s.views, uniqueViews: s.uniqueViews, likes: s.likes, upVotes: s.upVotes, downVotes: s.downVotes, purchases: s.purchases } : { views: 0, uniqueViews: 0, likes: 0, upVotes: 0, downVotes: 0, purchases: 0 },
                };
            }),
        };
    });
    app.get("/listings/:listingId", async (req, reply) => {
        const { listingId } = req.params;
        const listing = await marketplaceListingsCol().findOne({ _id: listingId });
        if (!listing)
            return reply.code(404).send({ error: "Listing not found" });
        const stats = await marketplaceListingStatsCol().findOne({ _id: listingId });
        return {
            listing: {
                id: listing._id,
                ownerUserId: listing.ownerUserId,
                title: listing.title,
                description: listing.description,
                tags: listing.tags,
                status: listing.status,
                visibility: listing.visibility,
                creatorWalletAddress: listing.creatorWalletAddress,
                priceUsdc: listing.priceUsdc,
                chainId: listing.chainId,
                currency: listing.currency,
                publishedAt: listing.publishedAt,
                sourceStrategyId: listing.sourceStrategyId,
                sourceStrategyVersion: listing.sourceStrategyVersion,
            },
            stats: stats ? { views: stats.views, uniqueViews: stats.uniqueViews, likes: stats.likes, upVotes: stats.upVotes, downVotes: stats.downVotes, purchases: stats.purchases } : { views: 0, uniqueViews: 0, likes: 0, upVotes: 0, downVotes: 0, purchases: 0 },
        };
    });
    app.post("/listings/:listingId/view", async (req, reply) => {
        const { listingId } = req.params;
        const listing = await marketplaceListingsCol().findOne({ _id: listingId });
        if (!listing)
            return reply.code(404).send({ error: "Listing not found" });
        const now = new Date();
        const nowIso = now.toISOString();
        const day = nowIso.slice(0, 10);
        const user = await requireUser(app, req);
        const body = (req.body || {});
        const rawSessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
        const userKey = user?._id || (rawSessionId ? `s_${rawSessionId}` : `ip_${ipHash(req.ip)}`);
        const dedupeKey = `${listingId}_${day}_${userKey}`;
        let isUnique = false;
        try {
            await marketplaceListingViewsCol().insertOne({ _id: nanoid(), listingId, dedupeKey, createdAt: now });
            isUnique = true;
        }
        catch {
            isUnique = false;
        }
        const inc = { views: 1 };
        if (isUnique)
            inc.uniqueViews = 1;
        await marketplaceListingStatsCol().updateOne({ _id: listingId }, { $inc: inc, $set: { updatedAt: nowIso }, $setOnInsert: { _id: listingId, views: 0, uniqueViews: 0, likes: 0, upVotes: 0, downVotes: 0, purchases: 0 } }, { upsert: true });
        return { ok: true };
    });
    app.post("/listings/:listingId/like", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const { listingId } = req.params;
        const listing = await marketplaceListingsCol().findOne({ _id: listingId });
        if (!listing)
            return reply.code(404).send({ error: "Listing not found" });
        const nowIso = new Date().toISOString();
        const existing = await marketplaceListingInteractionsCol().findOne({ listingId, userId: user._id });
        const prevLiked = existing?.liked === true;
        const nextLiked = !prevLiked;
        await marketplaceListingInteractionsCol().updateOne({ listingId, userId: user._id }, {
            $set: { liked: nextLiked, vote: (existing?.vote ?? 0), updatedAt: nowIso },
            $setOnInsert: { _id: nanoid(), listingId, userId: user._id, createdAt: nowIso },
        }, { upsert: true });
        await marketplaceListingStatsCol().updateOne({ _id: listingId }, { $inc: { likes: nextLiked ? 1 : -1 }, $set: { updatedAt: nowIso }, $setOnInsert: { _id: listingId, views: 0, uniqueViews: 0, likes: 0, upVotes: 0, downVotes: 0, purchases: 0 } }, { upsert: true });
        return { liked: nextLiked };
    });
    app.post("/listings/:listingId/vote", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const { listingId } = req.params;
        const listing = await marketplaceListingsCol().findOne({ _id: listingId });
        if (!listing)
            return reply.code(404).send({ error: "Listing not found" });
        const body = (req.body || {});
        const vote = body.vote === 1 ? 1 : body.vote === -1 ? -1 : 0;
        const nowIso = new Date().toISOString();
        const existing = await marketplaceListingInteractionsCol().findOne({ listingId, userId: user._id });
        const prevVote = (existing?.vote ?? 0);
        const nextVote = vote;
        const inc = {};
        if (prevVote === 1)
            inc.upVotes = (inc.upVotes || 0) - 1;
        if (prevVote === -1)
            inc.downVotes = (inc.downVotes || 0) - 1;
        if (nextVote === 1)
            inc.upVotes = (inc.upVotes || 0) + 1;
        if (nextVote === -1)
            inc.downVotes = (inc.downVotes || 0) + 1;
        await marketplaceListingInteractionsCol().updateOne({ listingId, userId: user._id }, {
            $set: { vote: nextVote, liked: existing?.liked === true, updatedAt: nowIso },
            $setOnInsert: { _id: nanoid(), listingId, userId: user._id, createdAt: nowIso },
        }, { upsert: true });
        await marketplaceListingStatsCol().updateOne({ _id: listingId }, { $inc: inc, $set: { updatedAt: nowIso }, $setOnInsert: { _id: listingId, views: 0, uniqueViews: 0, likes: 0, upVotes: 0, downVotes: 0, purchases: 0 } }, { upsert: true });
        return { vote: nextVote };
    });
    app.post("/wallet/challenge", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const body = (req.body || {});
        const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";
        if (!walletAddress)
            return reply.code(400).send({ error: "walletAddress required" });
        let checksummed;
        try {
            checksummed = ethers.utils.getAddress(walletAddress);
        }
        catch {
            return reply.code(400).send({ error: "Invalid wallet address" });
        }
        const nonce = nanoid();
        const message = `Polyblocks Wallet Verification\nUser: ${user._id}\nWallet: ${checksummed}\nNonce: ${nonce}`;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
        await walletChallengesCol().insertOne({
            _id: nanoid(),
            userId: user._id,
            nonce,
            message,
            createdAt: now,
            expiresAt,
        });
        return { nonce, message };
    });
    app.post("/wallet/verify", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const body = (req.body || {});
        const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";
        const signature = typeof body.signature === "string" ? body.signature.trim() : "";
        const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
        if (!walletAddress || !signature || !nonce)
            return reply.code(400).send({ error: "walletAddress, signature, nonce required" });
        let checksummed;
        try {
            checksummed = ethers.utils.getAddress(walletAddress);
        }
        catch {
            return reply.code(400).send({ error: "Invalid wallet address" });
        }
        const challenge = await walletChallengesCol().findOne({ userId: user._id, nonce });
        if (!challenge)
            return reply.code(400).send({ error: "Challenge not found" });
        if (challenge.expiresAt < new Date()) {
            await walletChallengesCol().deleteOne({ _id: challenge._id });
            return reply.code(400).send({ error: "Challenge expired" });
        }
        let recovered;
        try {
            recovered = ethers.utils.verifyMessage(challenge.message, signature);
        }
        catch {
            return reply.code(400).send({ error: "Invalid signature" });
        }
        if (safeLowerHex(recovered) !== safeLowerHex(checksummed))
            return reply.code(400).send({ error: "Signature does not match wallet" });
        const nowIso = new Date().toISOString();
        await walletLinksCol().updateOne({ walletAddress: checksummed }, { $set: { userId: user._id, walletAddress: checksummed, verifiedAt: nowIso }, $setOnInsert: { _id: nanoid() } }, { upsert: true });
        await walletChallengesCol().deleteOne({ _id: challenge._id });
        return { verified: true, walletAddress: checksummed };
    });
    app.post("/listings", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const body = (req.body || {});
        const sourceStrategyId = typeof body.sourceStrategyId === "string" ? body.sourceStrategyId.trim() : "";
        if (!sourceStrategyId)
            return reply.code(400).send({ error: "sourceStrategyId required" });
        const strategy = await strategiesCol().findOne({ _id: sourceStrategyId });
        if (!strategy)
            return reply.code(404).send({ error: "Strategy not found" });
        if (strategy.userId !== user._id)
            return reply.code(403).send({ error: "Not strategy owner" });
        const now = new Date();
        const { startIso, nextIso } = getMonthWindow(now);
        const publishCount = await marketplaceListingsCol().countDocuments({
            ownerUserId: user._id,
            publishedAt: { $gte: startIso, $lt: nextIso },
        });
        const limit = user.tier === "pro" ? 5 : 1;
        if (publishCount >= limit) {
            return reply.code(403).send({ error: `Monthly publish limit reached (${limit})` });
        }
        const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : (strategy.name || "Untitled Strategy").slice(0, 80);
        const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : String(strategy.description || "").slice(0, 500);
        const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8) : [];
        const visibility = body.visibility === "unlisted" ? "unlisted" : "public";
        const priceUsdc = Number(body.priceUsdc);
        if (!Number.isFinite(priceUsdc) || priceUsdc <= 0)
            return reply.code(400).send({ error: "priceUsdc must be > 0" });
        const walletAddress = typeof body.creatorWalletAddress === "string" ? body.creatorWalletAddress.trim() : "";
        if (!walletAddress)
            return reply.code(400).send({ error: "creatorWalletAddress required" });
        let creatorWalletAddress;
        try {
            creatorWalletAddress = ethers.utils.getAddress(walletAddress);
        }
        catch {
            return reply.code(400).send({ error: "Invalid creatorWalletAddress" });
        }
        const walletLink = await walletLinksCol().findOne({ userId: user._id, walletAddress: creatorWalletAddress });
        if (!walletLink)
            return reply.code(400).send({ error: "Wallet not verified for this user" });
        const id = nanoid();
        const nowIso = now.toISOString();
        await marketplaceListingsCol().insertOne({
            _id: id,
            ownerUserId: user._id,
            sourceStrategyId,
            sourceStrategyVersion: Number(strategy.version) || 1,
            title,
            description,
            tags,
            status: "active",
            visibility,
            creatorWalletAddress,
            priceUsdc,
            chainId: POLYGON_CHAIN_ID,
            currency: "USDC",
            artifact: { nodes: Array.isArray(strategy.nodes) ? strategy.nodes : [], edges: Array.isArray(strategy.edges) ? strategy.edges : [] },
            createdAt: nowIso,
            updatedAt: nowIso,
            publishedAt: nowIso,
        });
        await marketplaceListingStatsCol().insertOne({
            _id: id,
            views: 0,
            uniqueViews: 0,
            likes: 0,
            upVotes: 0,
            downVotes: 0,
            purchases: 0,
            updatedAt: nowIso,
        });
        return { id };
    });
    app.post("/listings/:listingId/purchase", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const { listingId } = req.params;
        const listing = await marketplaceListingsCol().findOne({ _id: listingId });
        if (!listing)
            return reply.code(404).send({ error: "Listing not found" });
        if (listing.ownerUserId === user._id)
            return reply.code(400).send({ error: "Cannot purchase your own listing" });
        const id = nanoid();
        const nowIso = new Date().toISOString();
        await marketplacePurchasesCol().insertOne({
            _id: id,
            listingId,
            buyerUserId: user._id,
            sellerUserId: listing.ownerUserId,
            amountUsdc: listing.priceUsdc,
            chainId: listing.chainId,
            txHash: null,
            payerAddress: null,
            status: "pending",
            createdAt: nowIso,
            verifiedAt: null,
        });
        return {
            purchaseId: id,
            payment: {
                chainId: listing.chainId,
                currency: "USDC",
                tokenAddress: POLYGON_USDC_ADDRESS,
                to: listing.creatorWalletAddress,
                amountUsdc: listing.priceUsdc,
            },
        };
    });
    app.post("/purchases/:purchaseId/verify", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const { purchaseId } = req.params;
        const purchase = await marketplacePurchasesCol().findOne({ _id: purchaseId });
        if (!purchase)
            return reply.code(404).send({ error: "Purchase not found" });
        if (purchase.buyerUserId !== user._id)
            return reply.code(403).send({ error: "Not purchase owner" });
        if (purchase.status === "verified")
            return { verified: true };
        const body = (req.body || {});
        const txHash = typeof body.txHash === "string" ? body.txHash.trim() : "";
        if (!txHash)
            return reply.code(400).send({ error: "txHash required" });
        const listing = await marketplaceListingsCol().findOne({ _id: purchase.listingId });
        if (!listing)
            return reply.code(404).send({ error: "Listing not found" });
        const rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl, POLYGON_CHAIN_ID);
        let tx = null;
        let receipt = null;
        try {
            tx = await provider.getTransaction(txHash);
            receipt = await provider.getTransactionReceipt(txHash);
        }
        catch {
            tx = null;
            receipt = null;
        }
        if (!tx || !receipt)
            return reply.code(400).send({ error: "Transaction not found" });
        if (receipt.status !== 1)
            return reply.code(400).send({ error: "Transaction failed" });
        const match = findUsdcTransfer(receipt.logs, listing.creatorWalletAddress, purchase.amountUsdc);
        if (!match)
            return reply.code(400).send({ error: "Expected USDC transfer not found" });
        const payerAddress = match.payerAddress;
        const nowIso = new Date().toISOString();
        try {
            await marketplacePurchasesCol().updateOne({ _id: purchaseId }, { $set: { status: "verified", txHash, payerAddress, verifiedAt: nowIso } });
        }
        catch {
            return reply.code(400).send({ error: "Transaction already used" });
        }
        await marketplaceListingStatsCol().updateOne({ _id: purchase.listingId }, { $inc: { purchases: 1 }, $set: { updatedAt: nowIso }, $setOnInsert: { _id: purchase.listingId, views: 0, uniqueViews: 0, likes: 0, upVotes: 0, downVotes: 0, purchases: 0 } }, { upsert: true });
        return { verified: true };
    });
    app.get("/purchases", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const purchases = await marketplacePurchasesCol().find({ buyerUserId: user._id, status: "verified" }).sort({ createdAt: -1 }).limit(100).toArray();
        return {
            purchases: purchases.map((p) => ({
                id: p._id,
                listingId: p.listingId,
                amountUsdc: p.amountUsdc,
                chainId: p.chainId,
                txHash: p.txHash,
                verifiedAt: p.verifiedAt,
            })),
        };
    });
    app.post("/listings/:listingId/clone", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const { listingId } = req.params;
        const listing = await marketplaceListingsCol().findOne({ _id: listingId });
        if (!listing)
            return reply.code(404).send({ error: "Listing not found" });
        const isOwner = listing.ownerUserId === user._id;
        if (!isOwner) {
            const purchase = await marketplacePurchasesCol().findOne({ listingId, buyerUserId: user._id, status: "verified" });
            if (!purchase)
                return reply.code(403).send({ error: "Purchase required" });
        }
        const id = nanoid();
        const nowIso = new Date().toISOString();
        await strategiesCol().insertOne({
            _id: id,
            userId: user._id,
            name: `${listing.title} (Copy)`,
            description: listing.description || "",
            nodes: listing.artifact.nodes || [],
            edges: listing.artifact.edges || [],
            status: "draft",
            version: 1,
            createdAt: nowIso,
            updatedAt: nowIso,
        });
        return { strategyId: id };
    });
    app.post("/listings/:listingId/performance/compute", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const { listingId } = req.params;
        const listing = await marketplaceListingsCol().findOne({ _id: listingId });
        if (!listing)
            return reply.code(404).send({ error: "Listing not found" });
        if (listing.ownerUserId !== user._id)
            return reply.code(403).send({ error: "Not listing owner" });
        const trades = await paperTradesCol().find({ userId: user._id, strategyId: listing.sourceStrategyId }).sort({ executedAt: 1 }).limit(5000).toArray();
        const m = computeTradeMetrics(trades.map((t) => ({ side: t.side, price: t.price, size: t.size, tokenId: t.tokenId, executedAt: t.executedAt })));
        const nowIso = new Date().toISOString();
        const from = trades[0]?.executedAt || nowIso;
        const to = trades[trades.length - 1]?.executedAt || nowIso;
        await marketplaceVerifiedPerformanceCol().updateOne({ listingId }, {
            $set: {
                computedAt: nowIso,
                timeRange: { from, to },
                metrics: {
                    realizedPnlUsdc: m.realizedPnlUsdc,
                    roiPct: m.roiPct,
                    winRatePct: m.winRatePct,
                    maxDrawdownPct: m.maxDrawdownPct,
                    trades: m.trades,
                    volumeUsdc: m.volumeUsdc,
                },
                equityCurve: m.equityCurve,
            },
            $setOnInsert: { _id: nanoid(), listingId },
        }, { upsert: true });
        return { ok: true };
    });
    app.get("/listings/:listingId/performance", async (req, reply) => {
        const { listingId } = req.params;
        const listing = await marketplaceListingsCol().findOne({ _id: listingId });
        if (!listing)
            return reply.code(404).send({ error: "Listing not found" });
        const perf = await marketplaceVerifiedPerformanceCol().findOne({ listingId });
        if (!perf)
            return reply.code(404).send({ error: "No verified performance yet" });
        return {
            listingId,
            computedAt: perf.computedAt,
            timeRange: perf.timeRange,
            metrics: perf.metrics,
            equityCurve: perf.equityCurve,
        };
    });
    app.get("/verified", async () => {
        // Generate mock data if no real data exists
        const mockPerfs = Array.from({ length: 5 }).map((_, i) => ({
            listingId: `mock_${i}`,
            computedAt: new Date().toISOString(),
            timeRange: { from: new Date(Date.now() - 86400000 * 30).toISOString(), to: new Date().toISOString() },
            metrics: {
                realizedPnlUsdc: 150 + Math.random() * 500,
                roiPct: 15 + Math.random() * 20,
                winRatePct: 60 + Math.random() * 15,
                maxDrawdownPct: 5 + Math.random() * 10,
                trades: 20 + Math.floor(Math.random() * 50),
                volumeUsdc: 5000 + Math.random() * 10000,
            },
            equityCurve: Array.from({ length: 30 }).map((_, j) => ({
                t: new Date(Date.now() - (30 - j) * 86400000).toISOString(),
                v: 1000 + j * (10 + Math.random() * 20),
            })),
        }));
        const perfs = await marketplaceVerifiedPerformanceCol().find({}).sort({ computedAt: -1 }).limit(50).toArray();
        // Use mock data if database is empty
        const displayPerfs = perfs.length > 0 ? perfs : mockPerfs;
        const listingIds = displayPerfs.map((p) => p.listingId);
        let listings = await marketplaceListingsCol().find({ _id: { $in: listingIds }, status: "active", visibility: "public" }).toArray();
        // Mock listings for mock performance data
        if (perfs.length === 0) {
            for (const p of mockPerfs) {
                if (!listings.find(l => l._id === p.listingId)) {
                    listings.push({
                        _id: p.listingId,
                        title: `Profitable Strategy #${Math.floor(Math.random() * 1000)}`,
                        description: "A consistently profitable strategy focusing on high-volume markets.",
                        tags: ["Trend Following", "Low Risk"],
                        creatorWalletAddress: "0x123...abc",
                        priceUsdc: 50,
                        chainId: 137,
                        currency: "USDC",
                        publishedAt: new Date().toISOString(),
                        // @ts-ignore
                        ownerUserId: "mock_user",
                        // @ts-ignore
                        status: "active",
                        // @ts-ignore
                        visibility: "public",
                    });
                }
            }
        }
        const listingMap = new Map();
        for (const l of listings)
            listingMap.set(l._id, l);
        return {
            verified: displayPerfs
                .map((p) => {
                const l = listingMap.get(p.listingId);
                if (!l)
                    return null;
                return {
                    listing: {
                        id: l._id,
                        title: l.title,
                        description: l.description,
                        tags: l.tags,
                        creatorWalletAddress: l.creatorWalletAddress,
                        priceUsdc: l.priceUsdc,
                        chainId: l.chainId,
                        currency: l.currency,
                        publishedAt: l.publishedAt,
                    },
                    performance: {
                        computedAt: p.computedAt,
                        timeRange: p.timeRange,
                        metrics: p.metrics,
                        equityCurve: p.equityCurve.slice(-120),
                    },
                };
            })
                .filter(Boolean),
        };
    });
}
//# sourceMappingURL=marketplace.js.map