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

const CLOB_HOST = "https://clob.polymarket.com";
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

// ── Live order placement ────────────────────────────────────────────────────

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

    const tokenIds = market?.clobTokenIds || market?.tokens?.map((t) => t.token_id) || [];
    const tokenId = outcome === "YES" ? tokenIds[0] : tokenIds[1] || tokenIds[0];

    if (!tokenId) {
      throw new Error("No token ID available for order placement");
    }

    const client = await createClobClientAsync();

    // Get market info for tick size and neg risk
    const marketInfo = await client.getMarket(market?.conditionId || "");

    // Determine price — use midpoint if not explicitly set
    let price = Number(node.config.price || 0);
    if (!price) {
      try {
        const mid = await fetch(`${CLOB_HOST}/midpoint?token_id=${tokenId}`);
        const midData = await mid.json() as { mid: string };
        price = parseFloat(midData.mid);
      } catch {
        price = 0.5;
      }
    }

    // Calculate number of shares
    const shares = Math.floor((sizeUsd / price) * 100) / 100; // Round to 2 decimals

    ctx.log(
      node.id,
      `🔴 LIVE ${side} ${outcome} | ${shares.toFixed(2)} shares @ $${price.toFixed(3)} ($${sizeUsd})`,
    );

    // Map our order types to CLOB SDK types
    const sideEnum = side === "BUY" ? Side.BUY : Side.SELL;

    try {
      const response = await client.createAndPostOrder(
        {
          tokenID: tokenId,
          price,
          size: shares,
          side: sideEnum,
        },
        {
          tickSize: marketInfo.minimum_tick_size || "0.01",
          negRisk: marketInfo.neg_risk || false,
        },
        OrderType.GTC,
      ) as { orderID?: string; status?: string };

      ctx.log(
        node.id,
        `✅ LIVE ORDER PLACED — ID: ${response.orderID}, Status: ${response.status}`,
      );

      // Track exposure
      const prevExposure = (ctx.state.get("paperExposureUsd") as number) || 0;
      ctx.state.set("paperExposureUsd", prevExposure + sizeUsd);

      return {
        orderId: response.orderID || "",
        filled: response.status === "matched" ? true : null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log(node.id, `❌ LIVE ORDER FAILED: ${msg}`);
      throw new Error(`Live order failed: ${msg}`);
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

    // For close, we place a FOK sell at midpoint
    const tokenId = market.clobTokenIds?.[0];
    if (!tokenId) {
      throw new Error("No token ID for close");
    }

    try {
      const client = await createClobClientAsync();
      const marketInfo = await client.getMarket(market.conditionId || "");

      // Get current mid
      const midRes = await fetch(`${CLOB_HOST}/midpoint?token_id=${tokenId}`);
      const midData = await midRes.json() as { mid: string };
      const price = parseFloat(midData.mid);

      // We need to know position size — for now, close with a market sell
      // In a full implementation, we'd track actual positions
      const response = await client.createAndPostOrder(
        {
          tokenID: tokenId,
          price,
          size: 1, // Will be replaced with actual position size
          side: Side.SELL,
        },
        {
          tickSize: marketInfo.minimum_tick_size || "0.01",
          negRisk: marketInfo.neg_risk || false,
        },
        OrderType.GTC,
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
      ) as { orderID?: string; status?: string };

      ctx.log(
        node.id,
        `✅ LIVE LIMIT ORDER PLACED — ID: ${response.orderID}, Status: ${response.status}`,
      );

      return {
        orderId: response.orderID || "",
        placed: true,
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
