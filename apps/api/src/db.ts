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

export interface DbPaperTrade {
  _id: string;
  userId: string;
  strategyId: string;
  marketConditionId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  executedAt: string;
  originNodeId: string;
}

export interface DbExecutionLog {
  _id: string;
  userId: string;
  strategyId: string;
  log: unknown;
  createdAt: string;
}

export interface DbMarketplaceListing {
  _id: string;
  ownerUserId: string;
  sourceStrategyId: string;
  sourceStrategyVersion: number;
  title: string;
  description: string;
  tags: string[];
  status: "active" | "paused" | "delisted";
  visibility: "public" | "unlisted";
  creatorWalletAddress: string;
  priceUsdc: number;
  chainId: number;
  currency: "USDC";
  estimatedRoiPct?: number;
  estimatedWinRatePct?: number;
  artifact: {
    nodes: unknown[];
    edges: unknown[];
  };
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

export interface DbMarketplaceListingStats {
  _id: string;
  views: number;
  uniqueViews: number;
  likes: number;
  upVotes: number;
  downVotes: number;
  purchases: number;
  updatedAt: string;
}

export interface DbMarketplaceListingInteraction {
  _id: string;
  listingId: string;
  userId: string;
  liked: boolean;
  vote: -1 | 0 | 1;
  createdAt: string;
  updatedAt: string;
}

export interface DbMarketplaceListingView {
  _id: string;
  listingId: string;
  dedupeKey: string;
  createdAt: Date;
}

export interface DbMarketplacePurchase {
  _id: string;
  listingId: string;
  buyerUserId: string;
  sellerUserId: string;
  amountUsdc: number;
  chainId: number;
  txHash: string | null;
  payerAddress: string | null;
  status: "pending" | "verified" | "failed";
  createdAt: string;
  verifiedAt: string | null;
  clonedStrategyId?: string | null;
}

export interface DbWalletChallenge {
  _id: string;
  userId: string;
  nonce: string;
  message: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface DbWalletLink {
  _id: string;
  userId: string;
  walletAddress: string;
  verifiedAt: string;
}

export interface DbMarketplaceVerifiedPerformance {
  _id: string;
  listingId: string;
  computedAt: string;
  timeRange: { from: string; to: string };
  metrics: {
    realizedPnlUsdc: number;
    roiPct: number;
    winRatePct: number;
    maxDrawdownPct: number;
    trades: number;
    volumeUsdc: number;
  };
  equityCurve: Array<{ t: string; v: number }>;
}

// ── Singleton client / db ───────────────────────────────────────────────────

let client: MongoClient;
let db: Db;

export async function connectDb(): Promise<Db> {
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
  await db.collection("sessions").createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },          // MongoDB TTL — auto-deletes expired sessions
  );
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

export function paperTradesCol(): Collection<DbPaperTrade> {
  return getDb().collection<DbPaperTrade>("paperTrades");
}

export function executionLogsCol(): Collection<DbExecutionLog> {
  return getDb().collection<DbExecutionLog>("executionLogs");
}

export function marketplaceListingsCol(): Collection<DbMarketplaceListing> {
  return getDb().collection<DbMarketplaceListing>("marketplaceListings");
}

export function marketplaceListingStatsCol(): Collection<DbMarketplaceListingStats> {
  return getDb().collection<DbMarketplaceListingStats>("marketplaceListingStats");
}

export function marketplaceListingInteractionsCol(): Collection<DbMarketplaceListingInteraction> {
  return getDb().collection<DbMarketplaceListingInteraction>("marketplaceListingInteractions");
}

export function marketplaceListingViewsCol(): Collection<DbMarketplaceListingView> {
  return getDb().collection<DbMarketplaceListingView>("marketplaceListingViews");
}

export function marketplacePurchasesCol(): Collection<DbMarketplacePurchase> {
  return getDb().collection<DbMarketplacePurchase>("marketplacePurchases");
}

export function walletChallengesCol(): Collection<DbWalletChallenge> {
  return getDb().collection<DbWalletChallenge>("walletChallenges");
}

export function walletLinksCol(): Collection<DbWalletLink> {
  return getDb().collection<DbWalletLink>("walletLinks");
}

export function marketplaceVerifiedPerformanceCol(): Collection<DbMarketplaceVerifiedPerformance> {
  return getDb().collection<DbMarketplaceVerifiedPerformance>("marketplaceVerifiedPerformance");
}
