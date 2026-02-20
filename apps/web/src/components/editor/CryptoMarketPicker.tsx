import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Select, Button } from "@polyblocks/ui";
import { RefreshCw, Loader2, TrendingDown, TrendingUp, Radio, Clock } from "lucide-react";
import { formatEtTimeShort } from "../../lib/time";

interface MarketResult {
  conditionId?: string;
  question?: string;
  slug?: string;
  image?: string;
  groupItemTitle?: string;
  outcomes?: string[];
  outcomePrices?: string[];
  clobTokenIds?: string[];
  startDate?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
}

interface CryptoMarketPickerProps {
  config: Record<string, unknown>;
  onConfigChange: (key: string, value: unknown) => void;
}

const TIMEFRAME_OPTIONS = [
  { value: "1m", label: "1 min" },
  { value: "5m", label: "5 mins" },
  { value: "15m", label: "15 mins" },
  { value: "1h", label: "1 hour" },
];

const CRYPTO_ALIASES: Record<string, string[]> = {
  BTC: ["BTC", "Bitcoin"],
  ETH: ["ETH", "Ethereum"],
  SOL: ["SOL", "Solana"],
  XRP: ["XRP", "Ripple"],
};

function matchesTimeframe(text: string, timeframe: string, startIso?: string, endIso?: string): boolean {
  if (startIso && endIso) {
    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      const diffMin = (endMs - startMs) / 60000;
      if (timeframe === "1h" && diffMin >= 55 && diffMin <= 65) return true;
      if (timeframe === "15m" && diffMin >= 13 && diffMin <= 17) return true;
      if (timeframe === "5m" && diffMin >= 3 && diffMin <= 7) return true;
      if (timeframe === "1m" && diffMin >= 0 && diffMin <= 2) return true;
      // If dates don't definitively match our exact minute diff, let it fall through to regex check.
    }
  }

  // Fallback to text matching if dates are missing/invalid/unclear
  const lower = text.toLowerCase();
  const m = lower.match(/(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)/);
  if (m) {
    const toMinutes = (h: number, min: number, ap: string) => {
      const hh = (h % 12) + (ap === "pm" ? 12 : 0);
      return hh * 60 + min;
    };
    const startMin = toMinutes(Number(m[1]), Number(m[2]), m[3]);
    const endMin = toMinutes(Number(m[4]), Number(m[5]), m[6]);
    let diff = endMin - startMin;
    if (diff < 0) diff += 12 * 60;
    
    if (timeframe === "1h") return diff >= 55 && diff <= 65;
    if (timeframe === "15m") return diff >= 13 && diff <= 17;
    if (timeframe === "5m") return diff >= 3 && diff <= 7;
    if (timeframe === "1m") return diff >= 0 && diff <= 2;
  }
  
  if (timeframe === "1m") {
    return /1\s*min|1\s*mins|1m|1[-\s]?minute|1\s*minutes/.test(lower);
  }
  if (timeframe === "1h") {
    return /1\s*hour|1\s*hr|1h|next\s*hour|next\s*1\s*hour|next\s*1\s*hr/.test(lower);
  }
  if (timeframe === "15m") {
    return /15\s*min|15\s*mins|15m|15[-\s]?minute|15\s*minutes/.test(lower);
  }
  if (timeframe === "5m") {
    return /5\s*min|5\s*mins|5m|5[-\s]?minute|5\s*minutes/.test(lower);
  }
  return true;
}

function getCryptoTokens(symbol: string): string[] {
  const upper = symbol.trim().toUpperCase();
  if (!upper) return [];
  return CRYPTO_ALIASES[upper] || [upper];
}

