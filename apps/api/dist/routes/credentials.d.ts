/**
 * Credentials routes — store and manage per-user Polymarket API credentials.
 * Private keys and API secrets are encrypted at rest with AES-256-GCM.
 * Stored in MongoDB (credentials collection, one doc per user).
 */
import type { FastifyInstance } from "fastify";
export interface StoredCredentials {
    privateKey: string;
    apiKey: string;
    apiSecret: string;
    passphrase: string;
    signatureType: number;
    funderAddress: string;
    isConfigured: boolean;
}
/**
 * Retrieve decrypted credentials for a given userId.
 * Falls back to "default" userId for backward-compatibility with single-user mode.
 */
export declare function getCredentials(userId?: string): Promise<StoredCredentials>;
export declare function registerCredentialRoutes(app: FastifyInstance): Promise<void>;
//# sourceMappingURL=credentials.d.ts.map