/**
 * Market routes — proxy to Polymarket Gamma + CLOB APIs for market discovery
 * and real-time data. All public / Level 0 endpoints (no auth needed).
 */

import type { FastifyInstance } from "fastify";

const GAMMA_HOST = process.env.POLYMARKET_GAMMA_HOST || "https://gamma-api.polymarket.com";
const CLOB_HOST = process.env.POLYMARKET_CLOB_HOST || "https://clob.polymarket.com";

// ── In-Memory Cache for Market Search ──────────────────────────────────────
// Reduces latency and prevents DNS EAI_AGAIN errors when users have multiple
// Market Picker nodes polling the API concurrently.
let cachedMarkets: Record<string, unknown>[] | null = null;
let marketsCacheTime = 0;
const CACHE_TTL_MS = 15_000; // 15 seconds

/** Gamma returns some fields as JSON strings — safely parse them */
function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (Array.isArray(value)) return value as T;
  return fallback;
}

/** Map a raw Gamma market to a clean shape */
function mapMarket(m: Record<string, unknown>) {
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
    outcomes: safeJsonParse(m.outcomes as string, []),
    outcomePrices: safeJsonParse(m.outcomePrices as string, []),
    clobTokenIds: safeJsonParse(m.clobTokenIds as string, []),
    volume: m.volume,
    liquidity: m.liquidity,
    active: m.active,
    closed: m.closed,
    bestBid: m.bestBid,
    bestAsk: m.bestAsk,
    lastTradePrice: m.lastTradePrice,
    spread: m.spread,
    startDate: trueStart as string,
    endDate: (m.endDate || "") as string,
    category: m.category || "",
    negRisk: m.negRisk ?? false,
  };
}

export async function registerMarketRoutes(app: FastifyInstance) {
  // ── Search / list markets (Gamma) ──────────────────────────────────────────
  app.get("/search", async (request) => {
    const query = request.query as Record<string, string>;
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
    
    let markets: Record<string, unknown>[] = [];
    const now = Date.now();
    const isStandardQuery = !query.q && (query.limit === "500" || query.limit === "20") && query.order === "endDate" && query.ascending === "true";

    // Serve from cache if standard polling query
    if (isStandardQuery && cachedMarkets && now - marketsCacheTime < CACHE_TTL_MS) {
      markets = cachedMarkets;
    } else {
      const res = await fetch(`${GAMMA_HOST}/markets?${params}`);
      if (!res.ok) {
        return { error: "Failed to fetch markets", status: res.status };
      }
      markets = await res.json() as Array<Record<string, unknown>>;
      
      // Update cache
      if (isStandardQuery) {
        cachedMarkets = markets;
        marketsCacheTime = now;
      }
    }

    // Map to a clean shape using shared helper
    const mapped = markets.map(mapMarket);

    // If there's a search query, filter client-side
    if (query.q) {
      const q = query.q.toLowerCase();
      return mapped.filter(
        (m) =>
          String(m.question || "").toLowerCase().includes(q) ||
          String(m.slug || "").toLowerCase().includes(q),
      );
    }

    return mapped;
  });

  // ── Lookup event by slug (returns event + all bins/markets) ─────────────
  app.get("/slug/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    // Gamma events endpoint returns an array; the slug should match one event
    const res = await fetch(`${GAMMA_HOST}/events?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) {
      return reply.status(res.status).send({ error: "Failed to fetch event" });
    }

    const events = (await res.json()) as Array<Record<string, unknown>>;
    if (!events.length) {
      // Fallback: try the markets endpoint (some slugs are market-level, not event-level)
      const mres = await fetch(`${GAMMA_HOST}/markets?slug=${encodeURIComponent(slug)}`);
      if (!mres.ok) {
        return reply.status(404).send({ error: "Event/market not found for slug" });
      }
      const markets = (await mres.json()) as Array<Record<string, unknown>>;
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
    const rawMarkets = (event.markets || []) as Array<Record<string, unknown>>;
    const mappedMarkets = rawMarkets.map(mapMarket);

    // Sort bins chronologically by endDate (earliest first), then by groupItemTitle
    mappedMarkets.sort((a, b) => {
      const dateA = a.endDate ? new Date(a.endDate as string).getTime() : 0;
      const dateB = b.endDate ? new Date(b.endDate as string).getTime() : 0;
      if (dateA && dateB && dateA !== dateB) return dateA - dateB;
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
  app.get<{ Params: { conditionId: string } }>(
    "/:conditionId",
    async (request, reply) => {
      const { conditionId } = request.params;
      const res = await fetch(`${CLOB_HOST}/markets/${conditionId}`);
      if (!res.ok) {
        return reply
          .status(res.status)
          .send({ error: "Market not found" });
      }
      return res.json();
    },
  );

  // ── Order book ────────────────────────────────────────────────────────────
  app.get("/book", async (request) => {
    const query = request.query as Record<string, string>;
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
    const query = request.query as Record<string, string>;
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
    const query = request.query as Record<string, string>;
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
    const query = request.query as Record<string, string>;
    const params = new URLSearchParams();
    if (query.market) params.set("market", query.market);
    if (query.interval) params.set("interval", query.interval);
    if (query.fidelity) params.set("fidelity", query.fidelity);
    if (query.startTs) params.set("startTs", query.startTs);
    if (query.endTs) params.set("endTs", query.endTs);

    const res = await fetch(`${CLOB_HOST}/prices-history?${params}`);
    if (!res.ok) {
      return { error: "Failed to fetch price history", status: res.status };
    }
    return res.json();
  });

  // ── Last trade price ──────────────────────────────────────────────────────
  app.get("/last-trade-price", async (request) => {
    const query = request.query as Record<string, string>;
    const tokenId = query.token_id;
    if (!tokenId) {
      return { error: "token_id is required" };
    }

    const res = await fetch(
      `${CLOB_HOST}/last-trade-price?token_id=${tokenId}`,
    );
    if (!res.ok) {
      return { error: "Failed to fetch last trade price", status: res.status };
    }
    return res.json();
  });
}

