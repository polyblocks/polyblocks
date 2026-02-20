/**
 * Market routes — proxy to Polymarket Gamma + CLOB APIs for market discovery
 * and real-time data. All public / Level 0 endpoints (no auth needed).
 */
const GAMMA_HOST = process.env.POLYMARKET_GAMMA_HOST || "https://gamma-api.polymarket.com";
const CLOB_HOST = process.env.POLYMARKET_CLOB_HOST || "https://clob.polymarket.com";
/** Gamma returns some fields as JSON strings — safely parse them */
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
/** Map a raw Gamma market to a clean shape */
function mapMarket(m) {
    // Use eventStartTime as the true start date (when the market opens for trading),
    // fallback to startDate if missing.
    const trueStart = m.eventStartTime || m.startDate || "";
    return {
        conditionId: m.conditionId,
        question: m.question,
        slug: m.slug,
        image: m.image || m.icon || "",
        icon: m.icon || "",
        groupItemTitle: m.groupItemTitle || "",
        outcomes: safeJsonParse(m.outcomes, []),
        outcomePrices: safeJsonParse(m.outcomePrices, []),
        clobTokenIds: safeJsonParse(m.clobTokenIds, []),
        volume: m.volume,
        liquidity: m.liquidity,
        active: m.active,
        closed: m.closed,
        bestBid: m.bestBid,
        bestAsk: m.bestAsk,
        lastTradePrice: m.lastTradePrice,
        spread: m.spread,
        startDate: trueStart,
        endDate: (m.endDate || ""),
        category: m.category || "",
        negRisk: m.negRisk ?? false,
    };
}
export async function registerMarketRoutes(app) {
    // ── Search / list markets (Gamma) ──────────────────────────────────────────
    app.get("/search", async (request) => {
        const query = request.query;
        const params = new URLSearchParams({
            limit: query.limit || "20",
            offset: query.offset || "0",
            active: "true",
            closed: "false",
            order: query.order || "volume24hr",
            ascending: query.ascending || "false",
        });
        if (query.end_date_min) {
            params.append("end_date_min", query.end_date_min);
        }
        const res = await fetch(`${GAMMA_HOST}/markets?${params}`);
        if (!res.ok) {
            return { error: "Failed to fetch markets", status: res.status };
        }
        const markets = await res.json();
        // Map to a clean shape using shared helper
        const mapped = markets.map(mapMarket);
        // If there's a search query, filter client-side
        if (query.q) {
            const q = query.q.toLowerCase();
            return mapped.filter((m) => String(m.question || "").toLowerCase().includes(q) ||
                String(m.slug || "").toLowerCase().includes(q));
        }
        return mapped;
    });
    // ── Lookup event by slug (returns event + all bins/markets) ─────────────
    app.get("/slug/:slug", async (request, reply) => {
        const { slug } = request.params;
        // Gamma events endpoint returns an array; the slug should match one event
        const res = await fetch(`${GAMMA_HOST}/events?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
            return reply.status(res.status).send({ error: "Failed to fetch event" });
        }
        const events = (await res.json());
        if (!events.length) {
            // Fallback: try the markets endpoint (some slugs are market-level, not event-level)
            const mres = await fetch(`${GAMMA_HOST}/markets?slug=${encodeURIComponent(slug)}`);
            if (!mres.ok) {
                return reply.status(404).send({ error: "Event/market not found for slug" });
            }
            const markets = (await mres.json());
            if (!markets.length) {
                return reply.status(404).send({ error: "No market found for this slug" });
            }
            // Single market — wrap it like an event with one bin
            const m = markets[0];
            return {
                id: m.id,
                title: m.question,
                slug: m.slug,
                image: m.image || m.icon || "",
                icon: m.icon || "",
                description: m.description || "",
                volume: m.volume,
                endDate: m.endDate,
                active: m.active,
                closed: m.closed,
                markets: [mapMarket(m)],
            };
        }
        const event = events[0];
        const rawMarkets = (event.markets || []);
        const mappedMarkets = rawMarkets.map(mapMarket);
        // Sort bins chronologically by endDate (earliest first), then by groupItemTitle
        mappedMarkets.sort((a, b) => {
            const dateA = a.endDate ? new Date(a.endDate).getTime() : 0;
            const dateB = b.endDate ? new Date(b.endDate).getTime() : 0;
            if (dateA && dateB && dateA !== dateB)
                return dateA - dateB;
            // Fallback: sort by volume descending
            return Number(b.volume || 0) - Number(a.volume || 0);
        });
        return {
            id: event.id,
            title: event.title,
            slug: event.slug,
            image: event.image || event.icon || "",
            icon: event.icon || "",
            description: event.description || "",
            volume: event.volume,
            endDate: event.endDate,
            active: event.active,
            closed: event.closed,
            markets: mappedMarkets,
        };
    });
    // ── Get a single market by condition ID ───────────────────────────────────
    app.get("/:conditionId", async (request, reply) => {
        const { conditionId } = request.params;
        const res = await fetch(`${CLOB_HOST}/markets/${conditionId}`);
        if (!res.ok) {
            return reply
                .status(res.status)
                .send({ error: "Market not found" });
        }
        return res.json();
    });
    // ── Order book ────────────────────────────────────────────────────────────
    app.get("/book", async (request) => {
        const query = request.query;
        const tokenId = query.token_id;
        if (!tokenId) {
            return { error: "token_id is required" };
        }
        const res = await fetch(`${CLOB_HOST}/book?token_id=${tokenId}`);
        if (!res.ok) {
            return { error: "Failed to fetch order book", status: res.status };
        }
        return res.json();
    });
    // ── Midpoint price ────────────────────────────────────────────────────────
    app.get("/midpoint", async (request) => {
        const query = request.query;
        const tokenId = query.token_id;
        if (!tokenId) {
            return { error: "token_id is required" };
        }
        const res = await fetch(`${CLOB_HOST}/midpoint?token_id=${tokenId}`);
        if (!res.ok) {
            return { error: "Failed to fetch midpoint", status: res.status };
        }
        return res.json();
    });
    // ── Spread ────────────────────────────────────────────────────────────────
    app.get("/spread", async (request) => {
        const query = request.query;
        const tokenId = query.token_id;
        if (!tokenId) {
            return { error: "token_id is required" };
        }
        const res = await fetch(`${CLOB_HOST}/spread?token_id=${tokenId}`);
        if (!res.ok) {
            return { error: "Failed to fetch spread", status: res.status };
        }
        return res.json();
    });
    // ── Price history ─────────────────────────────────────────────────────────
    app.get("/prices-history", async (request) => {
        const query = request.query;
        const params = new URLSearchParams();
        if (query.market)
            params.set("market", query.market);
        if (query.interval)
            params.set("interval", query.interval);
        if (query.fidelity)
            params.set("fidelity", query.fidelity);
        if (query.startTs)
            params.set("startTs", query.startTs);
        if (query.endTs)
            params.set("endTs", query.endTs);
        const res = await fetch(`${CLOB_HOST}/prices-history?${params}`);
        if (!res.ok) {
            return { error: "Failed to fetch price history", status: res.status };
        }
        return res.json();
    });
    // ── Last trade price ──────────────────────────────────────────────────────
    app.get("/last-trade-price", async (request) => {
        const query = request.query;
        const tokenId = query.token_id;
        if (!tokenId) {
            return { error: "token_id is required" };
        }
        const res = await fetch(`${CLOB_HOST}/last-trade-price?token_id=${tokenId}`);
        if (!res.ok) {
            return { error: "Failed to fetch last trade price", status: res.status };
        }
        return res.json();
    });
}
//# sourceMappingURL=markets.js.map