import { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Select, Button } from "@polyblocks/ui";
import { RefreshCw, Search } from "lucide-react";

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
  { value: "1h", label: "1 hour" },
  { value: "15m", label: "15 mins" },
  { value: "5m", label: "5 mins" },
];

const CRYPTO_ALIASES: Record<string, string[]> = {
  BTC: ["BTC", "Bitcoin"],
  ETH: ["ETH", "Ethereum"],
  SOL: ["SOL", "Solana"],
  DOGE: ["DOGE", "Dogecoin"],
  XRP: ["XRP", "Ripple"],
  AVAX: ["AVAX", "Avalanche"],
  TRUMP: ["TRUMP", "Donald Trump"],
};

function matchesTimeframe(text: string, timeframe: string): boolean {
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

export default function CryptoMarketPicker({ config, onConfigChange }: CryptoMarketPickerProps) {
  const cryptoSymbol = String(config.cryptoSymbol || "BTC");
  const timeframe = String(config.timeframe || "1h");
  const searchQuery = String(config.searchQuery || "");
  const [results, setResults] = useState<MarketResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cryptoTokens = useMemo(() => getCryptoTokens(cryptoSymbol), [cryptoSymbol]);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/markets/search?limit=100&order=startDate`);
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
        
        if (searchQuery && !hay.includes(searchQuery.toLowerCase())) {
          return false;
        }
        
        return matchesTimeframe(hay, timeframe);
      });

      const sorted = filtered.sort((a, b) => {
        const aTime = Date.parse(a.startDate || a.endDate || "") || 0;
        const bTime = Date.parse(b.startDate || b.endDate || "") || 0;
        return bTime - aTime;
      });

      setResults(sorted);
      
      if (sorted.length > 0) {
          const latest = sorted[0];
          if (latest.conditionId && latest.conditionId !== config.conditionId) {
             onConfigChange("conditionId", latest.conditionId);
             onConfigChange("tokenId", latest.clobTokenIds?.[0] || "");
             onConfigChange("question", latest.question || "");
             onConfigChange("image", latest.image || "");
             onConfigChange("groupItemTitle", latest.groupItemTitle || "");
             onConfigChange("eventTitle", latest.question || "");
             onConfigChange("eventSlug", latest.slug || "");
             onConfigChange("outcomes", latest.outcomes || []);
             onConfigChange("outcomePrices", latest.outcomePrices || []);
             onConfigChange("clobTokenIds", latest.clobTokenIds || []);
          }
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch markets");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [cryptoSymbol, searchQuery, timeframe, cryptoTokens, config.conditionId, onConfigChange]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
        <Input
          placeholder="Crypto symbol (BTC, ETH, SOL)"
          value={cryptoSymbol}
          onChange={(e) => onConfigChange("cryptoSymbol", e.target.value)}
        />
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
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--pb-text-muted)" }} />
          <Input
            style={{ paddingLeft: 30 }}
            placeholder="Search recent crypto markets"
            value={searchQuery}
            onChange={(e) => onConfigChange("searchQuery", e.target.value)}
          />
        </div>
        <Button size="sm" onClick={fetchMarkets} disabled={loading}>
          <RefreshCw size={14} />
          Refresh
        </Button>
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
      {results.slice(0, 6).map((m) => (
        <div key={m.conditionId} className="pb-card" style={{ padding: 12, border: m.conditionId === config.conditionId ? "1px solid var(--pb-accent)" : undefined }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {m.groupItemTitle || m.question}
          </div>
          <div style={{ fontSize: 12, color: "var(--pb-text-muted)", marginTop: 4 }}>
            {formatDate(m.startDate || m.endDate)}
          </div>
        </div>
      ))}
    </div>
  );
}
