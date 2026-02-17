/**
 * Positions & Trades routes — query real CLOB positions and trade history,
 * close positions via market sell.
 */

import type { FastifyInstance } from "fastify";
import { ClobClient, Side, OrderType, AssetType } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { getCredentials } from "./credentials.js";
import { builderConfig } from "../builderConfig.js";

const CLOB_HOST = process.env.POLYMARKET_CLOB_HOST || "https://clob.polymarket.com";
const GAMMA_HOST = process.env.POLYMARKET_GAMMA_HOST || "https://gamma-api.polymarket.com";
const CHAIN_ID = 137;

async function createClobClient(userId?: string): Promise<ClobClient> {
  const creds = await getCredentials(userId);
  if (!creds.isConfigured) {
    throw new Error("No trading credentials configured. Go to Settings to set up your wallet.");
  }

  const signer = new Wallet(creds.privateKey);
  const signerAddr = await signer.getAddress();

  let signatureType = creds.signatureType;
  const funderAddr = creds.funderAddress || signerAddr;
  const funderIsDifferent = funderAddr.toLowerCase() !== signerAddr.toLowerCase();

  if (funderIsDifferent && signatureType === 0) {
    signatureType = 1;
  } else if (!funderIsDifferent && signatureType === 1) {
    signatureType = 0;
  }

  return new ClobClient(
    CLOB_HOST,
    CHAIN_ID,
    signer,
    {
      key: creds.apiKey,
      secret: creds.apiSecret,
      passphrase: creds.passphrase,
    },
    signatureType,
    funderAddr,
    undefined,
    false,
    builderConfig,
  );
}

/** Safely parse JSON strings from Gamma API */
function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  if (Array.isArray(value)) return value as T;
  return fallback;
}

/** Enrich positions with market names from Gamma API */
async function enrichWithMarketNames(
  positions: Array<{ conditionId?: string; asset?: string; [key: string]: unknown }>
): Promise<Map<string, { question: string; slug: string; image: string; outcomes: string[]; outcomePrices: string[]; clobTokenIds: string[] }>> {
  const marketMap = new Map<string, { question: string; slug: string; image: string; outcomes: string[]; outcomePrices: string[]; clobTokenIds: string[] }>();

  // Collect unique condition IDs
  const conditionIds = new Set<string>();
  for (const pos of positions) {
    if (pos.conditionId) conditionIds.add(String(pos.conditionId));
  }

  // Batch fetch from Gamma
  for (const conditionId of conditionIds) {
    try {
      const res = await fetch(`${GAMMA_HOST}/markets?conditionId=${conditionId}`);
      if (res.ok) {
        const markets = await res.json() as Array<Record<string, unknown>>;
        if (markets.length > 0) {
          const m = markets[0];
          marketMap.set(conditionId, {
            question: String(m.question || ""),
            slug: String(m.slug || ""),
            image: String(m.image || m.icon || ""),
            outcomes: safeJsonParse(m.outcomes as string, []),
            outcomePrices: safeJsonParse(m.outcomePrices as string, []),
            clobTokenIds: safeJsonParse(m.clobTokenIds as string, []),
          });
        }
      }
    } catch {
      // Skip enrichment for this market
    }
  }

  return marketMap;
}

