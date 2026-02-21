/**
 * MongoDB connection + typed collection accessors.
 *
 * Collections:
 *   - users        — user accounts (Google + email/password)
 *   - sessions     — login sessions (auto-expire via TTL index)
 *   - strategies   — saved strategy graphs per user
 *   - credentials  — encrypted Polymarket API credentials per user
 */
import { type Db, type Collection } from "mongodb";
export interface DbUser {
    _id: string;
    email: string;
    name: string;
    avatar: string;
    tier: "free" | "pro";
    subscribedAt: string | null;
    expiresAt: string | null;
    googleId: string;
    passwordHash: string;
    createdAt: string;
    verified?: boolean;
    verificationCode?: string;
    verificationCodeExpiresAt?: Date;
    hasUsedTrial?: boolean;
    proTxHash?: string;
}
export interface DbSession {
    _id: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
}
export interface DbStrategy {
    _id: string;
    userId: string;
    name: string;
    description: string;
    nodes: unknown[];
    edges: unknown[];
    status: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    [key: string]: unknown;
}
export interface DbCredentials {
    _id: string;
    userId: string;
    privateKey: string;
    apiKey: string;
    apiSecret: string;
    passphrase: string;
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
    timeRange: {
        from: string;
        to: string;
    };
    metrics: {
        realizedPnlUsdc: number;
        roiPct: number;
        winRatePct: number;
        maxDrawdownPct: number;
        trades: number;
        volumeUsdc: number;
    };
    equityCurve: Array<{
        t: string;
        v: number;
    }>;
}
export declare function connectDb(): Promise<Db>;
export declare function getDb(): Db;
export declare function usersCol(): Collection<DbUser>;
export declare function sessionsCol(): Collection<DbSession>;
export declare function strategiesCol(): Collection<DbStrategy>;
export declare function credentialsCol(): Collection<DbCredentials>;
export declare function paperTradesCol(): Collection<DbPaperTrade>;
export declare function executionLogsCol(): Collection<DbExecutionLog>;
export declare function marketplaceListingsCol(): Collection<DbMarketplaceListing>;
export declare function marketplaceListingStatsCol(): Collection<DbMarketplaceListingStats>;
export declare function marketplaceListingInteractionsCol(): Collection<DbMarketplaceListingInteraction>;
export declare function marketplaceListingViewsCol(): Collection<DbMarketplaceListingView>;
export declare function marketplacePurchasesCol(): Collection<DbMarketplacePurchase>;
export declare function walletChallengesCol(): Collection<DbWalletChallenge>;
export declare function walletLinksCol(): Collection<DbWalletLink>;
export declare function marketplaceVerifiedPerformanceCol(): Collection<DbMarketplaceVerifiedPerformance>;
//# sourceMappingURL=db.d.ts.map