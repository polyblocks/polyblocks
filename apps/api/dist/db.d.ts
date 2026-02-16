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
export declare function connectDb(): Promise<Db>;
export declare function getDb(): Db;
export declare function usersCol(): Collection<DbUser>;
export declare function sessionsCol(): Collection<DbSession>;
export declare function strategiesCol(): Collection<DbStrategy>;
export declare function credentialsCol(): Collection<DbCredentials>;
//# sourceMappingURL=db.d.ts.map