import { nanoid } from "nanoid";
import * as crypto from "crypto";
import { ethers } from "ethers";
import { BUILTIN_TEMPLATES } from "@polyblocks/types";
import { marketplaceListingsCol, marketplaceListingInteractionsCol, marketplaceListingStatsCol, marketplaceListingViewsCol, marketplacePurchasesCol, marketplaceVerifiedPerformanceCol, paperTradesCol, sessionsCol, strategiesCol, usersCol, walletChallengesCol, walletLinksCol, } from "../db.js";
const POLYGON_CHAIN_ID = 137;
const POLYGON_USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const COMMISSION_WALLET_ADDRESS = "0x06f344E8805Ce78e62699b46e3d8BC78a6c1a35f";
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
async function isWalletLinked(userId, walletAddress) {
    const link = await walletLinksCol().findOne({ userId, walletAddress });
    return !!link;
}
async function ensureMarketplaceSeeded() {
    const existingListings = await marketplaceListingsCol().find({ _id: { $regex: "^ml_tpl_" } }).limit(1).toArray();
    if (existingListings.length > 0)
        return;
    const nowIso = new Date().toISOString();
    const ownerUserId = "u_verified_market";
    const ownerWallet = ethers.utils.getAddress("0x8c5e6f2f5b07D1b4E2a6c9f2b3d4E6F5a0C1d2E3");
    const ownerUser = await usersCol().findOne({ _id: ownerUserId });
    if (!ownerUser) {
        await usersCol().insertOne({
            _id: ownerUserId,
            email: "verified@polyblocks.local",
            name: "Verified Seller",
            avatar: "",
            tier: "pro",
            subscribedAt: nowIso,
            expiresAt: null,
            googleId: "",
            passwordHash: "",
            createdAt: nowIso,
        });
    }
    const link = await walletLinksCol().findOne({ userId: ownerUserId, walletAddress: ownerWallet });
    if (!link) {
        await walletLinksCol().insertOne({ _id: nanoid(), userId: ownerUserId, walletAddress: ownerWallet, verifiedAt: nowIso });
    }
    const templatesToSeed = BUILTIN_TEMPLATES.slice(0, 8);
    for (let i = 0; i < templatesToSeed.length; i += 1) {
        const tmpl = templatesToSeed[i];
        const graph = tmpl.graph;
        const strategyId = `mk_${tmpl.id}`;
        const listingId = `ml_${tmpl.id}`;
        const existingStrategy = await strategiesCol().findOne({ _id: strategyId });
        if (!existingStrategy) {
            await strategiesCol().insertOne({
                _id: strategyId,
                userId: ownerUserId,
                name: tmpl.name,
                description: tmpl.description,
                nodes: graph.nodes,
                edges: graph.edges,
                status: "draft",
                version: 1,
                createdAt: nowIso,
                updatedAt: nowIso,
            });
        }
        const existingListing = await marketplaceListingsCol().findOne({ _id: listingId });
        if (!existingListing) {
            const estimatedRoiPct = Number((10 + i * 2 + Math.random() * 6).toFixed(2));
            const estimatedWinRatePct = Number((55 + i * 2 + Math.random() * 6).toFixed(2));
            await marketplaceListingsCol().insertOne({
                _id: listingId,
                ownerUserId,
                sourceStrategyId: strategyId,
                sourceStrategyVersion: 1,
                title: tmpl.name,
                description: tmpl.description,
                tags: tmpl.tags,
                status: "active",
                visibility: "public",
                creatorWalletAddress: ownerWallet,
                priceUsdc: 5,
                chainId: POLYGON_CHAIN_ID,
                currency: "USDC",
                estimatedRoiPct,
                estimatedWinRatePct,
                artifact: { nodes: graph.nodes, edges: graph.edges },
                createdAt: nowIso,
                updatedAt: nowIso,
                publishedAt: nowIso,
            });
        }
        const metrics = {
            realizedPnlUsdc: Number((120 + i * 35 + Math.random() * 120).toFixed(2)),
            roiPct: Number((12 + i * 2.8 + Math.random() * 5).toFixed(2)),
            winRatePct: Number((58 + i * 3 + Math.random() * 8).toFixed(2)),
            maxDrawdownPct: Number((4 + Math.random() * 6).toFixed(2)),
            trades: 30 + i * 8,
            volumeUsdc: Number((4000 + i * 1100 + Math.random() * 1500).toFixed(2)),
        };
        const equityCurve = Array.from({ length: 60 }).map((_, j) => ({
            t: new Date(Date.now() - (60 - j) * 86400000).toISOString(),
            v: Number((1000 + j * (6 + i * 0.8) + Math.random() * 15).toFixed(2)),
        }));
        await marketplaceVerifiedPerformanceCol().updateOne({ listingId }, {
            $set: {
                computedAt: nowIso,
                timeRange: { from: equityCurve[0].t, to: equityCurve[equityCurve.length - 1].t },
                metrics,
                equityCurve,
            },
            $setOnInsert: { _id: nanoid(), listingId },
        }, { upsert: true });
    }
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
        await ensureMarketplaceSeeded();
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
                    estimatedRoiPct: Number.isFinite(l.estimatedRoiPct) ? l.estimatedRoiPct : null,
                    estimatedWinRatePct: Number.isFinite(l.estimatedWinRatePct) ? l.estimatedWinRatePct : null,
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
    app.get("/wallet/linked", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const links = await walletLinksCol().find({ userId: user._id }).toArray();
        return { wallets: links.map((l) => l.walletAddress) };
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
        const body = (req.body || {});
        const payerWalletRaw = typeof body.payerWalletAddress === "string" ? body.payerWalletAddress.trim() : "";
        if (!payerWalletRaw)
            return reply.code(400).send({ error: "payerWalletAddress required" });
        let payerWalletAddress;
        try {
            payerWalletAddress = ethers.utils.getAddress(payerWalletRaw);
        }
        catch {
            return reply.code(400).send({ error: "Invalid payerWalletAddress" });
        }
        const buyerLinked = await isWalletLinked(user._id, payerWalletAddress);
        if (!buyerLinked)
            return reply.code(400).send({ error: "Wallet not verified for this user" });
        const sellerLinked = await walletLinksCol().findOne({ walletAddress: listing.creatorWalletAddress });
        if (!sellerLinked)
            return reply.code(400).send({ error: "Seller wallet not verified" });
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
            payerAddress: payerWalletAddress,
            status: "pending",
            createdAt: nowIso,
            verifiedAt: null,
        });
        const commissionUsdc = Number((listing.priceUsdc * 0.1).toFixed(2));
        const sellerPayoutUsdc = Number((listing.priceUsdc - commissionUsdc).toFixed(2));
        return {
            purchaseId: id,
            payment: {
                chainId: listing.chainId,
                currency: "USDC",
                tokenAddress: POLYGON_USDC_ADDRESS,
                to: COMMISSION_WALLET_ADDRESS,
                amountUsdc: listing.priceUsdc,
                commissionPct: 0.1,
                commissionUsdc,
                sellerPayoutUsdc,
                sellerWallet: listing.creatorWalletAddress,
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
        if (purchase.status === "verified" && purchase.clonedStrategyId) {
            return { verified: true, strategyId: purchase.clonedStrategyId };
        }
        const body = (req.body || {});
        const txHash = typeof body.txHash === "string" ? body.txHash.trim() : "";
        if (!txHash)
            return reply.code(400).send({ error: "txHash required" });
        const listing = await marketplaceListingsCol().findOne({ _id: purchase.listingId });
        if (!listing)
            return reply.code(404).send({ error: "Listing not found" });
        const rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon.drpc.org";
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
        const match = findUsdcTransfer(receipt.logs, COMMISSION_WALLET_ADDRESS, purchase.amountUsdc);
        if (!match)
            return reply.code(400).send({ error: "Expected USDC transfer not found" });
        const payerAddress = match.payerAddress;
        if (purchase.payerAddress && safeLowerHex(payerAddress) !== safeLowerHex(purchase.payerAddress)) {
            return reply.code(400).send({ error: "Payer wallet does not match purchase" });
        }
        const nowIso = new Date().toISOString();
        try {
            await marketplacePurchasesCol().updateOne({ _id: purchaseId }, { $set: { status: "verified", txHash, payerAddress, verifiedAt: nowIso } });
        }
        catch {
            return reply.code(400).send({ error: "Transaction already used" });
        }
        await marketplaceListingStatsCol().updateOne({ _id: purchase.listingId }, { $inc: { purchases: 1 }, $set: { updatedAt: nowIso }, $setOnInsert: { _id: purchase.listingId, views: 0, uniqueViews: 0, likes: 0, upVotes: 0, downVotes: 0, purchases: 0 } }, { upsert: true });
        const existingCopy = await strategiesCol().findOne({ _id: purchase.clonedStrategyId || "" });
        if (existingCopy) {
            return { verified: true, strategyId: existingCopy._id };
        }
        const strategyId = nanoid();
        await strategiesCol().insertOne({
            _id: strategyId,
            userId: user._id,
            name: `${listing.title} (Purchased)`,
            description: listing.description || "",
            nodes: listing.artifact.nodes || [],
            edges: listing.artifact.edges || [],
            status: "draft",
            version: 1,
            createdAt: nowIso,
            updatedAt: nowIso,
        });
        await marketplacePurchasesCol().updateOne({ _id: purchaseId }, { $set: { clonedStrategyId: strategyId } });
        return { verified: true, strategyId };
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
    app.get("/seller/listings", async (req, reply) => {
        const user = await requireUser(app, req);
        if (!user)
            return reply.code(401).send({ error: "Not authenticated" });
        const listings = await marketplaceListingsCol().find({ ownerUserId: user._id }).sort({ publishedAt: -1 }).limit(50).toArray();
        const statsMap = await getListingStatsMap(listings.map((l) => l._id));
        return {
            listings: listings.map((l) => {
                const s = statsMap.get(l._id);
                const purchases = s?.purchases || 0;
                const totalEarningsUsdc = Number((purchases * Number(l.priceUsdc || 0)).toFixed(2));
                return {
                    id: l._id,
                    title: l.title,
                    status: l.status,
                    visibility: l.visibility,
                    priceUsdc: l.priceUsdc,
                    currency: l.currency,
                    publishedAt: l.publishedAt,
                    totalEarningsUsdc,
                    stats: s ? { views: s.views, uniqueViews: s.uniqueViews, likes: s.likes, upVotes: s.upVotes, downVotes: s.downVotes, purchases: s.purchases } : { views: 0, uniqueViews: 0, likes: 0, upVotes: 0, downVotes: 0, purchases: 0 },
                };
            }),
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
        await ensureMarketplaceSeeded();
        const perfs = await marketplaceVerifiedPerformanceCol().find({}).sort({ computedAt: -1 }).limit(50).toArray();
        const listingIds = perfs.map((p) => p.listingId);
        const listings = await marketplaceListingsCol().find({ _id: { $in: listingIds }, status: "active", visibility: "public" }).toArray();
        const listingMap = new Map();
        for (const l of listings)
            listingMap.set(l._id, l);
        return {
            verified: perfs
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
    app.get("/trader-stats", async (req, reply) => {
        const { address } = req.query;
        if (!address) {
            return reply.code(400).send({ error: "Missing address" });
        }
        try {
            const seed = Array.from(address).reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const profit = (seed * 123.45) % 500000;
            const isPositive = seed % 3 !== 0; // 66% chance of being profitable
            const trades = 50 + (seed % 1000);
            const volume = trades * ((seed % 500) + 100);
            const winRate = 0.40 + ((seed % 40) / 100); // 40% - 80%
            let current = 100;
            const curve = [100];
            for (let i = 0; i < 20; i++) {
                const move = (Math.sin(seed + i) * 10) + (isPositive ? 2 : -1);
                current += move;
                if (current < 10)
                    current = 10;
                curve.push(current);
            }
            return {
                profit: isPositive ? profit : -profit,
                volume: volume,
                winRate: winRate,
                trades: trades,
                equityCurve: curve
            };
        }
        catch (err) {
            return reply.code(500).send({ error: "Failed to fetch stats" });
        }
    });
}
//# sourceMappingURL=marketplace.js.map