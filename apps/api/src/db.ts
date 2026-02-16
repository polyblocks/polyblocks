/**
 * MongoDB connection + typed collection accessors.
 *
 * Collections:
 *   - users        — user accounts (Google + email/password)
 *   - sessions     — login sessions (auto-expire via TTL index)
 *   - strategies   — saved strategy graphs per user
 *   - credentials  — encrypted Polymarket API credentials per user
 */

import { MongoClient, type Db, type Collection } from "mongodb";

// ── Document types ──────────────────────────────────────────────────────────

export interface DbUser {
  _id: string;                         // our generated userId
  email: string;
  name: string;
  avatar: string;
  tier: "free" | "pro";
  subscribedAt: string | null;
  expiresAt: string | null;
  googleId: string;                    // empty string for email-only users
  passwordHash: string;                // empty string for Google-only users
  createdAt: string;
}

export interface DbSession {
  _id: string;                         // session token
  userId: string;
  createdAt: Date;
  expiresAt: Date;                     // TTL index auto-deletes expired docs
}

export interface DbStrategy {
  _id: string;                         // strategy id
  userId: string;                      // owner
  name: string;
  description: string;
  nodes: unknown[];
  edges: unknown[];
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;              // allow extra StrategyGraph fields
}

export interface DbCredentials {
  _id: string;                         // same as userId (one doc per user)
  userId: string;
  privateKey: string;                  // encrypted
  apiKey: string;                      // encrypted
  apiSecret: string;                   // encrypted
  passphrase: string;                  // encrypted
  signatureType: number;
  funderAddress: string;
  isConfigured: boolean;
}

// ── Singleton client / db ───────────────────────────────────────────────────

let client: MongoClient;
let db: Db;

export async function connectDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/polyblocks";
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();

  // Create indexes (idempotent — safe to call every startup)
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("users").createIndex({ googleId: 1 }, { sparse: true });
  await db.collection("strategies").createIndex({ userId: 1 });
  await db.collection("sessions").createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },          // MongoDB TTL — auto-deletes expired sessions
  );
  await db.collection("credentials").createIndex({ userId: 1 }, { unique: true });

  console.log("✅ Connected to MongoDB");
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("Database not connected. Call connectDb() first.");
  return db;
}

// ── Typed collection helpers ────────────────────────────────────────────────

export function usersCol(): Collection<DbUser> {
  return getDb().collection<DbUser>("users");
}

export function sessionsCol(): Collection<DbSession> {
  return getDb().collection<DbSession>("sessions");
}

export function strategiesCol(): Collection<DbStrategy> {
  return getDb().collection<DbStrategy>("strategies");
}

export function credentialsCol(): Collection<DbCredentials> {
  return getDb().collection<DbCredentials>("credentials");
}