export async function registerPositionRoutes(app: FastifyInstance) {

  // ── Get all open positions ────────────────────────────────────────────────
  app.get("/", async (request) => {
    const { userId } = request.query as { userId?: string };

    try {
      const creds = await getCredentials(userId);
      if (!creds.isConfigured) {
        return { positions: [], error: "No credentials configured" };
      }

      const signer = new Wallet(creds.privateKey);
      const signerAddr = await signer.getAddress();
      const funderAddr = creds.funderAddress || signerAddr;

      // Use the Gamma API to get positions for the maker address
      // The CLOB positions endpoint requires the maker address (funder for proxy wallets)
      const posRes = await fetch(`${GAMMA_HOST}/positions?user=${funderAddr.toLowerCase()}`);

      if (!posRes.ok) {
        console.log(`[Positions] Gamma positions API returned ${posRes.status}`);
        return { positions: [], error: `Failed to fetch positions: ${posRes.status}` };
      }

      const rawPositions = await posRes.json() as Array<Record<string, unknown>>;

      // Map to clean shape with market info
      const positions = rawPositions
        .filter((p) => Number(p.size || 0) > 0.001)
        .map((p) => {
          const market = p.market as Record<string, unknown> | undefined;
          return {
            conditionId: String(p.conditionId || ""),
            asset: String(p.asset || ""),
            size: Number(p.size || 0),
            avgPrice: Number(p.avgPrice || 0),
            currentPrice: Number(p.curPrice || p.price || 0),
            initialValue: Number(p.initialValue || 0),
            currentValue: Number(p.currentValue || 0),
            cashPnl: Number(p.cashPnl || 0),
            percentPnl: Number(p.percentPnl || 0),
            realizedPnl: Number(p.realizedPnl || 0),
            side: String(p.outcome || p.side || ""),
            outcomeIndex: Number(p.outcomeIndex ?? 0),
            question: market ? String(market.question || "") : "",
            slug: market ? String(market.slug || "") : "",
            image: market ? String(market.image || market.icon || "") : "",
          };
        });

      // If Gamma didn't include market info, try to enrich
      const needsEnrichment = positions.some((p) => !p.question && p.conditionId);
      if (needsEnrichment) {
        const marketMap = await enrichWithMarketNames(positions);
        for (const pos of positions) {
          if (!pos.question && marketMap.has(pos.conditionId)) {
            const m = marketMap.get(pos.conditionId)!;
            pos.question = m.question;
            pos.slug = m.slug;
            pos.image = m.image;
          }
        }
      }

      return { positions };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Positions] Error:", msg);
      return { positions: [], error: msg };
    }
  });

  // ── Close a position (market sell) ────────────────────────────────────────
  app.post("/close", async (request) => {
    const body = request.body as {
      tokenId: string;
      conditionId: string;
      shares: number;
      outcome: string;
      userId?: string;
    };

    if (!body.tokenId || !body.shares) {
      return { success: false, error: "tokenId and shares are required" };
    }

    try {
      const client = await createClobClient(body.userId);

      console.log(`[Positions] Closing position: SELL ${body.shares} shares of ${body.outcome} (token: ${body.tokenId})`);

      const response = await client.createAndPostMarketOrder(
        {
          tokenID: body.tokenId,
          amount: body.shares,
          side: Side.SELL,
          orderType: OrderType.FOK,
        },
        undefined,
        OrderType.FOK,
      ) as { orderID?: string; status?: string; error?: string; [key: string]: unknown };

      // Detect errors
      const resp = response as Record<string, unknown>;
      const httpStatus = Number(resp.status) || 0;
      if (httpStatus >= 400 || resp.error) {
        const errMsg = String(resp.error || `HTTP ${httpStatus}`);
        return { success: false, error: errMsg };
      }

      const rawStatus = response.status;
      const status = (rawStatus != null ? String(rawStatus) : "").toLowerCase();
      const filled = status === "matched" || status === "filled";

      console.log(`[Positions] Close result: ${rawStatus}, orderID: ${response.orderID}`);

      return {
        success: filled,
        orderId: response.orderID || "",
        status: rawStatus,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Positions] Close error:", msg);
      return { success: false, error: msg };
    }
  });

  // ── Get trade history ─────────────────────────────────────────────────────
  app.get("/trades", async (request) => {
    const { userId } = request.query as { userId?: string };

    try {
      const creds = await getCredentials(userId);
      if (!creds.isConfigured) {
        return { trades: [] };
      }

      const signer = new Wallet(creds.privateKey);
      const signerAddr = await signer.getAddress();
      const funderAddr = creds.funderAddress || signerAddr;

      // Fetch trade history from CLOB
      const tradesRes = await fetch(`${CLOB_HOST}/trades?maker=${funderAddr.toLowerCase()}&limit=50`);

      if (!tradesRes.ok) {
        console.log(`[Trades] CLOB trades API returned ${tradesRes.status}`);
        return { trades: [] };
      }

      const rawTrades = await tradesRes.json() as Array<Record<string, unknown>>;

      const trades = rawTrades.map((t) => ({
        id: String(t.id || t.tradeId || ""),
        conditionId: String(t.market || t.conditionId || ""),
        asset: String(t.asset || t.tokenId || ""),
        side: String(t.side || ""),
        price: Number(t.price || 0),
        size: Number(t.size || 0),
        fee: Number(t.fee || 0),
        status: String(t.status || t.matchType || ""),
        timestamp: String(t.createdAt || t.timestamp || ""),
        txHash: String(t.transactionHash || ""),
      }));

      return { trades };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Trades] Error:", msg);
      return { trades: [], error: msg };
    }
  });
}
