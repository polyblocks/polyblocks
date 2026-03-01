/**
 * Credentials routes — store and manage per-user Polymarket API credentials.
 * Private keys and API secrets are encrypted at rest with AES-256-GCM.
 * Stored in MongoDB (credentials collection, one doc per user).
 */

import type { FastifyInstance } from "fastify";
import { ClobClient } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { credentialsCol, sessionsCol, type DbCredentials } from "../db.js";
import { encrypt, decrypt } from "../crypto.js";

// ── Public interface for other modules (e.g. liveHandlers) ──────────────────

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
function getSessionToken(headers: Record<string, unknown>): string {
  const token = headers["x-session-token"];
  return typeof token === "string" ? token : "";
}

async function resolveSession(token: string): Promise<string | null> {
  if (!token) return null;
  const session = await sessionsCol().findOne({ _id: token });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await sessionsCol().deleteOne({ _id: token });
    return null;
  }
  return session.userId;
}

export async function getCredentials(userId?: string): Promise<StoredCredentials> {
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

export async function registerCredentialRoutes(app: FastifyInstance) {

  // ── Get credential status (never returns private key or secret) ──────────
  app.get("/status", async (req, reply) => {
    const token = getSessionToken(req.headers as Record<string, unknown>);
    const userId = await resolveSession(token);
    if (!userId) return reply.code(401).send({ error: "Not authenticated" });

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
    const token = getSessionToken(request.headers as Record<string, unknown>);
    const userId = await resolveSession(token);
    if (!userId) return reply.code(401).send({ error: "Not authenticated" });

    const body = request.body as {
      privateKey: string;
      signatureType: number;
      funderAddress: string;
    };

    if (!body.privateKey) {
      return { success: false, error: "Private key is required" };
    }

    try {
      const signer = new Wallet(body.privateKey);
      const walletAddress = signer.address;

      // Derive API credentials from Polymarket
      const initClient = new ClobClient(CLOB_HOST, CHAIN_ID, signer);
      const apiCredsRaw = await initClient.createOrDeriveApiKey() as {
        apiKey: string;
        key?: string;
        secret: string;
        passphrase: string;
      };
      const derivedKey = apiCredsRaw.apiKey || apiCredsRaw.key || "";
      const funderAddress = body.funderAddress || walletAddress;

      // Encrypt sensitive values before storing
      const doc: DbCredentials = {
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

      await credentialsCol().updateOne(
        { userId },
        { $set: doc },
        { upsert: true },
      );

      return {
        success: true,
        walletAddress,
        funderAddress,
        apiKeyPreview: derivedKey.length > 12
          ? `${derivedKey.slice(0, 8)}…${derivedKey.slice(-4)}`
          : derivedKey,
        signatureType: body.signatureType ?? 0,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // ── Clear credentials ────────────────────────────────────────────────────
  app.delete("/clear", async (req, reply) => {
    const token = getSessionToken(req.headers as Record<string, unknown>);
    const userId = await resolveSession(token);
    if (!userId) return reply.code(401).send({ error: "Not authenticated" });

    await credentialsCol().deleteOne({ userId });
    return { success: true };
  });

  // ── Test connection ──────────────────────────────────────────────────────
  app.post("/test", async (req, reply) => {
    const token = getSessionToken(req.headers as Record<string, unknown>);
    const userId = await resolveSession(token);
    if (!userId) return reply.code(401).send({ error: "Not authenticated" });

    const creds = await getCredentials(userId);

    if (!creds.isConfigured) {
      return { success: false, error: "No credentials configured" };
    }

    try {
      const signer = new Wallet(creds.privateKey);
      const client = new ClobClient(
        CLOB_HOST,
        CHAIN_ID,
        signer,
        {
          key: creds.apiKey,
          secret: creds.apiSecret,
          passphrase: creds.passphrase,
        },
        creds.signatureType,
        creds.funderAddress,
      );

      const orders = await client.getOpenOrders();
      return {
        success: true,
        message: `Connection successful! ${orders.length} open orders found.`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
