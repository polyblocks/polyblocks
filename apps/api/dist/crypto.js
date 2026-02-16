/**
 * AES-256-GCM encryption helpers for storing sensitive credentials in MongoDB.
 *
 * CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
const ALGO = "aes-256-gcm";
function getKey() {
    const hex = process.env.CREDENTIALS_ENCRYPTION_KEY || "";
    if (hex.length !== 64) {
        throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). " +
            "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    }
    return Buffer.from(hex, "hex");
}
/**
 * Encrypt a plaintext string.  Returns "iv:authTag:ciphertext" (all hex).
 */
export function encrypt(text) {
    const key = getKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGO, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${tag}:${encrypted}`;
}
/**
 * Decrypt a string previously encrypted with encrypt().
 */
export function decrypt(data) {
    const key = getKey();
    const [ivHex, tagHex, encrypted] = data.split(":");
    if (!ivHex || !tagHex || !encrypted) {
        throw new Error("Invalid encrypted data format");
    }
    const iv = Buffer.from(ivHex, "hex");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}
//# sourceMappingURL=crypto.js.map