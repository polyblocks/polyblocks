/**
 * Credentials routes — store and manage per-user Polymarket API credentials.
 * Private keys and API secrets are encrypted at rest with AES-256-GCM.
 * Stored in MongoDB (credentials collection, one doc per user).
 */
import { ClobClient } from "@polymarket/clob-client";
import { Wallet, ethers } from "ethers";
import { credentialsCol, sessionsCol } from "../db.js";
import { encrypt, decrypt } from "../crypto.js";
import { getPolygonProvider, getGasOverrides } from "../rpc.js";
// ── Polygon Contract Addresses ──────────────────────────────────────────────
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a";
const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";
const MAX_UINT256 = ethers.constants.MaxUint256;
const ERC20_ABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
];
const ERC1155_ABI = [
    "function isApprovedForAll(address account, address operator) view returns (bool)",
    "function setApprovalForAll(address operator, bool approved)",
];
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
export async function ensureApprovals(privateKey) {
    const provider = await getPolygonProvider();
    const signer = new ethers.Wallet(privateKey, provider);
    const address = signer.address;
    const maticBalance = await provider.getBalance(address);
    if (maticBalance.eq(0)) {
        return {
            success: false,
            approvals: [],
            errors: ["No POL/MATIC for gas. Fund the wallet with a small amount of POL on Polygon first."],
        };
    }
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
    const ctf = new ethers.Contract(CTF_ADDRESS, ERC1155_ABI, signer);
    const gasOverrides = await getGasOverrides(provider);
    const approvals = [];
    const errors = [];
    // ── ERC-20 USDC.e approvals ───────────────────────────────────────────────
    const erc20Spenders = [
        [CTF_EXCHANGE, "CTF Exchange"],
        [NEG_RISK_CTF_EXCHANGE, "Neg Risk CTF Exchange"],
    ];
    for (const [spender, label] of erc20Spenders) {
        try {
            const current = await usdc.allowance(address, spender);
            // Consider "sufficient" if allowance > 1 billion USDC (raw wei = 1e15).
            // This avoids re-approving on every call.
            if (current.gt(ethers.BigNumber.from("1000000000000000"))) {
                approvals.push(`USDC → ${label}: already approved`);
                continue;
            }
            console.log(`[Approve] Setting USDC.e allowance for ${label} (${spender})...`);
            const tx = await usdc.approve(spender, MAX_UINT256, gasOverrides);
            await tx.wait();
            approvals.push(`USDC → ${label}: approved (tx: ${tx.hash})`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`USDC → ${label}: ${msg}`);
        }
    }
    // ── ERC-1155 CTF (conditional token) approvals ────────────────────────────
    const erc1155Operators = [
        [CTF_EXCHANGE, "CTF Exchange"],
        [NEG_RISK_CTF_EXCHANGE, "Neg Risk CTF Exchange"],
        [NEG_RISK_ADAPTER, "Neg Risk Adapter"],
    ];
    for (const [operator, label] of erc1155Operators) {
        try {
            const isApproved = await ctf.isApprovedForAll(address, operator);
            if (isApproved) {
                approvals.push(`CTF → ${label}: already approved`);
                continue;
            }
            console.log(`[Approve] Setting CTF approval for ${label} (${operator})...`);
            const tx = await ctf.setApprovalForAll(operator, true, gasOverrides);
            await tx.wait();
            approvals.push(`CTF → ${label}: approved (tx: ${tx.hash})`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`CTF → ${label}: ${msg}`);
        }
    }
    return {
        success: errors.length === 0,
        approvals,
        errors,
    };
}
/**
 * Retrieve decrypted credentials for a given userId.
 * Falls back to "default" userId for backward-compatibility with single-user mode.
 */
