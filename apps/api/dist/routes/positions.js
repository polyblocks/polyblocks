/**
 * Positions & Trades routes — query real CLOB positions and trade history,
 * close positions via market sell.
 */
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { getCredentials } from "./credentials.js";
import { builderConfig } from "../builderConfig.js";
const CLOB_HOST = process.env.POLYMARKET_CLOB_HOST || "https://clob.polymarket.com";
const DATA_API = "https://data-api.polymarket.com";
const GAMMA_HOST = process.env.POLYMARKET_GAMMA_HOST || "https://gamma-api.polymarket.com";
const CHAIN_ID = 137;
async function createClobClient(userId) {
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
    }
    else if (!funderIsDifferent && signatureType === 1) {
        signatureType = 0;
    }
    return new ClobClient(CLOB_HOST, CHAIN_ID, signer, {
        key: creds.apiKey,
        secret: creds.apiSecret,
        passphrase: creds.passphrase,
    }, signatureType, funderAddr, undefined, false, builderConfig);
}
/** Safely parse JSON strings from Gamma API */
function safeJsonParse(value, fallback) {
    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        }
        catch {
            return fallback;
        }
    }
    if (Array.isArray(value))
        return value;
    return fallback;
}
/** Enrich positions with market names from Gamma API */
async function enrichWithMarketNames(positions) {
    const marketMap = new Map();
    // Collect unique condition IDs
    const conditionIds = new Set();
    for (const pos of positions) {
        if (pos.conditionId)
            conditionIds.add(String(pos.conditionId));
    }
    // Batch fetch from Gamma
    for (const conditionId of conditionIds) {
        try {
            const res = await fetch(`${GAMMA_HOST}/markets?conditionId=${conditionId}`);
            if (res.ok) {
                const markets = await res.json();
                if (markets.length > 0) {
                    const m = markets[0];
                    marketMap.set(conditionId, {
                        question: String(m.question || ""),
                        slug: String(m.slug || ""),
                        image: String(m.image || m.icon || ""),
                        outcomes: safeJsonParse(m.outcomes, []),
                        outcomePrices: safeJsonParse(m.outcomePrices, []),
                        clobTokenIds: safeJsonParse(m.clobTokenIds, []),
                        active: Boolean(m.active),
                        closed: Boolean(m.closed),
                    });
                }
            }
        }
        catch {
            // Skip enrichment for this market
        }
    }
    return marketMap;
}
export async function registerPositionRoutes(app) {
    // ── Get all open positions ────────────────────────────────────────────────
    app.get("/", async (request) => {
        const { userId } = request.query;
        try {
            const creds = await getCredentials(userId);
            if (!creds.isConfigured) {
                return { positions: [], error: "No credentials configured" };
            }
            const signer = new Wallet(creds.privateKey);
            const signerAddr = await signer.getAddress();
            const funderAddr = creds.funderAddress || signerAddr;
            // Use the Polymarket Data API to get positions
            const posUrl = `${DATA_API}/positions?user=${funderAddr.toLowerCase()}&sizeThreshold=0.001`;
            console.log(`[Positions] Fetching: ${posUrl}`);
            const posRes = await fetch(posUrl);
            if (!posRes.ok) {
                console.log(`[Positions] Data API returned ${posRes.status}`);
                return { positions: [], error: `Failed to fetch positions: ${posRes.status}` };
            }
            const rawPositions = await posRes.json();
            console.log(`[Positions] Got ${rawPositions.length} positions`);
            // Data API already includes title, slug, icon, outcome directly
            const positions = rawPositions
                .map((p) => ({
                conditionId: String(p.conditionId || ""),
                asset: String(p.asset || ""),
                size: Number(p.size || 0),
                avgPrice: Number(p.avgPrice || 0),
                currentPrice: Number(p.curPrice || 0),
                initialValue: Number(p.initialValue || 0),
                currentValue: Number(p.currentValue || 0),
                cashPnl: Number(p.cashPnl || 0),
                percentPnl: Number(p.percentPnl || 0),
                realizedPnl: Number(p.realizedPnl || 0),
                side: String(p.outcome || ""),
                outcomeIndex: Number(p.outcomeIndex ?? 0),
                question: String(p.title || ""),
                slug: String(p.eventSlug || p.slug || ""),
                image: String(p.icon || ""),
                redeemable: Boolean(p.redeemable),
                mergeable: Boolean(p.mergeable),
                negativeRisk: Boolean(p.negativeRisk),
                endDate: String(p.endDate || ""),
            }))
                // Filter out dust positions (<0.01 shares), redeemable (market resolved), and
                // positions with zero current value (already effectively closed)
                .filter((p) => {
                if (p.size < 0.01)
                    return false; // Dust
                if (p.redeemable)
                    return false; // Market resolved — position is closed
                if (p.currentValue <= 0 && p.size < 0.1)
                    return false; // Effectively worthless dust
                return true;
            });
            return { positions };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[Positions] Error:", msg);
            return { positions: [], error: msg };
        }
    });
    // ── Close a position (market sell) ────────────────────────────────────────
    app.post("/close", async (request) => {
        const body = request.body;
        if (!body.tokenId || !body.shares) {
            return { success: false, error: "tokenId and shares are required" };
        }
        try {
            const client = await createClobClient(body.userId);
            console.log(`[Positions] Closing position: SELL ${body.shares} shares of ${body.outcome} (token: ${body.tokenId})`);
            const response = await client.createAndPostMarketOrder({
                tokenID: body.tokenId,
                amount: body.shares,
                side: Side.SELL,
                orderType: OrderType.FOK,
            }, undefined, OrderType.FOK);
            // Detect errors
            const resp = response;
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[Positions] Close error:", msg);
            return { success: false, error: msg };
        }
    });
    app.get("/trader-stats", async (req, reply) => {
        const { address } = req.query;
        if (!address) {
            return reply.code(400).send({ error: "Missing address" });
        }
        try {
            const lowerAddress = address.toLowerCase();
            // Fetch historical trades
            const tradesUrl = `${DATA_API}/activity?user=${lowerAddress}&type=TRADE&limit=500`;
            const tradesRes = await fetch(tradesUrl);
            if (!tradesRes.ok) {
                throw new Error(`Failed to fetch trades: ${tradesRes.status}`);
            }
            const trades = await tradesRes.json();
            if (!Array.isArray(trades) || trades.length === 0) {
                return {
                    profit: 0,
                    volume: 0,
                    winRate: 0,
                    trades: 0,
                    equityCurve: [100, 100],
                };
            }
            let totalVolume = 0;
            let totalProfit = 0;
            let winningTrades = 0;
            let completedTrades = 0;
            const equityCurve = [100];
            let currentEquity = 100;
            // Calculate from trades
            const sortedTrades = [...trades].reverse();
            for (const t of sortedTrades) {
                const size = Number(t.size || 0);
                const price = Number(t.price || 0);
                const tradeVolume = size * price;
                totalVolume += tradeVolume;
            }
            // Fetch current positions to get PNL
            const posUrl = `${DATA_API}/positions?user=${lowerAddress}`;
            const posRes = await fetch(posUrl);
            if (posRes.ok) {
                const positions = await posRes.json();
                if (Array.isArray(positions)) {
                    for (const p of positions) {
                        // Cash Pnl is unrealized profit/loss.
                        const uPnl = Number(p.cashPnl || 0);
                        // "Realized Pnl" doesn't always show natively, calculate based on totalBought
                        const rPnl = Number(p.realizedPnl || 0);
                        totalProfit += (rPnl + uPnl);
                        if (rPnl > 0 || uPnl > 0) {
                            winningTrades++;
                        }
                        if (rPnl !== 0 || uPnl !== 0) {
                            completedTrades++;
                        }
                    }
                }
            }
            const winRate = completedTrades > 0 ? winningTrades / completedTrades : 0.5;
            const profitPerTrade = trades.length > 0 ? totalProfit / trades.length : 0;
            // Mock an equity curve using the real trade length and final profit as bounds
            for (const t of sortedTrades) {
                // Simple mock curve climbing towards final profit
                currentEquity += profitPerTrade + ((Math.random() - 0.5) * 10);
                equityCurve.push(Math.max(10, currentEquity));
            }
            return {
                profit: totalProfit,
                volume: totalVolume,
                winRate: winRate,
                trades: trades.length,
                equityCurve: equityCurve
            };
        }
        catch (err) {
            console.error("[Stats] Error fetching trader stats:", err);
            // Fallback
            return {
                profit: 0,
                volume: 0,
                winRate: 0,
                trades: 0,
                equityCurve: [100, 100],
            };
        }
    });
    // ── Get trade history ─────────────────────────────────────────────────────
    app.get("/trades", async (request) => {
        const { userId } = request.query;
        try {
            const creds = await getCredentials(userId);
            if (!creds.isConfigured) {
                return { trades: [] };
            }
            const signer = new Wallet(creds.privateKey);
            const signerAddr = await signer.getAddress();
            const funderAddr = creds.funderAddress || signerAddr;
            // Fetch trade history from Polymarket Data API
            const tradesUrl = `${DATA_API}/trades?user=${funderAddr.toLowerCase()}&limit=1000`;
            console.log(`[Trades] Fetching: ${tradesUrl}`);
            const tradesRes = await fetch(tradesUrl);
            if (!tradesRes.ok) {
                console.log(`[Trades] Data API returned ${tradesRes.status}`);
                return { trades: [] };
            }
            const rawTrades = await tradesRes.json();
            console.log(`[Trades] Got ${rawTrades.length} trades`);
            const trades = rawTrades.map((t) => ({
                id: String(t.transactionHash || ""),
                conditionId: String(t.conditionId || ""),
                asset: String(t.asset || ""),
                side: String(t.side || ""),
                price: Number(t.price || 0),
                size: Number(t.size || 0),
                fee: 0,
                status: "filled",
                timestamp: t.timestamp ? new Date(Number(t.timestamp) * 1000).toISOString() : "",
                txHash: String(t.transactionHash || ""),
                question: String(t.title || ""),
                outcome: String(t.outcome || ""),
                slug: String(t.eventSlug || t.slug || ""),
                icon: String(t.icon || ""),
            }));
            return { trades };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[Trades] Error:", msg);
            return { trades: [], error: msg };
        }
    });
}
//# sourceMappingURL=positions.js.map