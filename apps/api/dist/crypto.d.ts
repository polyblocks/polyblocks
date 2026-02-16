/**
 * AES-256-GCM encryption helpers for storing sensitive credentials in MongoDB.
 *
 * CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
/**
 * Encrypt a plaintext string.  Returns "iv:authTag:ciphertext" (all hex).
 */
export declare function encrypt(text: string): string;
/**
 * Decrypt a string previously encrypted with encrypt().
 */
export declare function decrypt(data: string): string;
//# sourceMappingURL=crypto.d.ts.map