function getSessionToken(headers) {
    const token = headers["x-session-token"];
    return typeof token === "string" ? token : "";
}
async function resolveSession(token) {
    if (!token)
        return null;
    const session = await sessionsCol().findOne({ _id: token });
    if (!session)
        return null;
    if (session.expiresAt < new Date()) {
        await sessionsCol().deleteOne({ _id: token });
        return null;
    }
    return session.userId;
}
export async function getCredentials(userId) {
    if (!userId) {
        return {
            privateKey: "",
            apiKey: "",
            apiSecret: "",
            passphrase: "",
            signatureType: 0,
            funderAddress: "",
            isConfigured: false,
        };
    }
    let doc = await credentialsCol().findOne({ userId });
    if (!doc) {
        doc = await credentialsCol().findOne({ _id: userId });
    }
    if (!doc || !doc.isConfigured) {
        return {
            privateKey: "",
            apiKey: "",
            apiSecret: "",
            passphrase: "",
            signatureType: 0,
            funderAddress: "",
            isConfigured: false,
        };
    }
    return {
        privateKey: decrypt(doc.privateKey),
        apiKey: decrypt(doc.apiKey),
        apiSecret: decrypt(doc.apiSecret),
        passphrase: decrypt(doc.passphrase),
        signatureType: doc.signatureType,
        funderAddress: doc.funderAddress,
        isConfigured: true,
    };
}
const CLOB_HOST = process.env.POLYMARKET_CLOB_HOST || "https://clob.polymarket.com";
const CHAIN_ID = 137;
export async function registerCredentialRoutes(app) {
    // ── Get credential status (never returns private key or secret) ──────────
    app.get("/status", async (req, reply) => {
        const token = getSessionToken(req.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const creds = await getCredentials(userId);
        return {
            isConfigured: creds.isConfigured,
            signatureType: creds.signatureType,
            funderAddress: creds.funderAddress,
            hasApiKey: !!creds.apiKey,
            apiKeyPreview: creds.apiKey
                ? `${creds.apiKey.slice(0, 8)}…${creds.apiKey.slice(-4)}`
                : null,
        };
    });
    // ── Save credentials + derive API key ────────────────────────────────────
    app.post("/save", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const body = request.body;
        if (!body.privateKey) {
            return { success: false, error: "Private key is required" };
        }
        try {
            const signer = new Wallet(body.privateKey);
            const walletAddress = signer.address;
            // Derive API credentials from Polymarket
            const initClient = new ClobClient(CLOB_HOST, CHAIN_ID, signer);
            const apiCredsRaw = await initClient.createOrDeriveApiKey();
            const derivedKey = apiCredsRaw.apiKey || apiCredsRaw.key || "";
            const funderAddress = body.funderAddress || walletAddress;
            // Encrypt sensitive values before storing
            const doc = {
                _id: userId,
                userId,
                privateKey: encrypt(body.privateKey),
                apiKey: encrypt(derivedKey),
                apiSecret: encrypt(apiCredsRaw.secret),
                passphrase: encrypt(apiCredsRaw.passphrase),
                signatureType: body.signatureType ?? 0,
                funderAddress,
                isConfigured: true,
            };
            await credentialsCol().updateOne({ userId }, { $set: doc }, { upsert: true });
            // Auto-approve contracts for EOA wallets (fire-and-forget).
            // This sets USDC.e and CTF allowances so the user doesn't get
            // "not enough balance/allowance" errors on their first trade.
            if ((body.signatureType ?? 0) === 0) {
                ensureApprovals(body.privateKey).then((result) => {
                    if (result.success) {
                        console.log(`[Credentials] Auto-approved contracts for user ${userId}:`, result.approvals);
                    }
                    else {
                        console.warn(`[Credentials] Auto-approval partial failure for user ${userId}:`, result.errors);
                    }
                }).catch((err) => {
                    console.warn(`[Credentials] Auto-approval failed for user ${userId}:`, err);
                });
            }
            return {
                success: true,
                walletAddress,
                funderAddress,
                apiKeyPreview: derivedKey.length > 12
                    ? `${derivedKey.slice(0, 8)}…${derivedKey.slice(-4)}`
                    : derivedKey,
                signatureType: body.signatureType ?? 0,
            };
        }
        catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    });
    // ── Clear credentials ────────────────────────────────────────────────────
    app.delete("/clear", async (req, reply) => {
        const token = getSessionToken(req.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        await credentialsCol().deleteOne({ userId });
        return { success: true };
    });
    // ── Test connection ──────────────────────────────────────────────────────
    app.post("/test", async (req, reply) => {
        const token = getSessionToken(req.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const creds = await getCredentials(userId);
        if (!creds.isConfigured) {
            return { success: false, error: "No credentials configured" };
        }
        try {
            const signer = new Wallet(creds.privateKey);
            const client = new ClobClient(CLOB_HOST, CHAIN_ID, signer, {
                key: creds.apiKey,
                secret: creds.apiSecret,
                passphrase: creds.passphrase,
            }, creds.signatureType, creds.funderAddress);
            const orders = await client.getOpenOrders();
            return {
                success: true,
                message: `Connection successful! ${orders.length} open orders found.`,
            };
        }
        catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    });
    // ── Approve contracts (EOA users only) ───────────────────────────────────
    // Sets all required token approvals for live trading: USDC.e → both exchanges,
    // CTF (ERC-1155) → both exchanges + neg risk adapter.
    app.post("/approve", async (req, reply) => {
        const token = getSessionToken(req.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const creds = await getCredentials(userId);
        if (!creds.isConfigured) {
            return reply.code(400).send({ error: "No credentials configured" });
        }
        if (creds.signatureType !== 0) {
            return reply.code(400).send({ error: "Contract approvals are only needed for Type 0 (EOA) wallets. Proxy wallets are managed by Polymarket." });
        }
        try {
            const result = await ensureApprovals(creds.privateKey);
            return result;
        }
        catch (err) {
            return reply.code(500).send({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    });
}
//# sourceMappingURL=credentials.js.map