function parseIsoMs(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function pickActiveMarket(markets: MarketResult[], nowMs: number): MarketResult | null {
  const activeNow = markets
    .map((m) => {
      const startMs = parseIsoMs(m.startDate);
      const endMs = parseIsoMs(m.endDate);
      return { m, startMs, endMs };
    })
    .filter(({ m, startMs, endMs }) => {
      if (!m.conditionId) return false;
      if (m.active === false || m.closed === true) return false;
      if (startMs === null && endMs === null) return false;
      const start = startMs ?? -Infinity;
      const end = endMs ?? Infinity;
      return start <= nowMs && nowMs < end;
    })
    .sort((a, b) => (a.endMs ?? Infinity) - (b.endMs ?? Infinity));

  if (activeNow.length > 0) return activeNow[0].m;
  
  // Fallback to the next upcoming market if none are currently active
  const upcoming = markets
    .map((m) => ({ m, startMs: parseIsoMs(m.startDate) }))
    .filter(({ m, startMs }) => m.conditionId && m.active !== false && !m.closed && startMs !== null && startMs > nowMs)
    .sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity));
    
  if (upcoming.length > 0) return upcoming[0].m;
  
  return markets.length > 0 ? markets[0] : null;
}

function formatTimeRange(startIso?: string, endIso?: string) {
  const start = startIso ? new Date(startIso) : null;
  const end = endIso ? new Date(endIso) : null;
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });
  if (start && end) return `${fmt(start)} – ${fmt(end)} ET`;
  if (start) return `from ${fmt(start)} ET`;
  if (end) return `until ${fmt(end)} ET`;
  return "";
}

function arraysEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function timeframeToMs(timeframe: string): number | null {
  const tf = timeframe.trim().toLowerCase();
  const m = tf.match(/^(\d+)\s*(m|h)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  if (unit === "m") return n * 60_000;
  if (unit === "h") return n * 60 * 60_000;
  return null;
}

const CRYPTO_OPTIONS = [
  { value: "BTC", label: "₿ BTC" },
  { value: "ETH", label: "Ξ ETH" },
  { value: "SOL", label: "◎ SOL" },
  { value: "XRP", label: "✕ XRP" },
];

export default function CryptoMarketPicker({ config, onConfigChange }: CryptoMarketPickerProps) {
  const cryptoSymbol = String(config.cryptoSymbol || "BTC").toUpperCase();
  const timeframe = String(config.timeframe || "5m");
  const [results, setResults] = useState<MarketResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [midpoints, setMidpoints] = useState<Record<string, number | null>>({});
  const [trend, setTrend] = useState<{ dir: "up" | "down" | "flat"; delta: number } | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const prevYesMidRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isFirstLoadRef = useRef(true);
  const configRef = useRef(config);

  const cryptoTokens = useMemo(() => getCryptoTokens(cryptoSymbol), [cryptoSymbol]);
  const cryptoOptionValue = useMemo(() => {
    const known = CRYPTO_OPTIONS.some((o) => o.value === cryptoSymbol);
    return known ? cryptoSymbol : "BTC";
  }, [cryptoSymbol]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const applyMarketToConfig = useCallback((m: MarketResult) => {
    const cfg = configRef.current;
    if (m.conditionId && m.conditionId !== cfg.conditionId) {
      onConfigChange("conditionId", m.conditionId);
    }
    const tokenId = m.clobTokenIds?.[0] || "";
    if (tokenId && tokenId !== cfg.tokenId) {
      onConfigChange("tokenId", tokenId);
    }
    if (m.question !== undefined && m.question !== cfg.question) {
      onConfigChange("question", m.question || "");
    }
    if (m.image !== undefined && m.image !== cfg.image) {
      onConfigChange("image", m.image || "");
    }
    if (m.groupItemTitle !== undefined && m.groupItemTitle !== cfg.groupItemTitle) {
      onConfigChange("groupItemTitle", m.groupItemTitle || "");
    }
    if (m.slug !== undefined && m.slug !== cfg.eventSlug) {
      onConfigChange("eventSlug", m.slug || "");
    }
    const eventTitle = m.groupItemTitle || m.question || "";
    if (eventTitle !== cfg.eventTitle) {
      onConfigChange("eventTitle", eventTitle);
    }
    if (!arraysEqual(m.outcomes, cfg.outcomes)) {
      onConfigChange("outcomes", m.outcomes || []);
    }
    if (!arraysEqual(m.outcomePrices, cfg.outcomePrices)) {
      onConfigChange("outcomePrices", m.outcomePrices || []);
    }
    if (!arraysEqual(m.clobTokenIds, cfg.clobTokenIds)) {
      onConfigChange("clobTokenIds", m.clobTokenIds || []);
    }
  }, [onConfigChange]);

  const fetchMidpoints = useCallback(async (tokenIds: string[], signal: AbortSignal) => {
    const ids = tokenIds.filter(Boolean).slice(0, 2);
    if (ids.length === 0) {
      setMidpoints({});
      setTrend(null);
      prevYesMidRef.current = null;
      return;
    }
    const entries = await Promise.all(ids.map(async (tokenId) => {
      const res = await fetch(`/api/markets/midpoint?token_id=${encodeURIComponent(tokenId)}`, { signal });
      if (!res.ok) throw new Error(`Failed to fetch midpoint (${res.status})`);
      const data = await res.json() as { mid?: string };
      const mid = data?.mid !== undefined ? Number.parseFloat(String(data.mid)) : NaN;
      return [tokenId, Number.isFinite(mid) ? mid : null] as const;
    }));
    const next = Object.fromEntries(entries) as Record<string, number | null>;
    setMidpoints(next);

    const yesMid = next[ids[0]] ?? null;
    const prev = prevYesMidRef.current;
    if (yesMid !== null && prev !== null && Number.isFinite(yesMid) && Number.isFinite(prev)) {
      const delta = yesMid - prev;
      const dir: "up" | "down" | "flat" = Math.abs(delta) < 0.0001 ? "flat" : (delta > 0 ? "up" : "down");
      setTrend({ dir, delta });
    } else {
      setTrend(null);
    }
    prevYesMidRef.current = yesMid;
  }, []);

  const fetchMarkets = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const isFirstLoad = isFirstLoadRef.current;
    setLoading(isFirstLoad);
    setRefreshing(!isFirstLoad);
    setError("");
    try {
      const nowIso = new Date().toISOString();
      const res = await fetch(`/api/markets/search?limit=500&order=endDate&ascending=true&end_date_min=${nowIso}`, { signal: controller.signal });
      const data = await res.json();
      
      if (!Array.isArray(data)) {
        setError(data.error || "Failed to fetch markets");
        setResults([]);
        return;
      }

      const filtered = data.filter((m) => {
        if (m.active === false || m.closed === true) return false;
        
        const hay = `${m.question || ""} ${m.slug || ""}`.toLowerCase();
        
        if (cryptoTokens.length > 0 && !cryptoTokens.some((t) => hay.includes(t.toLowerCase()))) {
          return false;
        }
        
        return matchesTimeframe(hay, timeframe, m.eventStartTime || m.startDate, m.endDate);
      });

      const sorted = filtered.sort((a, b) => {
        const aTime = Date.parse(a.endDate || "") || Infinity;
        const bTime = Date.parse(b.endDate || "") || Infinity;
        return aTime - bTime;
      });

      setResults(sorted);
      
      const active = pickActiveMarket(sorted, Date.now());
      if (active) {
        applyMarketToConfig(active);
        await fetchMidpoints(active.clobTokenIds || [], controller.signal);
      } else {
        setMidpoints({});
        setTrend(null);
        prevYesMidRef.current = null;
      }
      setLastUpdatedAt(Date.now());
      isFirstLoadRef.current = false;
      
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch markets");
      setResults([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyMarketToConfig, cryptoSymbol, cryptoTokens, fetchMidpoints, timeframe]);

  useEffect(() => {
    fetchMarkets();
    return () => {
      abortRef.current?.abort();
    };
  }, [cryptoSymbol, fetchMarkets, timeframe]);

  useEffect(() => {
    const intervalMs = timeframeToMs(timeframe) ?? 5 * 60_000;
    const now = Date.now();
    const nextBoundary = Math.ceil((now + 250) / intervalMs) * intervalMs;
    const delayMs = Math.max(500, nextBoundary - now);

    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      fetchMarkets();
      intervalId = window.setInterval(fetchMarkets, intervalMs);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [fetchMarkets, timeframe]);

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    return formatEtTimeShort(iso);
  };

  const activeMarket = useMemo(() => {
    const id = String(config.conditionId || "");
    if (!id) return null;
    return results.find((r) => r.conditionId === id) || null;
  }, [config.conditionId, results]);

  const tokenIds = (config.clobTokenIds as string[] | undefined) || [];
  const yesTokenId = tokenIds[0];
  const noTokenId = tokenIds[1];
  const yesMid = yesTokenId ? midpoints[yesTokenId] ?? null : null;
  const noMid = noTokenId ? midpoints[noTokenId] ?? null : null;

  const formatPrice = (p: number | null) => {
    if (p === null) return "—";
    return `${Math.round(p * 1000) / 10}%`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Select
          value={cryptoOptionValue}
          onChange={(e) => {
            const v = e.target.value;
            onConfigChange("cryptoSymbol", v);
          }}
        >
          {CRYPTO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <Select
          value={timeframe}
          onChange={(e) => onConfigChange("timeframe", e.target.value)}
        >
          {TIMEFRAME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button size="sm" onClick={fetchMarkets} disabled={loading}>
          {refreshing ? <Loader2 size={14} /> : <RefreshCw size={14} />}
          {refreshing ? "Refreshing" : "Refresh"}
        </Button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: "var(--pb-text-muted)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Radio size={12} style={{ color: activeMarket ? "var(--pb-success)" : "var(--pb-text-muted)" }} />
          <span style={{ fontWeight: 600, color: activeMarket ? "var(--pb-success)" : "var(--pb-text-muted)" }}>LIVE</span>
          {activeMarket?.startDate || activeMarket?.endDate ? ` ${formatTimeRange(activeMarket.startDate, activeMarket.endDate)}` : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Clock size={12} />
          {lastUpdatedAt ? ` ${new Date(lastUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
        </div>
      </div>
      {error && (
        <div style={{ fontSize: 12, color: "var(--pb-risk)" }}>
          {error}
        </div>
      )}
      {!error && results.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--pb-text-muted)" }}>
          No live markets found for this crypto/timeframe.
        </div>
      )}
      {!error && activeMarket && (
        <div className="pb-card" style={{ padding: 12, border: "1px solid var(--pb-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>
              {activeMarket.groupItemTitle || activeMarket.question}
            </div>
            {trend?.dir === "up" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--pb-success)", fontSize: 12, fontWeight: 600 }}>
                <TrendingUp size={14} />
                {trend.delta > 0 ? "+" : ""}{formatPrice(trend.delta).replace("%", "pp")}
              </div>
            )}
            {trend?.dir === "down" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--pb-risk)", fontSize: 12, fontWeight: 600 }}>
                <TrendingDown size={14} />
                {formatPrice(trend.delta).replace("%", "pp")}
              </div>
            )}
            {trend?.dir === "flat" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--pb-text-muted)", fontSize: 12, fontWeight: 600 }}>
                {formatPrice(0).replace("%", "pp")}
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--pb-text-muted)", marginTop: 6, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>{formatDate(activeMarket.startDate || activeMarket.endDate)}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <div>
                <span style={{ color: "var(--pb-text-muted)" }}>YES</span>{" "}
                <span style={{ fontWeight: 700, color: yesMid !== null ? "var(--pb-text-primary)" : "var(--pb-text-muted)" }}>{formatPrice(yesMid)}</span>
              </div>
              <div>
                <span style={{ color: "var(--pb-text-muted)" }}>NO</span>{" "}
                <span style={{ fontWeight: 700, color: noMid !== null ? "var(--pb-text-primary)" : "var(--pb-text-muted)" }}>{formatPrice(noMid)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
