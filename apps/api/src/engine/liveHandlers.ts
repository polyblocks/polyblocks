/**
 * Live Trading Node Handlers
 *
 * Identical to paper handlers for data/logic/risk blocks, but PlaceOrder,
 * CancelOrder, and ClosePosition use the real Polymarket CLOB client to
 * submit actual orders on Polygon mainnet.
 */

import { BlockType } from "@polyblocks/types";
import type { NodeHandler, NodeHandlerRegistry } from "@polyblocks/engine-core";
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { getCredentials } from "../routes/credentials.js";
import { createPaperHandlers } from "./paperHandlers.js";
import { builderConfig } from "../builderConfig.js";

const CLOB_HOST = process.env.POLYMARKET_CLOB_HOST || "https://clob.polymarket.com";
const CHAIN_ID = 137;

async function createClobClientAsync(userId?: string): Promise<ClobClient> {
  const creds = await getCredentials(userId);
  if (!creds.isConfigured) {
    throw new Error("No trading credentials configured. Go to Settings to set up your wallet.");
  }

  const signer = new Wallet(creds.privateKey);

  return new ClobClient(
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
    undefined,
    false,
    builderConfig,
  );
}

// ── Live market order placement ──────────────────────────────────────────────
// Uses createAndPostMarketOrder — a TRUE market order that automatically
// reads the order book and calculates the best fill price.
// BUY amount = USD to spend, SELL amount = shares to sell.

const livePlaceOrderHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const market = inputs.market as {
      clobTokenIds?: string[];
      conditionId?: string;
      tokens?: Array<{ token_id: string }>;
    } | undefined;

    const side = inputs.side ? String(inputs.side) : String(node.config.side || "BUY");
    const outcome = inputs.outcome ? String(inputs.outcome) : String(node.config.outcome || "YES");
    const sizeUsd = inputs.sizeUsd ? Number(inputs.sizeUsd) : Number(node.config.sizeUsd || 10);

    // Order type: FOK (Fill-Or-Kill) or FAK (Fill-And-Kill / IOC)
    const orderTypeStr = String(node.config.orderType || "FOK").toUpperCase();
    const orderType = orderTypeStr === "FAK" ? OrderType.FAK : OrderType.FOK;

    const tokenIds = market?.clobTokenIds || market?.tokens?.map((t) => t.token_id) || [];
    const tokenId = outcome === "YES" ? tokenIds[0] : tokenIds[1] || tokenIds[0];

    if (!tokenId) {
      const debugInfo = market
        ? `Market found but no token IDs (keys: ${Object.keys(market).join(", ")})`
        : "No market data received — check that Market Selector is connected and has a market selected.";
      throw new Error(`No token ID available for order placement. ${debugInfo}`);
    }

    const sideEnum = side === "BUY" ? Side.BUY : Side.SELL;

    ctx.log(
      node.id,
      `🔴 LIVE MARKET ${orderTypeStr} ${side} ${outcome} | $${sizeUsd} USD`,
    );

    const client = await createClobClientAsync();

    try {
      // Use the SDK's true market order method.
      // For BUY: amount = USD to spend.  For SELL: amount = shares to sell.
      // The SDK automatically reads the order book and calculates the best
      // execution price — no manual midpoint/price lookup needed.
      const response = await client.createAndPostMarketOrder(
        {
          tokenID: tokenId,
          amount: sizeUsd,
          side: sideEnum,
          orderType,
        },
        undefined, // options — SDK resolves tickSize & negRisk automatically
        orderType,
      ) as { orderID?: string; status?: string; transactionsHashes?: string[]; takingAmount?: string; makingAmount?: string; [key: string]: unknown };

      // Log the full response for debugging
      ctx.log(
        node.id,
        `📋 CLOB Response: ${JSON.stringify(response)}`,
      );

      // ── Detect HTTP-level errors ──────────────────────────────────────
      // The SDK's error handler returns { error: "...", status: 403 } for
      // HTTP errors instead of throwing. Detect numeric status or error field.
      const resp = response as Record<string, unknown>;
      const httpStatus = Number(resp.status) || 0;
      if (httpStatus >= 400 || resp.error) {
        const errMsg = String(resp.error || `HTTP ${httpStatus}`);
        let hint = "";
        if (httpStatus === 403) {
          hint = "\n\n💡 403 Forbidden — common causes:\n" +
            "  1. API credentials expired → Go to Settings, clear & re-save your credentials\n" +
            "  2. Token allowance not set → Visit polymarket.com and place a small manual trade first to approve the contract\n" +
            "  3. Insufficient USDC balance on Polygon for this trade size";
        } else if (httpStatus === 401) {
          hint = "\n\n💡 401 Unauthorized — your API key/secret may be invalid. Go to Settings and re-save your private key.";
        }
        ctx.log(node.id, `❌ CLOB API Error (${httpStatus}): ${errMsg}${hint}`);
        throw new Error(`CLOB API error ${httpStatus}: ${errMsg}`);
      }

      // ── Check SDK-level error ──────────────────────────────────────────
      if (response.success === false && response.errorMsg) {
        ctx.log(node.id, `❌ CLOB Error: ${String(response.errorMsg)}`);
        throw new Error(String(response.errorMsg));
      }

      // ── Determine fill status from CLOB response ──────────────────────
      // response.status can be a string, number, or undefined — always coerce to string
      const rawStatus = response.status;
      const status = (rawStatus != null ? String(rawStatus) : "").toLowerCase();
      const filled = status === "matched" || status === "filled";

      const statusEmoji = filled ? "✅" : "⚠️";
      const statusLabel = filled
        ? `FILLED` + (response.takingAmount ? ` — received ${response.takingAmount} shares` : "")
        : `${rawStatus ?? "unknown"}` + (orderTypeStr === "FOK" ? " (order killed — no full fill available at this size)" : " (partial fill — remainder killed)");

      ctx.log(
        node.id,
        `${statusEmoji} LIVE MARKET ORDER — ID: ${response.orderID}, Status: ${statusLabel}`,
      );

      if (response.transactionsHashes?.length) {
        ctx.log(node.id, `🔗 Tx: ${response.transactionsHashes.join(", ")}`);
      }

      // Track exposure
      const prevExposure = (ctx.state.get("paperExposureUsd") as number) || 0;
      if (filled) {
        ctx.state.set("paperExposureUsd", prevExposure + sizeUsd);
      }

      return {
        orderId: response.orderID || "",
        filled,
        status: rawStatus != null ? String(rawStatus) : "unknown",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log(node.id, `❌ LIVE MARKET ORDER FAILED: ${msg}`);
      throw new Error(`Live market order failed: ${msg}`);
    }
  },
};

const liveCancelOrderHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const orderId = inputs.orderId ? String(inputs.orderId) : "";
    if (!orderId) {
      ctx.log(node.id, "No order ID to cancel");
      return { cancelled: false };
    }

    try {
      const client = await createClobClientAsync();
      await client.cancelOrder({ orderID: orderId });
      ctx.log(node.id, `✅ LIVE CANCEL — Order ${orderId} cancelled`);
      return { cancelled: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log(node.id, `❌ CANCEL FAILED: ${msg}`);
      throw new Error(`Cancel failed: ${msg}`);
    }
  },
};

const liveClosePositionHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const market = inputs.market as {
      clobTokenIds?: string[];
      conditionId?: string;
    } | undefined;

    if (!market) {
      ctx.log(node.id, "No market provided for close position");
      return { closed: false };
    }

    ctx.log(node.id, "🔴 LIVE CLOSE POSITION — placing market sell order");

    // For close, we place a FOK market sell
    const tokenId = market.clobTokenIds?.[0];
    if (!tokenId) {
      throw new Error("No token ID for close");
    }

    try {
      const client = await createClobClientAsync();

      // Use market order to sell position — amount = shares to sell
      // TODO: Track actual position size; for now uses 1 share
      const response = await client.createAndPostMarketOrder(
        {
          tokenID: tokenId,
          amount: 1, // Will be replaced with actual position size
          side: Side.SELL,
        },
        undefined,
        OrderType.FOK,
      ) as { orderID?: string; status?: string };

      ctx.log(node.id, `✅ LIVE CLOSE — Order ${response.orderID}, Status: ${response.status}`);
      return { closed: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log(node.id, `❌ CLOSE FAILED: ${msg}`);
      throw new Error(`Close position failed: ${msg}`);
    }
  },
};

// ── Live Limit Order ─────────────────────────────────────────────────────────

const liveLimitOrderHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const market = inputs.market as {
      clobTokenIds?: string[];
      conditionId?: string;
      tokens?: Array<{ token_id: string }>;
    } | undefined;

    const side = inputs.side ? String(inputs.side) : String(node.config.side || "BUY");
    const outcome = inputs.outcome ? String(inputs.outcome) : String(node.config.outcome || "YES");
    const sizeUsd = inputs.sizeUsd ? Number(inputs.sizeUsd) : Number(node.config.sizeUsd || 10);
    const limitPrice = inputs.limitPrice ? Number(inputs.limitPrice) : Number(node.config.limitPrice || 0.5);

    const tokenIds = market?.clobTokenIds || market?.tokens?.map((t) => t.token_id) || [];
    const tokenId = outcome === "YES" ? tokenIds[0] : tokenIds[1] || tokenIds[0];

    if (!tokenId) {
      throw new Error("No token ID available for limit order");
    }

    const shares = Math.floor((sizeUsd / limitPrice) * 100) / 100;
    const sideEnum = side === "BUY" ? Side.BUY : Side.SELL;

    ctx.log(
      node.id,
      `🔴 LIVE LIMIT ${side} ${outcome} | ${shares.toFixed(2)} shares @ $${limitPrice.toFixed(3)} ($${sizeUsd})`,
    );

    try {
      const client = await createClobClientAsync();
      const marketInfo = await client.getMarket(market?.conditionId || "");

      const response = await client.createAndPostOrder(
        {
          tokenID: tokenId,
          price: limitPrice,
          size: shares,
          side: sideEnum,
        },
        {
          tickSize: marketInfo.minimum_tick_size || "0.01",
          negRisk: marketInfo.neg_risk || false,
        },
        OrderType.GTC,
      ) as { orderID?: string; status?: string; [key: string]: unknown };

      // Log the full response for debugging
      ctx.log(
        node.id,
        `📋 CLOB Response: ${JSON.stringify(response)}`,
      );

      // ── Detect HTTP-level errors ──────────────────────────────────────
      const resp = response as Record<string, unknown>;
      const httpStatus = Number(resp.status) || 0;
      if (httpStatus >= 400 || resp.error) {
        const errMsg = String(resp.error || `HTTP ${httpStatus}`);
        let hint = "";
        if (httpStatus === 403) {
          hint = "\n\n💡 403 Forbidden — common causes:\n" +
            "  1. API credentials expired → Go to Settings, clear & re-save your credentials\n" +
            "  2. Token allowance not set → Visit polymarket.com and place a small manual trade first to approve the contract\n" +
            "  3. Insufficient USDC balance on Polygon for this trade size";
        } else if (httpStatus === 401) {
          hint = "\n\n💡 401 Unauthorized — your API key/secret may be invalid. Go to Settings and re-save your private key.";
        }
        ctx.log(node.id, `❌ CLOB API Error (${httpStatus}): ${errMsg}${hint}`);
        throw new Error(`CLOB API error ${httpStatus}: ${errMsg}`);
      }

      // ── Check SDK-level error ──────────────────────────────────────────
      if (response.success === false && response.errorMsg) {
        ctx.log(node.id, `❌ CLOB Error: ${String(response.errorMsg)}`);
        throw new Error(String(response.errorMsg));
      }

      // response.status can be a string, number, or undefined — always coerce to string
      const rawStatus = response.status;
      const status = (rawStatus != null ? String(rawStatus) : "").toLowerCase();
      const filled = status === "matched" || status === "filled";
      const live = status === "live" || status === "delayed";

      const statusEmoji = filled ? "✅" : live ? "📋" : "⚠️";
      const statusLabel = filled
        ? "FILLED"
        : live
          ? "LIVE (resting on order book)"
          : `${rawStatus ?? "unknown"}`;

      ctx.log(
        node.id,
        `${statusEmoji} LIVE LIMIT ORDER — ID: ${response.orderID}, Status: ${statusLabel}`,
      );

      return {
        orderId: response.orderID || "",
        placed: true,
        filled,
        status: rawStatus != null ? String(rawStatus) : "unknown",
        live,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log(node.id, `❌ LIVE LIMIT ORDER FAILED: ${msg}`);
      throw new Error(`Limit order failed: ${msg}`);
    }
  },
};

// ─── Registry ───────────────────────────────────────────────────────────────

export function createLiveHandlers(): NodeHandlerRegistry {
  // Start with all paper handlers (data, logic, triggers, risk all work the same)
  const registry = createPaperHandlers();

  // Override action blocks with live implementations
  registry.set(BlockType.PlaceOrder, livePlaceOrderHandler);
  registry.set(BlockType.LimitOrder, liveLimitOrderHandler);
  registry.set(BlockType.CancelOrder, liveCancelOrderHandler);
  registry.set(BlockType.ClosePosition, liveClosePositionHandler);

  return registry;
}
