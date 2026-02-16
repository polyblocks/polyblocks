/**
 * Paper Trading Node Handlers
 *
 * Each handler implements the NodeHandler interface for a specific BlockType.
 * In paper mode, order execution is simulated against real CLOB order book
 * snapshots — no actual trades are placed.
 */
import { BlockType, } from "@polyblocks/types";
const CLOB_HOST = process.env.POLYMARKET_CLOB_HOST || "https://clob.polymarket.com";
const GAMMA_HOST = process.env.POLYMARKET_GAMMA_HOST || "https://gamma-api.polymarket.com";
// ─── Utility ────────────────────────────────────────────────────────────────
async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`API error ${res.status}: ${url}`);
    return res.json();
}
// ─── Handlers ───────────────────────────────────────────────────────────────
const intervalTriggerHandler = {
    async execute(_node, _inputs, _ctx) {
        // Interval triggers always fire — the scheduler is responsible for timing
        return { signal: true };
    },
};
const manualTriggerHandler = {
    async execute(_node, _inputs, _ctx) {
        return { signal: true };
    },
};
const priceCrossTriggerHandler = {
    async execute(node, inputs, ctx) {
        const market = inputs.market;
        if (!market)
            return { signal: false, price: null };
        const tokenId = market.clobTokenIds[0];
        const data = (await fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenId}`));
        const price = parseFloat(data.mid);
        const threshold = Number(node.config.threshold);
        const direction = String(node.config.direction);
        const crossed = direction === "above" ? price >= threshold : price <= threshold;
        ctx.log(node.id, `Price: ${price}, Threshold: ${threshold}, Crossed: ${crossed}`);
        return { signal: crossed, price };
    },
};
const marketSelectorHandler = {
    async execute(node, _inputs, ctx) {
        const conditionId = String(node.config.conditionId);
        if (!conditionId) {
            throw new Error("No market selected");
        }
        // Fetch market data from CLOB
        const market = await fetchJson(`${CLOB_HOST}/markets/${conditionId}`);
        ctx.log(node.id, `Selected market: ${conditionId}`);
        return { market };
    },
};
const priceDataHandler = {
    async execute(node, inputs, ctx) {
        const market = inputs.market;
        if (!market)
            return { midpoint: null, bestBid: null, bestAsk: null, lastTrade: null };
        const tokenIds = market.clobTokenIds || market.tokens?.map((t) => t.token_id) || [];
        const side = String(node.config.side || "YES");
        const tokenId = side === "YES" ? tokenIds[0] : tokenIds[1] || tokenIds[0];
        if (!tokenId)
            return { midpoint: null, bestBid: null, bestAsk: null, lastTrade: null };
        const [midData, bookData] = await Promise.all([
            fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenId}`),
            fetchJson(`${CLOB_HOST}/book?token_id=${tokenId}`),
        ]);
        const midpoint = parseFloat(midData.mid);
        // Sort bids descending (highest first), asks ascending (lowest first)
        const sortedBids = (bookData.bids || []).slice().sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
        const sortedAsks = (bookData.asks || []).slice().sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        const bestBid = sortedBids.length > 0 ? parseFloat(sortedBids[0].price) : null;
        const bestAsk = sortedAsks.length > 0 ? parseFloat(sortedAsks[0].price) : null;
        ctx.log(node.id, `Mid: ${midpoint}, Bid: ${bestBid}, Ask: ${bestAsk}`);
        return { midpoint, bestBid, bestAsk, lastTrade: midpoint };
    },
};
const spreadDataHandler = {
    async execute(node, inputs, ctx) {
        const market = inputs.market;
        if (!market?.clobTokenIds?.[0])
            return { spread: null };
        const tokenId = market.clobTokenIds[0];
        const data = (await fetchJson(`${CLOB_HOST}/spread?token_id=${tokenId}`));
        const spread = parseFloat(data.spread);
        ctx.log(node.id, `Spread: ${spread}`);
        return { spread };
    },
};
const orderBookDataHandler = {
    async execute(node, inputs, ctx) {
        const market = inputs.market;
        if (!market?.clobTokenIds?.[0])
            return { orderbook: null, bidDepth: 0, askDepth: 0 };
        const tokenId = market.clobTokenIds[0];
        const book = (await fetchJson(`${CLOB_HOST}/book?token_id=${tokenId}`));
        // Sort bids descending, asks ascending for correct ordering
        const sortedBids = (book.bids || []).slice().sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
        const sortedAsks = (book.asks || []).slice().sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
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
const priceHistoryHandler = {
    async execute(node, inputs, ctx) {
        const market = inputs.market;
        if (!market?.conditionId)
            return { prices: [], latest: null };
        const interval = String(node.config.interval || "1h");
        const fidelity = Number(node.config.fidelity || 60);
        const data = await fetchJson(`${CLOB_HOST}/prices-history?market=${market.conditionId}&interval=${interval}&fidelity=${fidelity}`);
        const prices = data;
        const latest = prices.length > 0 ? prices[prices.length - 1].p : null;
        ctx.log(node.id, `Got ${prices.length} price points, latest: ${latest}`);
        return { prices, latest };
    },
};
// ── Logic ───────────────────────────────────────────────────────────────────
const andGateHandler = {
    async execute(_node, inputs) {
        const a = Boolean(inputs.a);
        const b = Boolean(inputs.b);
        const result = a && b;
        return { result, signal: result ? true : null };
    },
};
const orGateHandler = {
    async execute(_node, inputs) {
        const a = Boolean(inputs.a);
        const b = Boolean(inputs.b);
        const result = a || b;
        return { result, signal: result ? true : null };
    },
};
const thresholdCompareHandler = {
    async execute(node, inputs, ctx) {
        const value = Number(inputs.value);
        const threshold = Number(node.config.threshold);
        const operator = String(node.config.operator);
        let result = false;
        switch (operator) {
            case ">":
                result = value > threshold;
                break;
            case ">=":
                result = value >= threshold;
                break;
            case "<":
                result = value < threshold;
                break;
            case "<=":
                result = value <= threshold;
                break;
            case "==":
                result = value === threshold;
                break;
            case "!=":
                result = value !== threshold;
                break;
        }
        ctx.log(node.id, `${value} ${operator} ${threshold} = ${result}`);
        return { result, signal: result ? true : null };
    },
};
const cooldownHandler = {
    async execute(node, _inputs, ctx) {
        const key = `cooldown_${node.id}`;
        const lastFired = ctx.state.get(key);
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
const mathOpHandler = {
    async execute(node, inputs) {
        const a = Number(inputs.a || 0);
        const b = Number(inputs.b || 0);
        const op = String(node.config.operator);
        let result;
        switch (op) {
            case "+":
                result = a + b;
                break;
            case "-":
                result = a - b;
                break;
            case "*":
                result = a * b;
                break;
            case "/":
                result = b !== 0 ? a / b : 0;
                break;
            default: result = 0;
        }
        return { result };
    },
};
// ── Risk ────────────────────────────────────────────────────────────────────
const maxExposureHandler = {
    async execute(node, _inputs, ctx) {
        const maxExposureUsd = Number(node.config.maxExposureUsd || 100);
        // In paper mode, track exposure via context state
        const currentExposure = ctx.state.get("paperExposureUsd") || 0;
        if (currentExposure >= maxExposureUsd) {
            ctx.log(node.id, `Exposure $${currentExposure} >= limit $${maxExposureUsd} — BLOCKED`);
            return { signal: null, blocked: true };
        }
        ctx.log(node.id, `Exposure $${currentExposure} < limit $${maxExposureUsd} — passed`);
        return { signal: true, blocked: false };
    },
};
const dailyLossLimitHandler = {
    async execute(node, _inputs, ctx) {
        const maxLoss = Number(node.config.maxDailyLossUsd || 50);
        const currentLoss = ctx.state.get("paperDailyLossUsd") || 0;
        if (currentLoss >= maxLoss) {
            ctx.log(node.id, `Daily loss $${currentLoss} >= limit $${maxLoss} — BLOCKED`);
            return { signal: null, blocked: true };
        }
        ctx.log(node.id, `Daily loss $${currentLoss} < limit $${maxLoss} — passed`);
        return { signal: true, blocked: false };
    },
};
const killSwitchHandler = {
    async execute(node, _inputs, ctx) {
        ctx.log(node.id, "KILL SWITCH ACTIVATED — strategy halted");
        // In a real system this would cancel all orders and stop the scheduler
        return {};
    },
};
// ── Actions (paper mode) ────────────────────────────────────────────────────
const placeOrderHandler = {
    async execute(node, inputs, ctx) {
        const market = inputs.market;
        const side = String(node.config.side || "BUY");
        const outcome = String(node.config.outcome || "YES");
        const orderType = String(node.config.orderType || "GTC");
        const sizeUsd = Number(node.config.sizeUsd || 10);
        const inputPrice = inputs.price;
        const tokenIds = market?.clobTokenIds || [];
        const tokenId = outcome === "YES" ? tokenIds[0] : tokenIds[1] || tokenIds[0];
        // Get current price to simulate fill
        let fillPrice = inputPrice ?? 0.5;
        if (tokenId) {
            try {
                const data = (await fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenId}`));
                fillPrice = parseFloat(data.mid);
            }
            catch {
                // Use input price as fallback
            }
        }
        const shares = sizeUsd / fillPrice;
        // Track paper exposure
        const prevExposure = ctx.state.get("paperExposureUsd") || 0;
        ctx.state.set("paperExposureUsd", prevExposure + sizeUsd);
        const paperOrder = {
            id: `paper_${Date.now()}`,
            type: orderType,
            side,
            outcome,
            price: fillPrice,
            size: shares,
            sizeUsd,
            tokenId,
            conditionId: market?.conditionId,
            filled: orderType !== "GTC", // GTC rests; FOK/FAK fill immediately in paper
            timestamp: Date.now(),
        };
        ctx.log(node.id, `📝 PAPER ${side} ${outcome} | ${shares.toFixed(2)} shares @ $${fillPrice.toFixed(3)} ($${sizeUsd}) [${orderType}]`);
        return { order: paperOrder, filled: paperOrder.filled ? true : null };
    },
};
const cancelOrderHandler = {
    async execute(node, inputs, ctx) {
        const order = inputs.order;
        ctx.log(node.id, `📝 PAPER CANCEL order ${order?.id ?? "unknown"}`);
        return { cancelled: true };
    },
};
const closePositionHandler = {
    async execute(node, _inputs, ctx) {
        ctx.log(node.id, "📝 PAPER CLOSE position");
        return { closed: true };
    },
};
const notificationHandler = {
    async execute(node, inputs, ctx) {
        const template = String(node.config.template || "{{message}}");
        const message = String(inputs.message || "Strategy event");
        const rendered = template.replace("{{message}}", message);
        ctx.log(node.id, `🔔 ${rendered}`);
        return {};
    },
};
// ── Utility ─────────────────────────────────────────────────────────────────
const debugLogHandler = {
    async execute(node, inputs, ctx) {
        const label = String(node.config.label || "debug");
        ctx.log(node.id, `🐛 [${label}] ${JSON.stringify(inputs.value)}`);
        return {};
    },
};
const delayHandler = {
    async execute(node, _inputs, ctx) {
        const delayMs = Number(node.config.delayMs || 5000);
        // In paper mode, we don't actually wait — just note the delay
        ctx.log(node.id, `⏳ Delay ${delayMs}ms (simulated)`);
        return { signal: true };
    },
};
const noteHandler = {
    async execute() {
        // Notes are never executed
        return {};
    },
};
// ── New blocks ──────────────────────────────────────────────────────────────
const notGateHandler = {
    async execute(_node, inputs) {
        const value = Boolean(inputs.value);
        const result = !value;
        return { result, signal: result ? true : null };
    },
};
const ifElseHandler = {
    async execute(node, inputs, ctx) {
        const condition = Boolean(inputs.condition);
        ctx.log(node.id, `Condition: ${condition} → routing to ${condition ? "THEN" : "ELSE"}`);
        return {
            then: condition ? true : null,
            else: condition ? null : true,
        };
    },
};
const multiMarketCompareHandler = {
    async execute(node, inputs, ctx) {
        const marketA = inputs.marketA;
        const marketB = inputs.marketB;
        if (!marketA || !marketB)
            return { delta: null, ratio: null, spreadAB: null };
        const side = String(node.config.side || "YES");
        const idx = side === "YES" ? 0 : 1;
        const tokenIdsA = marketA.clobTokenIds || marketA.tokens?.map((t) => t.token_id) || [];
        const tokenIdsB = marketB.clobTokenIds || marketB.tokens?.map((t) => t.token_id) || [];
        const tokenA = tokenIdsA[idx] || tokenIdsA[0];
        const tokenB = tokenIdsB[idx] || tokenIdsB[0];
        if (!tokenA || !tokenB)
            return { delta: null, ratio: null, spreadAB: null };
        const [midA, midB] = await Promise.all([
            fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenA}`),
            fetchJson(`${CLOB_HOST}/midpoint?token_id=${tokenB}`),
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
const positionSizerHandler = {
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
        }
        else if (mode === "fixed") {
            kellyFraction = maxFraction;
        }
        else if (mode === "equal") {
            kellyFraction = maxFraction;
        }
        // Clamp to [0, maxFraction]
        kellyFraction = Math.max(0, Math.min(kellyFraction, maxFraction));
        const sizeUsd = bankroll * kellyFraction;
        ctx.log(node.id, `${mode} | edge: ${edge.toFixed(4)}, price: ${price.toFixed(4)}, kelly: ${(kellyFraction * 100).toFixed(1)}%, size: $${sizeUsd.toFixed(2)}`);
        return { sizeUsd, kellyFraction };
    },
};
const eventResolutionTriggerHandler = {
    async execute(node, inputs, ctx) {
        const market = inputs.market;
        if (!market?.conditionId)
            return { signal: false, resolved: false, outcome: "" };
        try {
            const data = (await fetchJson(`${GAMMA_HOST}/markets?id=${market.conditionId}`));
            const mkt = Array.isArray(data) ? data[0] : data;
            const isResolved = Boolean(mkt?.resolved) || Boolean(mkt?.closed) || mkt?.active === false;
            const outcome = String(mkt?.outcome || "");
            ctx.log(node.id, isResolved
                ? `✅ Market RESOLVED — outcome: ${outcome || "unknown"}`
                : "⏳ Market still active");
            return {
                signal: isResolved ? true : null,
                resolved: isResolved,
                outcome,
            };
        }
        catch (err) {
            ctx.log(node.id, `Failed to check resolution: ${err}`);
            return { signal: null, resolved: false, outcome: "" };
        }
    },
};
// ─── Registry ───────────────────────────────────────────────────────────────
export function createPaperHandlers() {
    const registry = new Map();
    registry.set(BlockType.IntervalTrigger, intervalTriggerHandler);
    registry.set(BlockType.ManualTrigger, manualTriggerHandler);
    registry.set(BlockType.PriceCrossTrigger, priceCrossTriggerHandler);
    registry.set(BlockType.MarketSelector, marketSelectorHandler);
    registry.set(BlockType.PriceData, priceDataHandler);
    registry.set(BlockType.SpreadData, spreadDataHandler);
    registry.set(BlockType.OrderBookData, orderBookDataHandler);
    registry.set(BlockType.PriceHistory, priceHistoryHandler);
    registry.set(BlockType.AndGate, andGateHandler);
    registry.set(BlockType.OrGate, orGateHandler);
    registry.set(BlockType.ThresholdCompare, thresholdCompareHandler);
    registry.set(BlockType.Cooldown, cooldownHandler);
    registry.set(BlockType.MathOp, mathOpHandler);
    registry.set(BlockType.MaxExposure, maxExposureHandler);
    registry.set(BlockType.DailyLossLimit, dailyLossLimitHandler);
    registry.set(BlockType.KillSwitch, killSwitchHandler);
    registry.set(BlockType.PlaceOrder, placeOrderHandler);
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
    return registry;
}
//# sourceMappingURL=paperHandlers.js.map