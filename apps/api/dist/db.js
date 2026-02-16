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
    client = new MongoClient(uri);
    await client.connect();
    db = client.db();
    // Create indexes (idempotent — safe to call every startup)
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("users").createIndex({ googleId: 1 }, { sparse: true });
    await db.collection("strategies").createIndex({ userId: 1 });
    await db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection("credentials").createIndex({ userId: 1 }, { unique: true });
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
//# sourceMappingURL=db.js.map