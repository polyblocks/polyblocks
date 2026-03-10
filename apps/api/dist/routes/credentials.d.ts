/**
 * Credentials routes — store and manage per-user Polymarket API credentials.
 * Private keys and API secrets are encrypted at rest with AES-256-GCM.
 * Stored in MongoDB (credentials collection, one doc per user).
 */
import type { FastifyInstance } from "fastify";
export interface ApprovalResult {
    success: boolean;
    approvals: string[];
    errors: string[];
    gasUsed?: string;
}
/**
 * Ensure all required token approvals are set for an EOA wallet to trade on Polymarket.
 *
 * Required approvals:
 *   1. USDC.e → CTF Exchange           (for buying on standard markets)
 *   2. USDC.e → Neg Risk CTF Exchange   (for buying on neg-risk markets)
 *   3. CTF (ERC1155) → CTF Exchange     (for selling conditional tokens)
 *   4. CTF (ERC1155) → Neg Risk CTF Exchange (for selling on neg-risk markets)
 *   5. CTF (ERC1155) → Neg Risk Adapter (for neg-risk conversions)
 *
 * Skips any approval that is already set. Returns a summary of what was approved.
 */
export declare function ensureApprovals(privateKey: string): Promise<ApprovalResult>;
export interface StoredCredentials {
    privateKey: string;
    apiKey: string;
    apiSecret: string;
    passphrase: string;
    signatureType: number;
    funderAddress: string;
    isConfigured: boolean;
}
export declare function getCredentials(userId?: string): Promise<StoredCredentials>;
export declare function registerCredentialRoutes(app: FastifyInstance): Promise<void>;
//# sourceMappingURL=credentials.d.ts.map