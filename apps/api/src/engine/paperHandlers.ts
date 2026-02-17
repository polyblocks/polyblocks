/**
 * Paper Trading Node Handlers
 *
 * Each handler implements the NodeHandler interface for a specific BlockType.
 * In paper mode, order execution is simulated against real CLOB order book
 * snapshots — no actual trades are placed.
 */

import {
  BlockType,
} from "@polyblocks/types";
import type { NodeHandler, NodeHandlerRegistry } from "@polyblocks/engine-core";
import nodemailer from "nodemailer";

const CLOB_HOST = process.env.POLYMARKET_CLOB_HOST || "https://clob.polymarket.com";
const GAMMA_HOST = process.env.POLYMARKET_GAMMA_HOST || "https://gamma-api.polymarket.com";

// ─── Email Transporter (lazy singleton) ─────────────────────────────────────
let _transporter: nodemailer.Transporter | null = null;
function getMailTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  _transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
  });
  return _transporter;
}

// ─── Telegram helper ────────────────────────────────────────────────────────
async function sendTelegram(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// ─── Utility ────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json();
}

// ─── Market Data Cache ──────────────────────────────────────────────────────
// Prevents re-fetching the same market data on every poll iteration.
// Cache entries expire after 60 seconds so price/metadata stays fresh.

const marketCache = new Map<string, { data: unknown; fetchedAt: number }>();
const MARKET_CACHE_TTL_MS = 60_000; // 60s

async function fetchMarketCached(conditionId: string): Promise<unknown> {
  const now = Date.now();
  const cached = marketCache.get(conditionId);
  if (cached && (now - cached.fetchedAt) < MARKET_CACHE_TTL_MS) {
    return cached.data;
  }
  const data = await fetchJson(`${CLOB_HOST}/markets/${conditionId}`);
  marketCache.set(conditionId, { data, fetchedAt: now });
  return data;
}

// ─── Handlers ───────────────────────────────────────────────────────────────

const intervalTriggerHandler: NodeHandler = {
  async execute(_node, _inputs, _ctx) {
    // Interval triggers always fire — the scheduler is responsible for timing
    return { signal: true };
  },
};

const manualTriggerHandler: NodeHandler = {
  async execute(_node, _inputs, _ctx) {
    return { signal: true };
  },
};

const priceCrossTriggerHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const market = inputs.market as { conditionId: string; clobTokenIds?: string[]; tokens?: Array<{ token_id: string }> } | undefined;
    if (!market) return { signal: false, price: null };

    const allTokenIds = market.clobTokenIds || market.tokens?.map((t) => t.token_id) || [];
    const tokenId = allTokenIds[0];
    if (!tokenId) return { signal: false, price: null };
    const data = (await fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenId}`)) as { mid: string };
    const price = parseFloat(data.mid);

    const threshold = Number(node.config.threshold);
    const direction = String(node.config.direction);

    const crossed =
      direction === "above" ? price >= threshold : price <= threshold;

    ctx.log(node.id, `Price: ${price}, Threshold: ${threshold}, Crossed: ${crossed}`);

    return { signal: crossed, price };
  },
};

const marketSelectorHandler: NodeHandler = {
  async execute(node, _inputs, ctx) {
    const conditionId = node.config.conditionId ? String(node.config.conditionId).trim() : "";
    if (!conditionId) {
      throw new Error("No market selected — open the Market Selector node and pick a market.");
    }

    // Use cache to avoid re-fetching on every poll iteration
    const t0 = Date.now();
    try {
      const raw = await fetchMarketCached(conditionId) as Record<string, unknown>;
      const elapsed = Date.now() - t0;

      // ── Normalise market object ─────────────────────────────────────
      // The CLOB /markets/{conditionId} endpoint returns { tokens: [{token_id}] }
      // but many downstream handlers expect clobTokenIds: string[].
      // Also ensure conditionId is always present.
      const market = { ...raw, conditionId } as Record<string, unknown>;

      // Extract clobTokenIds from tokens array if missing
      if (!market.clobTokenIds || (Array.isArray(market.clobTokenIds) && (market.clobTokenIds as string[]).length === 0)) {
        const tokens = market.tokens as Array<{ token_id: string }> | undefined;
        if (tokens && Array.isArray(tokens)) {
          market.clobTokenIds = tokens.map((t) => t.token_id);
        }
      }

      // Also map condition_id → conditionId if the API returns snake_case
      if (!market.conditionId && market.condition_id) {
        market.conditionId = market.condition_id;
      }

      ctx.log(node.id, `✅ Market loaded: ${conditionId} (${elapsed}ms${elapsed < 5 ? " — cached" : ""}) | tokenIds: ${(market.clobTokenIds as string[] || []).length}`);
      return { market };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log(node.id, `❌ Failed to fetch market ${conditionId}: ${msg}`);
      throw new Error(`Market lookup failed for ${conditionId}: ${msg}`);
    }
  },
};

const priceDataHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const market = inputs.market as { tokens?: Array<{ token_id: string }>; clobTokenIds?: string[] } | undefined;
    if (!market) return { midpoint: null, bestBid: null, bestAsk: null, lastTrade: null };

    const tokenIds = market.clobTokenIds || market.tokens?.map((t) => t.token_id) || [];
    const side = String(node.config.side || "YES");
    const tokenId = side === "YES" ? tokenIds[0] : tokenIds[1] || tokenIds[0];

    if (!tokenId) return { midpoint: null, bestBid: null, bestAsk: null, lastTrade: null };

    const [midData, bookData] = await Promise.all([
      fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenId}`) as Promise<{ mid: string }>,
      fetchJson(`${CLOB_HOST}/book?token_id=${tokenId}`) as Promise<{
        bids: Array<{ price: string; size: string }>;
        asks: Array<{ price: string; size: string }>;
      }>,
    ]);

    const midpoint = parseFloat(midData.mid);

    // Sort bids descending (highest first), asks ascending (lowest first)
    const sortedBids = (bookData.bids || []).slice().sort(
      (a, b) => parseFloat(b.price) - parseFloat(a.price)
    );
    const sortedAsks = (bookData.asks || []).slice().sort(
      (a, b) => parseFloat(a.price) - parseFloat(b.price)
    );
    const bestBid = sortedBids.length > 0 ? parseFloat(sortedBids[0].price) : null;
    const bestAsk = sortedAsks.length > 0 ? parseFloat(sortedAsks[0].price) : null;

    ctx.log(node.id, `Mid: ${midpoint}, Bid: ${bestBid}, Ask: ${bestAsk}`);

    return { midpoint, bestBid, bestAsk, lastTrade: midpoint };
  },
};

const spreadDataHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const market = inputs.market as { clobTokenIds?: string[]; tokens?: Array<{ token_id: string }> } | undefined;
    const spreadTokenIds = market?.clobTokenIds || market?.tokens?.map((t) => t.token_id) || [];
    if (!spreadTokenIds[0]) return { spread: null };

    const tokenId = spreadTokenIds[0];
    const data = (await fetchJson(`${CLOB_HOST}/spread?token_id=${tokenId}`)) as { spread: string };
    const spread = parseFloat(data.spread);

    ctx.log(node.id, `Spread: ${spread}`);
    return { spread };
  },
};

const orderBookDataHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const market = inputs.market as { clobTokenIds?: string[]; tokens?: Array<{ token_id: string }> } | undefined;
    const obTokenIds = market?.clobTokenIds || market?.tokens?.map((t) => t.token_id) || [];
    if (!obTokenIds[0]) return { orderbook: null, bidDepth: 0, askDepth: 0 };

    const tokenId = obTokenIds[0];
    const book = (await fetchJson(`${CLOB_HOST}/book?token_id=${tokenId}`)) as {
      bids: Array<{ price: string; size: string }>;
      asks: Array<{ price: string; size: string }>;
    };

    // Sort bids descending, asks ascending for correct ordering
    const sortedBids = (book.bids || []).slice().sort(
      (a, b) => parseFloat(b.price) - parseFloat(a.price)
    );
    const sortedAsks = (book.asks || []).slice().sort(
      (a, b) => parseFloat(a.price) - parseFloat(b.price)
    );

    const bidDepth = sortedBids.reduce((sum, b) => sum + parseFloat(b.size), 0);
    const askDepth = sortedAsks.reduce((sum, a) => sum + parseFloat(a.size), 0);

    ctx.log(node.id, `Bid depth: ${bidDepth.toFixed(2)}, Ask depth: ${askDepth.toFixed(2)}`);

    return {
      orderbook: { bids: sortedBids, asks: sortedAsks, tokenId, timestamp: Date.now() },
      bidDepth,
      askDepth,
    };
  },
};

// ── Logic ───────────────────────────────────────────────────────────────────

const andGateHandler: NodeHandler = {
  async execute(_node, inputs) {
    const a = Boolean(inputs.a);
    const b = Boolean(inputs.b);
    const result = a && b;
    // Pass signal through only when gate is true (open)
    const signalIn = inputs.signal;
    const signalOut = result ? (signalIn ?? true) : null;
    return { result, signal: signalOut };
  },
};

const orGateHandler: NodeHandler = {
  async execute(_node, inputs) {
    const a = Boolean(inputs.a);
    const b = Boolean(inputs.b);
    const result = a || b;
    // Pass signal through only when gate is true (open)
    const signalIn = inputs.signal;
    const signalOut = result ? (signalIn ?? true) : null;
    return { result, signal: signalOut };
  },
};

const thresholdCompareHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const value = Number(inputs.value);
    const threshold = Number(node.config.threshold);
    const operator = String(node.config.operator);

    let result = false;
    switch (operator) {
      case ">":  result = value > threshold; break;
      case ">=": result = value >= threshold; break;
      case "<":  result = value < threshold; break;
      case "<=": result = value <= threshold; break;
      case "==": result = value === threshold; break;
      case "!=": result = value !== threshold; break;
    }

    ctx.log(node.id, `${value} ${operator} ${threshold} = ${result}`);
    return { result, signal: result ? true : null };
  },
};

const cooldownHandler: NodeHandler = {
  async execute(node, _inputs, ctx) {
    const key = `cooldown_${node.id}`;
    const lastFired = ctx.state.get(key) as number | undefined;
    const cooldownMs = Number(node.config.cooldownMs || 300_000);
    const now = Date.now();

    if (lastFired && now - lastFired < cooldownMs) {
      ctx.log(node.id, `Cooldown active, ${Math.round((cooldownMs - (now - lastFired)) / 1000)}s remaining`);
      return { signal: null };
    }

    ctx.state.set(key, now);
    ctx.log(node.id, "Cooldown passed, signal forwarded");
    return { signal: true };
  },
};

const mathOpHandler: NodeHandler = {
  async execute(node, inputs) {
    const op = String(node.config.operator);
    const inputCount = Number(node.config.inputCount || 2);

    // Gather all input values (a, b, c, d, ...)
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const values: number[] = [];
    for (let i = 0; i < inputCount; i++) {
      values.push(Number(inputs[letters[i]] || 0));
    }

    let result = values[0] ?? 0;
    for (let i = 1; i < values.length; i++) {
      switch (op) {
        case "+": result += values[i]; break;
        case "-": result -= values[i]; break;
        case "*": result *= values[i]; break;
        case "/": result = values[i] !== 0 ? result / values[i] : 0; break;
        default:  break;
      }
    }

    return { result };
  },
};

// ── Risk ────────────────────────────────────────────────────────────────────

const maxExposureHandler: NodeHandler = {
  async execute(node, _inputs, ctx) {
    const maxExposureUsd = Number(node.config.maxExposureUsd || 100);
    // In paper mode, track exposure via context state
    const currentExposure = (ctx.state.get("paperExposureUsd") as number) || 0;

    if (currentExposure >= maxExposureUsd) {
      ctx.log(node.id, `Exposure $${currentExposure} >= limit $${maxExposureUsd} — BLOCKED`);
      return { signal: null, blocked: true };
    }

    ctx.log(node.id, `Exposure $${currentExposure} < limit $${maxExposureUsd} — passed`);
    return { signal: true, blocked: false };
  },
};

const dailyLossLimitHandler: NodeHandler = {
  async execute(node, _inputs, ctx) {
    const maxLoss = Number(node.config.maxDailyLossUsd || 50);
    const currentLoss = (ctx.state.get("paperDailyLossUsd") as number) || 0;

    if (currentLoss >= maxLoss) {
      ctx.log(node.id, `Daily loss $${currentLoss} >= limit $${maxLoss} — BLOCKED`);
      return { signal: null, blocked: true };
    }

    ctx.log(node.id, `Daily loss $${currentLoss} < limit $${maxLoss} — passed`);
    return { signal: true, blocked: false };
  },
};

const killSwitchHandler: NodeHandler = {
  async execute(node, _inputs, ctx) {
    ctx.log(node.id, "KILL SWITCH ACTIVATED — strategy halted");
    // In a real system this would cancel all orders and stop the scheduler
    return {};
  },
};

// ── Actions (paper mode) ────────────────────────────────────────────────────

const placeOrderHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const t0 = Date.now();
    const market = inputs.market as { clobTokenIds?: string[]; conditionId?: string; condition_id?: string; tokens?: Array<{ token_id: string }> } | undefined;
    // Side can come from input port (e.g. UserActivity) or fall back to config
    const side = inputs.side ? String(inputs.side) : String(node.config.side || "BUY");
    // Outcome can come from an input port (e.g. UserActivity) or fall back to config
    const outcome = inputs.outcome ? String(inputs.outcome) : String(node.config.outcome || "YES");
    const sizeUsd = inputs.sizeUsd ? Number(inputs.sizeUsd) : Number(node.config.sizeUsd || 10);
    const inputPrice = inputs.price as number | undefined;
    const marketConditionId = market?.conditionId || market?.condition_id || "";

    // Duplicate trade prevention
    if (node.config.preventDuplicate) {
      const tradeKey = `placed_${node.id}_${marketConditionId}_${side}_${outcome}`;
      if (ctx.state.get(tradeKey)) {
        ctx.log(node.id, `⏭️ Duplicate trade skipped (${side} ${outcome} already placed this run)`);
        return { orderId: null, filled: false };
      }
      ctx.state.set(tradeKey, true);
    }

    const tokenIds = market?.clobTokenIds || market?.tokens?.map((t) => t.token_id) || [];
    const tokenId = outcome === "YES" ? tokenIds[0] : tokenIds[1] || tokenIds[0];

    // Get current price to simulate fill
    let fillPrice = inputPrice ?? 0.5;
    if (tokenId) {
      try {
        const data = (await fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenId}`)) as { mid: string };
        fillPrice = parseFloat(data.mid);
      } catch {
        // Use input price as fallback
      }
    }

    const shares = sizeUsd / fillPrice;

    // Track paper exposure
    const prevExposure = (ctx.state.get("paperExposureUsd") as number) || 0;
    ctx.state.set("paperExposureUsd", prevExposure + sizeUsd);

    const paperOrder = {
      id: `paper_${Date.now()}`,
      side,
      outcome,
      price: fillPrice,
      size: shares,
      sizeUsd,
      tokenId,
      conditionId: marketConditionId,
      filled: true,
      timestamp: Date.now(),
    };

    const elapsed = Date.now() - t0;
    ctx.log(
      node.id,
      `📝 PAPER ${side} ${outcome} | ${shares.toFixed(2)} shares @ $${fillPrice.toFixed(3)} ($${sizeUsd}) [${elapsed}ms]`,
    );

    return { order: paperOrder, orderId: paperOrder.id, filled: true };
  },
};

const limitOrderHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const market = inputs.market as { clobTokenIds?: string[]; conditionId?: string; condition_id?: string; tokens?: Array<{ token_id: string }> } | undefined;
    const side = inputs.side ? String(inputs.side) : String(node.config.side || "BUY");
    const outcome = inputs.outcome ? String(inputs.outcome) : String(node.config.outcome || "YES");
    const sizeUsd = inputs.sizeUsd ? Number(inputs.sizeUsd) : Number(node.config.sizeUsd || 10);
    const limitPrice = inputs.limitPrice ? Number(inputs.limitPrice) : Number(node.config.limitPrice || 0.5);
    const marketConditionId = market?.conditionId || market?.condition_id || "";

    // Duplicate trade prevention
    if (node.config.preventDuplicate) {
      const tradeKey = `placed_${node.id}_${marketConditionId}_${side}_${outcome}`;
      if (ctx.state.get(tradeKey)) {
        ctx.log(node.id, `⏭️ Duplicate trade skipped (${side} ${outcome} already placed this run)`);
        return { orderId: null, placed: false };
      }
      ctx.state.set(tradeKey, true);
    }

    const tokenIds = market?.clobTokenIds || market?.tokens?.map((t) => t.token_id) || [];
    const tokenId = outcome === "YES" ? tokenIds[0] : tokenIds[1] || tokenIds[0];

    // Get current price to check if limit would fill
    let currentPrice = 0.5;
    if (tokenId) {
      try {
        const data = (await fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenId}`)) as { mid: string };
        currentPrice = parseFloat(data.mid);
      } catch { /* use default */ }
    }

    const shares = sizeUsd / limitPrice;

    // In paper mode, simulate whether the limit would be hit
    const wouldFill = side === "BUY" ? currentPrice <= limitPrice : currentPrice >= limitPrice;

    const paperId = `paper_limit_${Date.now()}`;

    const paperOrder = {
      id: paperId,
      side,
      outcome,
      price: limitPrice,
      size: shares,
      sizeUsd,
      tokenId,
      conditionId: marketConditionId,
      filled: wouldFill,
      timestamp: Date.now(),
    };

    if (wouldFill) {
      const prevExposure = (ctx.state.get("paperExposureUsd") as number) || 0;
      ctx.state.set("paperExposureUsd", prevExposure + sizeUsd);
      ctx.log(
        node.id,
        `📝 PAPER LIMIT ${side} ${outcome} | ${shares.toFixed(2)} shares @ limit $${limitPrice.toFixed(3)} — FILLED (market $${currentPrice.toFixed(3)})`,
      );
    } else {
      ctx.log(
        node.id,
        `📝 PAPER LIMIT ${side} ${outcome} | ${shares.toFixed(2)} shares @ limit $${limitPrice.toFixed(3)} — PENDING (market $${currentPrice.toFixed(3)})`,
      );
    }

    return { order: paperOrder, orderId: paperId, placed: true };
  },
};

const cancelOrderHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const orderId = inputs.orderId ? String(inputs.orderId) : "unknown";
    ctx.log(node.id, `📝 PAPER CANCEL order ${orderId}`);
    return { cancelled: true };
  },
};

const closePositionHandler: NodeHandler = {
  async execute(node, _inputs, ctx) {
    ctx.log(node.id, "📝 PAPER CLOSE position");
    return { closed: true };
  },
};

const notificationHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const template = String(node.config.template || "{{message}}");
    const message = String(inputs.message || "Strategy event");
    const rendered = template.replace("{{message}}", message);
    const channel = String(node.config.channel || "log");

    ctx.log(node.id, `🔔 [${channel}] ${rendered}`);

    if (channel === "email") {
      const recipientEmail = process.env.NOTIFICATION_EMAIL;
      const transporter = getMailTransporter();
      if (transporter && recipientEmail) {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: recipientEmail,
            subject: `🔔 Polyblocks Alert`,
            html: `<div style="font-family:sans-serif;padding:20px;background:#1a1b2e;color:#e0e0e0;border-radius:8px;">
              <h2 style="color:#6366f1;">🔔 Polyblocks Notification</h2>
              <p style="font-size:16px;">${rendered}</p>
              <hr style="border-color:#333;"/>
              <small style="color:#888;">Strategy: ${ctx.strategyId} | Run: ${ctx.runId}</small>
            </div>`,
          });
          ctx.log(node.id, `📧 Email sent to ${recipientEmail}`);
        } catch (err) {
          ctx.log(node.id, `📧 Email failed: ${(err as Error).message}`);
        }
      } else {
        ctx.log(node.id, "📧 Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, NOTIFICATION_EMAIL in .env");
      }
    } else if (channel === "telegram") {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (token && chatId) {
        try {
          await sendTelegram(token, chatId, `🔔 <b>Polyblocks Alert</b>\n${rendered}`);
          ctx.log(node.id, `📱 Telegram sent to chat ${chatId}`);
        } catch (err) {
          ctx.log(node.id, `📱 Telegram failed: ${(err as Error).message}`);
        }
      } else {
        ctx.log(node.id, "📱 Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env");
      }
    }

    return {};
  },
};

// ── Utility ─────────────────────────────────────────────────────────────────

const debugLogHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const label = String(node.config.label || "debug");
    ctx.log(node.id, `🐛 [${label}] ${JSON.stringify(inputs.value)}`);
    return {};
  },
};

const delayHandler: NodeHandler = {
  async execute(node, _inputs, ctx) {
    const delayMs = Number(node.config.delayMs || 5000);
    // In paper mode, we don't actually wait — just note the delay
    ctx.log(node.id, `⏳ Delay ${delayMs}ms (simulated)`);
    return { signal: true };
  },
};

const noteHandler: NodeHandler = {
  async execute() {
    // Notes are never executed
    return {};
  },
};

// ── New blocks ──────────────────────────────────────────────────────────────

const notGateHandler: NodeHandler = {
  async execute(_node, inputs) {
    const value = Boolean(inputs.value);
    const result = !value;
    return { result, signal: result ? true : null };
  },
};

const ifElseHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const condition = Boolean(inputs.condition);
    ctx.log(node.id, `Condition: ${condition} → routing to ${condition ? "THEN" : "ELSE"}`);
    return {
      then: condition ? true : null,
      else: condition ? null : true,
    };
  },
};

const multiMarketCompareHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const marketA = inputs.marketA as { clobTokenIds?: string[]; tokens?: Array<{ token_id: string }> } | undefined;
    const marketB = inputs.marketB as { clobTokenIds?: string[]; tokens?: Array<{ token_id: string }> } | undefined;

    if (!marketA || !marketB) return { delta: null, ratio: null, spreadAB: null };

    const side = String(node.config.side || "YES");
    const idx = side === "YES" ? 0 : 1;

    const tokenIdsA = marketA.clobTokenIds || marketA.tokens?.map((t) => t.token_id) || [];
    const tokenIdsB = marketB.clobTokenIds || marketB.tokens?.map((t) => t.token_id) || [];
    const tokenA = tokenIdsA[idx] || tokenIdsA[0];
    const tokenB = tokenIdsB[idx] || tokenIdsB[0];

    if (!tokenA || !tokenB) return { delta: null, ratio: null, spreadAB: null };

    const [midA, midB] = await Promise.all([
      fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenA}`) as Promise<{ mid: string }>,
      fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenB}`) as Promise<{ mid: string }>,
    ]);

    const priceA = parseFloat(midA.mid);
    const priceB = parseFloat(midB.mid);
    const delta = priceA - priceB;
    const ratio = priceB !== 0 ? priceA / priceB : 0;
    const spreadAB = Math.abs(delta);

    ctx.log(node.id, `A: ${priceA.toFixed(4)}, B: ${priceB.toFixed(4)}, Δ: ${delta.toFixed(4)}, Ratio: ${ratio.toFixed(4)}`);
    return { delta, ratio, spreadAB };
  },
};

const positionSizerHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const price = Number(inputs.price || 0.5);
    const edge = Number(inputs.edge || 0);
    const bankroll = Number(node.config.bankroll || 1000);
    const maxFraction = Number(node.config.maxFraction || 0.25);
    const mode = String(node.config.mode || "kelly");

    let kellyFraction = 0;

    if (mode === "kelly" || mode === "half_kelly") {
      // Kelly criterion for binary outcome:
      // f* = (p * b - q) / b   where p = implied prob, b = odds, q = 1-p
      // Simplified for prediction markets: f* = edge / (price * (1 - price))
      // edge = estimated true probability - market price
      const variance = price * (1 - price);
      if (variance > 0) {
        kellyFraction = edge / variance;
      }
      if (mode === "half_kelly") {
        kellyFraction *= 0.5;
      }
    } else if (mode === "fixed") {
      kellyFraction = maxFraction;
    } else if (mode === "equal") {
      kellyFraction = maxFraction;
    }

    // Clamp to [0, maxFraction]
    kellyFraction = Math.max(0, Math.min(kellyFraction, maxFraction));
    const sizeUsd = bankroll * kellyFraction;

    ctx.log(
      node.id,
      `${mode} | edge: ${edge.toFixed(4)}, price: ${price.toFixed(4)}, kelly: ${(kellyFraction * 100).toFixed(1)}%, size: $${sizeUsd.toFixed(2)}`,
    );

    return { sizeUsd, kellyFraction };
  },
};

const eventResolutionTriggerHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const market = inputs.market as { conditionId?: string } | undefined;
    if (!market?.conditionId) return { signal: false, resolved: false, outcome: "" };

    try {
      const data = (await fetchJson(
        `${GAMMA_HOST}/markets?id=${market.conditionId}`,
      )) as Array<{
        active?: boolean;
        closed?: boolean;
        resolved?: boolean;
        outcome?: string;
        end_date_iso?: string;
      }>;

      const mkt = Array.isArray(data) ? data[0] : data;
      const isResolved = Boolean(mkt?.resolved) || Boolean(mkt?.closed) || mkt?.active === false;
      const outcome = String(mkt?.outcome || "");

      ctx.log(
        node.id,
        isResolved
          ? `✅ Market RESOLVED — outcome: ${outcome || "unknown"}`
          : "⏳ Market still active",
      );

      return {
        signal: isResolved ? true : null,
        resolved: isResolved,
        outcome,
      };
    } catch (err) {
      ctx.log(node.id, `Failed to check resolution: ${err}`);
      return { signal: null, resolved: false, outcome: "" };
    }
  },
};

// ── Probability / EV / Edge blocks ──────────────────────────────────────────

const probabilityCalcHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const price = Number(inputs.price || 0);
    const vigAdjust = Boolean(node.config.vigAdjust);
    const vig = Number(node.config.vig || 0.02);

    let impliedProb = price;
    if (vigAdjust && vig > 0) {
      // Remove vig: implied = price / (1 + vig)
      impliedProb = price / (1 + vig);
    }

    const complement = 1 - impliedProb;
    const odds = impliedProb > 0 ? 1 / impliedProb : 0;

    ctx.log(node.id, `Price: ${price.toFixed(4)} → Prob: ${(impliedProb * 100).toFixed(1)}%, Complement: ${(complement * 100).toFixed(1)}%, Odds: ${odds.toFixed(2)}`);

    return { impliedProb, complement, odds };
  },
};

const expectedValueHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const estimatedProb = Number(inputs.estimatedProb || 0);
    const marketPrice = Number(inputs.marketPrice || 0);
    const minEv = Number(node.config.minEv || 0);

    // EV = (estimatedProb * payout) - cost
    // For binary: buy at marketPrice, win 1.00 with prob estimatedProb
    // EV = estimatedProb * (1 - marketPrice) - (1 - estimatedProb) * marketPrice
    //    = estimatedProb - marketPrice
    const ev = estimatedProb - marketPrice;
    const evPercent = marketPrice > 0 ? (ev / marketPrice) * 100 : 0;

    const profitable = ev >= minEv;
    ctx.log(node.id, `EV: ${ev.toFixed(4)} (${evPercent.toFixed(1)}%) | ${profitable ? "✅ POSITIVE" : "❌ NEGATIVE"}`);

    return { ev, evPercent, signal: profitable ? true : null };
  },
};

const edgeCalcHandler: NodeHandler = {
  async execute(node, inputs, ctx) {
    const estimatedProb = Number(inputs.estimatedProb || 0);
    const marketPrice = Number(inputs.marketPrice || 0);
    const minEdge = Number(node.config.minEdge || 0.02);

    // Edge = estimated true probability − market implied probability
    const edge = estimatedProb - marketPrice;
    const edgePercent = edge * 100;

    const hasEdge = edge >= minEdge;
    ctx.log(node.id, `Edge: ${edge.toFixed(4)} (${edgePercent.toFixed(1)}%) | Min: ${minEdge} | ${hasEdge ? "✅ EDGE FOUND" : "❌ NO EDGE"}`);

    return { edge, edgePercent, signal: hasEdge ? true : null };
  },
};

