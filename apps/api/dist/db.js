/**
 * MongoDB connection + typed collection accessors.
 *
 * Collections:
 *   - users        — user accounts (Google + email/password)
 *   - sessions     — login sessions (auto-expire via TTL index)
 *   - strategies   — saved strategy graphs per user
 *   - credentials  — encrypted Polymarket API credentials per user
 */
import { MongoClient } from "mongodb";
// ── Singleton client / db ───────────────────────────────────────────────────
let client;
let db;
export async function connectDb() {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/polyblocks";
    client = new MongoClient(uri, {
        // Node.js 24+ uses OpenSSL 3.x with stricter TLS defaults.
        // MongoDB Atlas free-tier may need a wider min TLS version.
        tls: uri.startsWith("mongodb+srv"),
        // 30-second timeout so Heroku doesn't die waiting
        serverSelectionTimeoutMS: 30_000,
        connectTimeoutMS: 30_000,
    });
    await client.connect();
    db = client.db();
    // Create indexes (idempotent — safe to call every startup)
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("users").createIndex({ googleId: 1 }, { sparse: true });
    await db.collection("strategies").createIndex({ userId: 1 });
    await db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection("credentials").createIndex({ userId: 1 }, { unique: true });
    await db.collection("paperTrades").createIndex({ userId: 1, strategyId: 1 });
    await db.collection("executionLogs").createIndex({ userId: 1, strategyId: 1 });
    await db.collection("marketplaceListings").createIndex({ ownerUserId: 1, publishedAt: -1 });
    await db.collection("marketplaceListings").createIndex({ status: 1, publishedAt: -1 });
    await db.collection("marketplaceListingStats").createIndex({ updatedAt: -1 });
    await db.collection("marketplaceListingInteractions").createIndex({ listingId: 1, userId: 1 }, { unique: true });
    await db.collection("marketplaceListingViews").createIndex({ listingId: 1, createdAt: -1 });
    await db.collection("marketplaceListingViews").createIndex({ dedupeKey: 1 }, { unique: true });
    await db.collection("marketplacePurchases").createIndex({ buyerUserId: 1, createdAt: -1 });
    await db.collection("marketplacePurchases").createIndex({ txHash: 1, chainId: 1 }, { unique: true, sparse: true });
    await db.collection("walletChallenges").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection("walletLinks").createIndex({ walletAddress: 1 }, { unique: true });
    await db.collection("walletLinks").createIndex({ userId: 1 });
    await db.collection("marketplaceVerifiedPerformance").createIndex({ listingId: 1 }, { unique: true });
    console.log("✅ Connected to MongoDB");
    return db;
}
export function getDb() {
    if (!db)
        throw new Error("Database not connected. Call connectDb() first.");
    return db;
}
// ── Typed collection helpers ────────────────────────────────────────────────
export function usersCol() {
    return getDb().collection("users");
}
export function sessionsCol() {
    return getDb().collection("sessions");
}
export function strategiesCol() {
    return getDb().collection("strategies");
}
export function credentialsCol() {
    return getDb().collection("credentials");
}
export function paperTradesCol() {
    return getDb().collection("paperTrades");
}
export function executionLogsCol() {
    return getDb().collection("executionLogs");
}
export function marketplaceListingsCol() {
    return getDb().collection("marketplaceListings");
}
export function marketplaceListingStatsCol() {
    return getDb().collection("marketplaceListingStats");
}
export function marketplaceListingInteractionsCol() {
    return getDb().collection("marketplaceListingInteractions");
}
export function marketplaceListingViewsCol() {
    return getDb().collection("marketplaceListingViews");
}
export function marketplacePurchasesCol() {
    return getDb().collection("marketplacePurchases");
}
export function walletChallengesCol() {
    return getDb().collection("walletChallenges");
}
export function walletLinksCol() {
    return getDb().collection("walletLinks");
}
export function marketplaceVerifiedPerformanceCol() {
    return getDb().collection("marketplaceVerifiedPerformance");
}
//# sourceMappingURL=db.js.map