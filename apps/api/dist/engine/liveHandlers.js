/**
 * Live Trading Node Handlers
 *
 * Identical to paper handlers for data/logic/risk blocks, but PlaceOrder,
 * CancelOrder, and ClosePosition use the real Polymarket CLOB client to
 * submit actual orders on Polygon mainnet.
 */
import { BlockType } from "@polyblocks/types";
import { ClobClient, Side, OrderType, AssetType } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { getCredentials, ensureApprovals } from "../routes/credentials.js";
import { createPaperHandlers } from "./paperHandlers.js";
import { builderConfig } from "../builderConfig.js";
const CLOB_HOST = process.env.POLYMARKET_CLOB_HOST || "https://clob.polymarket.com";
const CHAIN_ID = 137;
// ── In-Memory ClobClient Cache ──────────────────────────────────────────────
// Re-initializing ethers.Wallet from private keys and fetching DB credentials
// on every block execution adds 30-50ms latency. We cache the client per user
// for 5 minutes to significantly optimize execution speed for live trades.
const clobClientCache = new Map();
const CLIENT_CACHE_TTL_MS = 5 * 60_000;
// Track which users have already had their approvals verified this session.
// Only EOA (signatureType 0) wallets need on-chain approvals — proxy wallets
// are managed by Polymarket's infrastructure.
const approvalCheckedUsers = new Set();
async function createClobClientAsync(userId) {
    const creds = await getCredentials(userId);
    if (!creds.isConfigured) {
        throw new Error("No trading credentials configured. Go to Settings to set up your wallet.");
    }
    // Use a hash of the credentials as the cache key so it instantly invalidates if the user updates their API key or Wallet
    const cacheKey = `${userId || "anon"}_${creds.apiKey}_${creds.privateKey.slice(0, 10)}`;
    const cached = clobClientCache.get(cacheKey);
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
        return cached.client;
    }
    const signer = new Wallet(creds.privateKey);
    const signerAddr = await signer.getAddress();
    // ── Auto-fix signatureType ──────────────────────────────────────────────
    // signatureType 0 (EOA): maker === signer, plain wallet signs for itself.
    // signatureType 1 (POLY_PROXY): signer is an EOA signing on behalf of a
    //   DIFFERENT proxy contract wallet (the funderAddress/maker).
    //
    // Auto-detect the correct type based on whether funder differs from signer:
    let signatureType = creds.signatureType;
    const funderAddr = creds.funderAddress || signerAddr;
    const funderIsDifferent = funderAddr.toLowerCase() !== signerAddr.toLowerCase();
    if (funderIsDifferent && signatureType === 0) {
        console.log(`[LIVE] ⚠️  funder (${funderAddr}) ≠ signer (${signerAddr}) but signatureType was 0 (EOA) — auto-correcting to 1 (POLY_PROXY)`);
        signatureType = 1;
    }
    else if (!funderIsDifferent && signatureType === 1) {
        console.log(`[LIVE] ⚠️  funder === signer but signatureType was 1 (POLY_PROXY) — auto-correcting to 0 (EOA)`);
        signatureType = 0;
    }
    const newClient = new ClobClient(CLOB_HOST, CHAIN_ID, signer, {
        key: creds.apiKey,
        secret: creds.apiSecret,
        passphrase: creds.passphrase,
    }, signatureType, funderAddr, undefined, false, builderConfig);
    clobClientCache.set(cacheKey, { client: newClient, expiresAt: now + CLIENT_CACHE_TTL_MS });
    // ── One-time approval check for EOA wallets ─────────────────────────────
    // Verify that USDC.e and CTF allowances are set. This is a safety net for
    // users who saved credentials before the auto-approve feature existed, or
    // whose wallet had no gas at the time of credential save.
    const approvalKey = `${userId || "anon"}_${creds.privateKey.slice(0, 10)}`;
    if (signatureType === 0 && !approvalCheckedUsers.has(approvalKey)) {
        approvalCheckedUsers.add(approvalKey);
        ensureApprovals(creds.privateKey).then((result) => {
            if (result.success) {
                console.log(`[LIVE] Contract approvals verified for user ${userId}:`, result.approvals);
            }
            else {
                console.warn(`[LIVE] Approval check issues for user ${userId}:`, result.errors);
            }
        }).catch((err) => {
            console.warn(`[LIVE] Approval check failed for user ${userId}:`, err);
            approvalCheckedUsers.delete(approvalKey);
        });
    }
    return newClient;
}
// ── Live market order placement ──────────────────────────────────────────────
// Uses createAndPostMarketOrder — a TRUE market order that automatically
// reads the order book and calculates the best fill price.
// BUY amount = USD to spend, SELL amount = shares to sell.
const livePlaceOrderHandler = {
    async execute(node, inputs, ctx) {
        const t0 = Date.now();
        const market = inputs.market;
        const side = inputs.side ? String(inputs.side) : String(node.config.side || "BUY");
        const outcome = inputs.outcome ? String(inputs.outcome) : String(node.config.outcome || "YES");
        const sizeUsd = inputs.sizeUsd ? Number(inputs.sizeUsd) : Number(node.config.sizeUsd || 10);
        // Order type: FOK (Fill-Or-Kill) or FAK (Fill-And-Kill / IOC)
        const orderTypeStr = String(node.config.orderType || "FOK").toUpperCase();
        const orderType = orderTypeStr === "FAK" ? OrderType.FAK : OrderType.FOK;
        const marketConditionId = market?.conditionId || "";
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
        if (!tokenId) {
            const debugInfo = market
                ? `Market found but no token IDs (keys: ${Object.keys(market).join(", ")})`
                : "No market data received — check that Market Selector is connected and has a market selected.";
            throw new Error(`No token ID available for order placement. ${debugInfo}`);
        }
        const sideEnum = side === "BUY" ? Side.BUY : Side.SELL;
        ctx.log(node.id, `🔴 LIVE MARKET ${orderTypeStr} ${side} ${outcome} | $${sizeUsd} USD`);
        const client = await createClobClientAsync(ctx.userId);
        const clientReady = Date.now() - t0;
        ctx.log(node.id, `🔑 Client ready in ${clientReady}ms | tokenId: ${tokenId}`);
        ctx.log(node.id, `🔑 CLOB_HOST: ${CLOB_HOST}`);
        try {
            // Use the SDK's true market order method.
            // For BUY: amount = USD to spend.  For SELL: amount = shares to sell.
            // The SDK automatically reads the order book and calculates the best
            // execution price — no manual midpoint/price lookup needed.
            const response = await client.createAndPostMarketOrder({
                tokenID: tokenId,
                amount: sizeUsd,
                side: sideEnum,
                orderType,
            }, undefined, // options — SDK resolves tickSize & negRisk automatically
            orderType);
            // Log the full response for debugging
            ctx.log(node.id, `📋 CLOB Response: ${JSON.stringify(response)}`);
            // ── Detect HTTP-level errors ──────────────────────────────────────
            // The SDK's error handler returns { error: "...", status: 403 } for
            // HTTP errors instead of throwing. Detect numeric status or error field.
            const resp = response;
            const httpStatus = Number(resp.status) || 0;
            if (httpStatus >= 400 || resp.error) {
                const errMsg = String(resp.error || `HTTP ${httpStatus}`);
                let hint = "";
                if (httpStatus === 403) {
                    hint = "\n\n💡 403 Forbidden — common causes:\n" +
                        "  1. API credentials expired → Go to Settings, clear & re-save your credentials\n" +
                        "  2. Token allowance not set → Go to Settings and click 'Approve Contracts', or re-save your credentials\n" +
                        "  3. Insufficient USDC balance on Polygon for this trade size";
                }
                else if (httpStatus === 401) {
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
            const totalMs = Date.now() - t0;
            const statusLabel = filled
                ? `FILLED` + (response.takingAmount ? ` — received ${response.takingAmount} shares` : "")
                : `${rawStatus ?? "unknown"}` + (orderTypeStr === "FOK" ? " (order killed — no full fill available at this size)" : " (partial fill — remainder killed)");
            ctx.log(node.id, `${statusEmoji} LIVE MARKET ORDER — ID: ${response.orderID}, Status: ${statusLabel} [${totalMs}ms total]`);
            if (response.transactionsHashes?.length) {
                ctx.log(node.id, `🔗 Tx: ${response.transactionsHashes.join(", ")}`);
            }
            // Track exposure
            const prevExposure = ctx.state.get("paperExposureUsd") || 0;
            if (filled) {
                ctx.state.set("paperExposureUsd", prevExposure + sizeUsd);
            }
            // Get fill price from response or estimate from size
            let fillPrice = 0.5;
            if (response.takingAmount && response.makingAmount) {
                fillPrice = Number(response.makingAmount) / Number(response.takingAmount);
            }
            const shares = sizeUsd / fillPrice;
            const liveOrder = {
                id: response.orderID || `live_${Date.now()}`,
                side,
                outcome,
                price: fillPrice,
                size: shares,
                sizeUsd,
                tokenId,
                conditionId: market?.conditionId,
                filled,
                timestamp: Date.now(),
            };
            return {
                order: liveOrder,
                orderId: response.orderID || "",
                filled,
                status: rawStatus != null ? String(rawStatus) : "unknown",
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.log(node.id, `❌ LIVE MARKET ORDER FAILED: ${msg}`);
            throw new Error(`Live market order failed: ${msg}`);
        }
    },
};
const liveCancelOrderHandler = {
    async execute(node, inputs, ctx) {
        const orderId = inputs.orderId ? String(inputs.orderId) : "";
        if (!orderId) {
            ctx.log(node.id, "No order ID to cancel");
            return { cancelled: false };
        }
        try {
            const client = await createClobClientAsync(ctx.userId);
            await client.cancelOrder({ orderID: orderId });
            ctx.log(node.id, `✅ LIVE CANCEL — Order ${orderId} cancelled`);
            return { cancelled: true };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.log(node.id, `❌ CANCEL FAILED: ${msg}`);
            throw new Error(`Cancel failed: ${msg}`);
        }
    },
};
const liveClosePositionHandler = {
    async execute(node, inputs, ctx) {
        const market = inputs.market;
        if (!market) {
            ctx.log(node.id, "No market provided for close position");
            return { closed: false };
        }
        const outcome = inputs.outcome ? String(inputs.outcome) : String(node.config.outcome || "YES");
        const tokenIds = market?.clobTokenIds || market?.tokens?.map((t) => t.token_id) || [];
        const tokenId = outcome === "YES" ? tokenIds[0] : tokenIds[1] || tokenIds[0];
        if (!tokenId) {
            throw new Error("No token ID for close");
        }
        ctx.log(node.id, `🔴 LIVE CLOSE POSITION — querying balance for ${outcome} token`);
        try {
            const client = await createClobClientAsync(ctx.userId);
            // Query actual position size from the CLOB API
            const balanceResponse = await client.getBalanceAllowance({ asset_type: AssetType.CONDITIONAL });
            ctx.log(node.id, `📋 Balance/Allowance: ${JSON.stringify(balanceResponse)}`);
            // Try to get shares from open orders / positions
            // For a quick sell, use the amount from the input if provided
            let sharesToSell = inputs.shares ? Number(inputs.shares) : Number(node.config.shares || 0);
            if (sharesToSell <= 0) {
                // Default: try selling $10 worth as a market sell (the SDK will figure out the price)
                sharesToSell = Number(node.config.sizeUsd || inputs.sizeUsd || 10);
                ctx.log(node.id, `⚠️  No share amount specified — using ${sharesToSell} as sell amount`);
            }
            ctx.log(node.id, `🔴 LIVE MARKET SELL ${outcome} | ${sharesToSell} shares`);
            const response = await client.createAndPostMarketOrder({
                tokenID: tokenId,
                amount: sharesToSell,
                side: Side.SELL,
                orderType: OrderType.FOK,
            }, undefined, OrderType.FOK);
            ctx.log(node.id, `📋 CLOB Response: ${JSON.stringify(response)}`);
            // Detect errors
            const resp = response;
            const httpStatus = Number(resp.status) || 0;
            if (httpStatus >= 400 || resp.error) {
                const errMsg = String(resp.error || `HTTP ${httpStatus}`);
                ctx.log(node.id, `❌ Close failed: ${errMsg}`);
                throw new Error(`Close position failed: ${errMsg}`);
            }
            const rawStatus = response.status;
            const status = (rawStatus != null ? String(rawStatus) : "").toLowerCase();
            const filled = status === "matched" || status === "filled";
            ctx.log(node.id, `${filled ? "✅" : "⚠️"} LIVE CLOSE — Order ${response.orderID}, Status: ${rawStatus}`);
            return { closed: filled, orderId: response.orderID || "", status: rawStatus };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.log(node.id, `❌ CLOSE FAILED: ${msg}`);
            throw new Error(`Close position failed: ${msg}`);
        }
    },
};
// ── Live Limit Order ─────────────────────────────────────────────────────────
const liveLimitOrderHandler = {
    async execute(node, inputs, ctx) {
        const market = inputs.market;
        const side = inputs.side ? String(inputs.side) : String(node.config.side || "BUY");
        const outcome = inputs.outcome ? String(inputs.outcome) : String(node.config.outcome || "YES");
        const sizeUsd = inputs.sizeUsd ? Number(inputs.sizeUsd) : Number(node.config.sizeUsd || 10);
        const limitPrice = inputs.limitPrice ? Number(inputs.limitPrice) : Number(node.config.limitPrice || 0.5);
        const marketConditionId = market?.conditionId || "";
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
        if (!tokenId) {
            throw new Error("No token ID available for limit order");
        }
        const shares = Math.floor((sizeUsd / limitPrice) * 100) / 100;
        const sideEnum = side === "BUY" ? Side.BUY : Side.SELL;
        ctx.log(node.id, `🔴 LIVE LIMIT ${side} ${outcome} | ${shares.toFixed(2)} shares @ $${limitPrice.toFixed(3)} ($${sizeUsd})`);
        try {
            const client = await createClobClientAsync(ctx.userId);
            const marketInfo = await client.getMarket(market?.conditionId || "");
            const response = await client.createAndPostOrder({
                tokenID: tokenId,
                price: limitPrice,
                size: shares,
                side: sideEnum,
            }, {
                tickSize: marketInfo.minimum_tick_size || "0.01",
                negRisk: marketInfo.neg_risk || false,
            }, OrderType.GTC);
            // Log the full response for debugging
            ctx.log(node.id, `📋 CLOB Response: ${JSON.stringify(response)}`);
            // ── Detect HTTP-level errors ──────────────────────────────────────
            const resp = response;
            const httpStatus = Number(resp.status) || 0;
            if (httpStatus >= 400 || resp.error) {
                const errMsg = String(resp.error || `HTTP ${httpStatus}`);
                let hint = "";
                if (httpStatus === 403) {
                    hint = "\n\n💡 403 Forbidden — common causes:\n" +
                        "  1. API credentials expired → Go to Settings, clear & re-save your credentials\n" +
                        "  2. Token allowance not set → Go to Settings and click 'Approve Contracts', or re-save your credentials\n" +
                        "  3. Insufficient USDC balance on Polygon for this trade size";
                }
                else if (httpStatus === 401) {
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
            ctx.log(node.id, `${statusEmoji} LIVE LIMIT ORDER — ID: ${response.orderID}, Status: ${statusLabel}`);
            const liveOrder = {
                id: response.orderID || `live_limit_${Date.now()}`,
                side,
                outcome,
                price: limitPrice,
                size: shares,
                sizeUsd,
                tokenId,
                conditionId: market?.conditionId,
                filled,
                timestamp: Date.now(),
            };
            return {
                order: liveOrder,
                orderId: response.orderID || "",
                placed: true,
                filled,
                status: rawStatus != null ? String(rawStatus) : "unknown",
                live,
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.log(node.id, `❌ LIVE LIMIT ORDER FAILED: ${msg}`);
            throw new Error(`Limit order failed: ${msg}`);
        }
    },
};
// ─── Registry ───────────────────────────────────────────────────────────────
export function createLiveHandlers(userId) {
    // Start with all paper handlers (data, logic, triggers, risk all work the same)
    const registry = createPaperHandlers();
    // Override action blocks with live implementations, passing down the userId
    registry.set(BlockType.PlaceOrder, {
        execute: (node, inputs, ctx) => livePlaceOrderHandler.execute(node, inputs, { ...ctx, userId })
    });
    registry.set(BlockType.LimitOrder, {
        execute: (node, inputs, ctx) => liveLimitOrderHandler.execute(node, inputs, { ...ctx, userId })
    });
    registry.set(BlockType.CancelOrder, {
        execute: (node, inputs, ctx) => liveCancelOrderHandler.execute(node, inputs, { ...ctx, userId })
    });
    registry.set(BlockType.ClosePosition, {
        execute: (node, inputs, ctx) => liveClosePositionHandler.execute(node, inputs, { ...ctx, userId })
    });
    return registry;
}
//# sourceMappingURL=liveHandlers.js.map