// ── User Activity / Copy-Trading block ──────────────────────────────────────

const ACTIVITY_HOST = "https://data-api.polymarket.com";

const userActivityHandler: NodeHandler = {
  async execute(node, _inputs, ctx) {
    const targetAddress = String(node.config.targetAddress || "").trim();
    const ignoreFirstFetch = Boolean(node.config.ignoreFirstFetch);
    const ignoreDuplicates = Boolean(node.config.ignoreDuplicates);

    const emptyOut = { market: null, side: "", size: 0, price: 0, outcome: "", title: "", signal: null };

    if (!targetAddress) {
      ctx.log(node.id, "⚠️ No target address configured");
      return emptyOut;
    }

    ctx.log(node.id, `🔍 Fetching latest trade for ${targetAddress.slice(0, 8)}… (ignoreFirst=${ignoreFirstFetch}, dedup=${ignoreDuplicates})`);

    // Always fetch only the latest 1 trade
    const url = `${ACTIVITY_HOST}/activity?user=${encodeURIComponent(targetAddress)}&limit=1&sortBy=TIMESTAMP&sortDirection=DESC`;

    let activities: Array<{
      transactionHash?: string;
      conditionId?: string;
      side?: string;
      asset?: string;
      title?: string;
      outcome?: string;
      size?: number | string;
      usdcSize?: number | string;
      price?: number | string;
      timestamp?: number;
    }>;

    try {
      activities = (await fetchJson(url)) as typeof activities;
    } catch (err) {
      ctx.log(node.id, `❌ Failed to fetch activity: ${err}`);
      return emptyOut;
    }

    if (!Array.isArray(activities) || activities.length === 0) {
      ctx.log(node.id, "📭 No activity found — check that the address is a valid Polymarket wallet");
      return emptyOut;
    }

    const trade = activities[0];
    const txHash = trade.transactionHash || "";
    const tradeSide = String(trade.side || "");
    const tradeOutcome = String(trade.outcome || "");
    const tradeSize = parseFloat(String(trade.usdcSize ?? trade.size ?? "0"));
    const tradePrice = parseFloat(String(trade.price ?? "0"));
    const tradeTitle = String(trade.title || "Unknown");
    const tokenId = String(trade.asset || "");
    const conditionId = String(trade.conditionId || "");

    ctx.log(node.id, `✅ Latest: ${tradeSide} ${tradeOutcome} "${tradeTitle.slice(0, 40)}" — $${tradeSize.toFixed(2)} @ ${tradePrice.toFixed(4)}`);

    // ── State keys ──────────────────────────────────────────────────────
    const firstFetchKey = `userActivity_firstFetch_${node.id}`;
    const seenHashesKey = `userActivity_seenHashes_${node.id}`;

    // ── First-fetch handling ────────────────────────────────────────────
    const hasRunBefore = ctx.state.get(firstFetchKey) as boolean | undefined;
    if (!hasRunBefore) {
      ctx.state.set(firstFetchKey, true);
      const initialHashes = new Set([txHash].filter(Boolean));
      ctx.state.set(seenHashesKey, initialHashes);

      if (ignoreFirstFetch) {
        ctx.log(node.id, `⏭️ SKIPPED (first fetch) — ${tradeSide} ${tradeOutcome} "${tradeTitle.slice(0, 35)}" $${tradeSize.toFixed(2)} — will only act on NEW trades from now on`);
        return emptyOut;
      }
    }

    // ── Dedup handling ──────────────────────────────────────────────────
    if (ignoreDuplicates) {
      const seenHashes = (ctx.state.get(seenHashesKey) as Set<string>) || new Set<string>();
      if (seenHashes.has(txHash)) {
        ctx.log(node.id, "♻️ No new trades since last fetch");
        return emptyOut;
      }
      seenHashes.add(txHash);
      ctx.state.set(seenHashesKey, seenHashes);
    }

    // ── Resolve token ID into a proper market object ────────────────────
    let market: unknown = null;
    if (conditionId) {
      try {
        market = await fetchJson(`${CLOB_HOST}/markets/${conditionId}`);
        ctx.log(node.id, `🏪 Resolved market from conditionId`);
      } catch {
        // Fallback: construct a minimal market object from the activity data
        market = { conditionId, clobTokenIds: [tokenId], question_id: conditionId };
        ctx.log(node.id, `🏪 Built market from activity data (CLOB lookup failed)`);
      }
    } else if (tokenId) {
      // Minimal market object with just the token
      market = { conditionId: "", clobTokenIds: [tokenId] };
      ctx.log(node.id, `🏪 Built minimal market from token ID`);
    }

    ctx.log(
      node.id,
      `📊 NEW trade → ${tradeSide} ${tradeOutcome} "${tradeTitle.slice(0, 35)}" — $${tradeSize.toFixed(2)} @ ${tradePrice.toFixed(4)} ✅ Signal fired`,
    );

    return {
      market,
      side: tradeSide,
      size: tradeSize,
      price: tradePrice,
      outcome: tradeOutcome,
      title: tradeTitle,
      signal: true,
    };
  },
};

// ── Custom API Data ─────────────────────────────────────────────────────────

const customApiDataHandler: NodeHandler = {
  async execute(node, _inputs, ctx) {
    const url = String(node.config.url || "");
    const method = String(node.config.method || "GET").toUpperCase();
    const headersRaw = String(node.config.headers || "{}");
    const body = String(node.config.body || "");
    const jsonPath = String(node.config.jsonPath || "");

    if (!url) {
      ctx.log(node.id, "⚠️ No URL configured");
      return { value: 0, text: "", json: "", signal: null };
    }

    try {
      let parsedHeaders: Record<string, string> = {};
      try { parsedHeaders = JSON.parse(headersRaw); } catch { /* ignore */ }

      const fetchOpts: RequestInit = {
        method,
        headers: { "Content-Type": "application/json", ...parsedHeaders },
      };
      if (method !== "GET" && method !== "HEAD" && body) {
        fetchOpts.body = body;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as unknown;
      const jsonStr = JSON.stringify(data);

      // Extract value using simple JSON path (e.g. "main.temp" or "data.0.price")
      let extracted: unknown = data;
      if (jsonPath) {
        const parts = jsonPath.split(".");
        for (const part of parts) {
          if (extracted == null) break;
          if (typeof extracted === "object") {
            extracted = (extracted as Record<string, unknown>)[part];
          }
        }
      }

      const numVal = typeof extracted === "number" ? extracted : parseFloat(String(extracted));
      const textVal = String(extracted ?? "");

      ctx.log(node.id, `🌐 ${method} ${url} → ${jsonPath ? jsonPath + " = " + textVal : "OK (" + jsonStr.length + " chars)"}`);

      return {
        value: isNaN(numVal) ? 0 : numVal,
        text: textVal,
        json: jsonStr,
        signal: true,
      };
    } catch (err) {
      ctx.log(node.id, `🌐 API error: ${(err as Error).message}`);
      return { value: 0, text: "", json: "", signal: null };
    }
  },
};

// ─── Registry ───────────────────────────────────────────────────────────────

export function createPaperHandlers(): NodeHandlerRegistry {
  const registry: NodeHandlerRegistry = new Map();

  registry.set(BlockType.IntervalTrigger, intervalTriggerHandler);
  registry.set(BlockType.ManualTrigger, manualTriggerHandler);
  registry.set(BlockType.PriceCrossTrigger, priceCrossTriggerHandler);
  registry.set(BlockType.MarketSelector, marketSelectorHandler);
  registry.set(BlockType.PriceData, priceDataHandler);
  registry.set(BlockType.SpreadData, spreadDataHandler);
  registry.set(BlockType.OrderBookData, orderBookDataHandler);
  registry.set(BlockType.AndGate, andGateHandler);
  registry.set(BlockType.OrGate, orGateHandler);
  registry.set(BlockType.ThresholdCompare, thresholdCompareHandler);
  registry.set(BlockType.Cooldown, cooldownHandler);
  registry.set(BlockType.MathOp, mathOpHandler);
  registry.set(BlockType.MaxExposure, maxExposureHandler);
  registry.set(BlockType.DailyLossLimit, dailyLossLimitHandler);
  registry.set(BlockType.KillSwitch, killSwitchHandler);
  registry.set(BlockType.PlaceOrder, placeOrderHandler);
  registry.set(BlockType.LimitOrder, limitOrderHandler);
  registry.set(BlockType.CancelOrder, cancelOrderHandler);
  registry.set(BlockType.ClosePosition, closePositionHandler);
  registry.set(BlockType.Notification, notificationHandler);
  registry.set(BlockType.DebugLog, debugLogHandler);
  registry.set(BlockType.Delay, delayHandler);
  registry.set(BlockType.Note, noteHandler);
  registry.set(BlockType.NotGate, notGateHandler);
  registry.set(BlockType.IfElse, ifElseHandler);
  registry.set(BlockType.MultiMarketCompare, multiMarketCompareHandler);
  registry.set(BlockType.PositionSizer, positionSizerHandler);
  registry.set(BlockType.EventResolutionTrigger, eventResolutionTriggerHandler);
  registry.set(BlockType.ProbabilityCalc, probabilityCalcHandler);
  registry.set(BlockType.ExpectedValue, expectedValueHandler);
  registry.set(BlockType.EdgeCalc, edgeCalcHandler);
  registry.set(BlockType.UserActivity, userActivityHandler);
  registry.set(BlockType.CustomApiData, customApiDataHandler);

  return registry;
}
