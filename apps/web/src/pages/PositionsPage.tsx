/**
 * PositionsPage — shows all real on-chain positions from Polymarket CLOB
 * with the ability to close each one.
 * Has two top-level modes: Live Trading (real CLOB) and Paper Trading (from editor store).
 */

import { useEffect, useState, useCallback, type MouseEvent } from "react";
import {
  X,
  RefreshCw,
  AlertCircle,
  Loader2,
  ExternalLink,
  DollarSign,
  BarChart3,
  FileText,
  Radio,
  Trash2,
} from "lucide-react";
import { Button } from "@polyblocks/ui";
import { useAuthStore } from "../stores/authStore";
import { PaperTrade, PaperPosition } from "@polyblocks/types";

interface EnrichedPaperPosition extends PaperPosition {
  question?: string;
  image?: string;
  active?: boolean;
  closed?: boolean;
}


function formatTimeLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SimpleLineChart({
  data,
  times,
  height = 180,
  color = "#10b981",
  formatValue,
}: {
  data: number[];
  times?: string[];
  height?: number;
  color?: string;
  formatValue: (value: number) => string;
}) {
  if (!data || data.length < 2) return null;

  const safeData = data.length >= 2 ? data : [0, 0];
  const nowIso = new Date().toISOString();
  const safeTimes = times && times.length === safeData.length
    ? times
    : safeData.map((_, i) => (i === 0 ? nowIso : nowIso));

  const viewWidth = 1000;
  const viewHeight = height;
  const margin = { left: 64, right: 20, top: 12, bottom: 34 };
  const innerWidth = viewWidth - margin.left - margin.right;
  const innerHeight = viewHeight - margin.top - margin.bottom;

  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const pad = Math.max(Math.abs(max - min) * 0.1, 1);
  const yMin = min - pad;
  const yMax = max + pad;
  const range = yMax - yMin || 1;

  const points = safeData.map((d, i) => {
    const x = margin.left + (innerWidth * (i / (safeData.length - 1)));
    const y = margin.top + innerHeight - ((d - yMin) / range) * innerHeight;
    return `${x},${y}`;
  }).join(" ");

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const scaleX = viewWidth / rect.width;
    const marginLeftPx = margin.left / scaleX;
    const marginRightPx = margin.right / scaleX;
    const innerWidthPx = rect.width - marginLeftPx - marginRightPx;
    const clampedX = Math.min(Math.max(relativeX - marginLeftPx, 0), innerWidthPx);
    const index = Math.round((clampedX / innerWidthPx) * (safeData.length - 1));
    const hoverXView = margin.left + (innerWidth * (index / (safeData.length - 1)));
    setHoverIndex(index);
    setHoverX(hoverXView);
  };

  const hoverValue = hoverIndex !== null ? safeData[hoverIndex] : null;
  const hoverTime = hoverIndex !== null ? safeTimes[hoverIndex] : null;
  const hoverY = hoverIndex !== null
    ? margin.top + innerHeight - ((safeData[hoverIndex] - yMin) / range) * innerHeight
    : 0;

  return (
    <div style={{ position: "relative", width: "100%" }} onMouseMove={handleMove} onMouseLeave={() => setHoverIndex(null)}>
      <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} preserveAspectRatio="none" style={{ width: "100%", height, overflow: "visible" }}>
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={viewHeight - margin.bottom} stroke="var(--pb-border)" />
        <line x1={margin.left} y1={viewHeight - margin.bottom} x2={viewWidth - margin.right} y2={viewHeight - margin.bottom} stroke="var(--pb-border)" />
        {[0, 1, 2, 3, 4].map((i) => {
          const y = margin.top + (innerHeight * (i / 4));
          const value = yMax - (range * (i / 4));
          return (
            <g key={i}>
              <line x1={margin.left - 6} y1={y} x2={margin.left} y2={y} stroke="var(--pb-border)" />
              <text x={margin.left - 10} y={y + 4} fontSize={11} fill="var(--pb-text-muted)" textAnchor="end">
                {formatValue(value)}
              </text>
            </g>
          );
        })}
        <text x={margin.left} y={margin.top - 2} fontSize={11} fill="var(--pb-text-muted)">PnL</text>
        <text x={margin.left} y={viewHeight - 10} fontSize={11} fill="var(--pb-text-muted)">
          {formatTimeLabel(safeTimes[0])}
        </text>
        <text x={viewWidth - margin.right} y={viewHeight - 10} fontSize={11} fill="var(--pb-text-muted)" textAnchor="end">
          {formatTimeLabel(safeTimes[safeTimes.length - 1])}
        </text>
        <text x={viewWidth - margin.right} y={viewHeight - 2} fontSize={11} fill="var(--pb-text-muted)" textAnchor="end">
          Time
        </text>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={points}
          vectorEffect="non-scaling-stroke"
        />
        {hoverIndex !== null && (
          <>
            <line x1={hoverX} y1={margin.top} x2={hoverX} y2={viewHeight - margin.bottom} stroke="rgba(255,255,255,0.25)" />
            <circle cx={hoverX} cy={hoverY} r={4} fill={color} stroke="var(--pb-bg)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hoverIndex !== null && hoverValue !== null && hoverTime && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: `${(hoverX / viewWidth) * 100}%`,
            transform: "translateX(-50%)",
            background: "var(--pb-panel)",
            border: "1px solid var(--pb-border)",
            borderRadius: 8,
            padding: "6px 8px",
            fontSize: 12,
            color: "var(--pb-text)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 600 }}>{formatValue(hoverValue)}</div>
          <div style={{ color: "var(--pb-text-muted)", fontSize: 11 }}>{formatTimeLabel(hoverTime)}</div>
        </div>
      )}
    </div>
  );
}


interface Position {
  conditionId: string;
  asset: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  realizedPnl: number;
  side: string;
  outcomeIndex: number;
  question: string;
  slug: string;
  image: string;
  active: boolean;
  closed: boolean;
  winningOutcome?: string;
  outcomePrices?: string[];
}

interface Trade {
  id: string;
  conditionId: string;
  asset: string;
  side: string;
  price: number;
  size: number;
  fee: number;
  status: string;
  timestamp: string;
  txHash: string;
  question: string;
  outcome: string;
  slug: string;
  icon: string;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number): string {
  const pct = value * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function PositionsPage() {
  const paperMaintenance = true;
  const [mode, setMode] = useState<"live" | "paper">("live");
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [liveStats, setLiveStats] = useState({
    winRate: 0,
    totalPnl: 0,
    volume: 0,
    history: [] as number[],
    historyTimes: [] as string[],
  });
  const [displayPositions, setDisplayPositions] = useState<Position[]>([]);
  const [liveClosedPositions, setLiveClosedPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"positions" | "trades">("positions");
  const [positionView, setPositionView] = useState<"open" | "closed">("open");
  const [resettingAll, setResettingAll] = useState(false);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [paperLoaded, setPaperLoaded] = useState(false);

  // Local paper data (fetched from API for full history)
  const userId = useAuthStore((s) => s.user?.id) ?? "anonymous";
  const token = useAuthStore((s) => s.token);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([]);
  const [paperPositions, setPaperPositions] = useState<EnrichedPaperPosition[]>([]);
  const [paperClosedPositions, setPaperClosedPositions] = useState<EnrichedPaperPosition[]>([]);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperStats, setPaperStats] = useState({
    winRate: 0,
    totalPnl: 0,
    bestTrade: 0,
    worstTrade: 0,
    history: [] as number[],
    historyTimes: [] as string[],
  });

  const [liveSessionStart, setLiveSessionStart] = useState<Date | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  const DUST_SIZE = 0.5;
  const DUST_VALUE = 0.5;
  const LIVE_SESSION_KEY = "pb_live_session_start";

  useEffect(() => {
    const stored = localStorage.getItem(LIVE_SESSION_KEY);
    if (stored) {
      const parsed = new Date(stored);
      if (!Number.isNaN(parsed.getTime())) {
        setLiveSessionStart(parsed);
      }
    }
  }, []);

  useEffect(() => {
    if (liveSessionStart) {
      localStorage.setItem(LIVE_SESSION_KEY, liveSessionStart.toISOString());
    } else {
      localStorage.removeItem(LIVE_SESSION_KEY);
    }
  }, [liveSessionStart]);

  const processTradesToLots = useCallback((tradeHistory: (Trade | PaperTrade)[]) => {
    // Normalize trades
    const normalized = tradeHistory.map(t => {
      const isPaper = "marketConditionId" in t;
      return {
        price: t.price,
        size: t.size,
        side: t.side.toUpperCase(),
        timestamp: isPaper ? (t as PaperTrade).executedAt : (t as Trade).timestamp,
        conditionId: isPaper ? (t as PaperTrade).marketConditionId : (t as Trade).conditionId,
        asset: isPaper ? (t as PaperTrade).tokenId : (t as Trade).asset,
        strategyId: isPaper ? (t as PaperTrade).strategyId : undefined,
        original: t
      };
    }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Lots map
    const lotsMap = new Map<string, Array<{ price: number; size: number; originalSize: number; timestamp: string; strategyId?: string }>>();

    let realizedPnl = 0;
    let wins = 0;
    let losses = 0;
    let volume = 0;
    const startTime = normalized[0]?.timestamp || new Date().toISOString();
    const history: number[] = [0];
    const historyTimes: string[] = [startTime];

    for (const t of normalized) {
      const txTime = new Date(t.timestamp);
      const isSessionTrade = !liveSessionStart || txTime >= liveSessionStart;

      const key = `${t.conditionId}_${t.asset}`;
      let lots = lotsMap.get(key) || [];

      if (t.side === "BUY") {
        lots.push({ price: t.price, size: t.size, originalSize: t.size, timestamp: t.timestamp, strategyId: t.strategyId });
        if (isSessionTrade) volume += t.price * t.size;
      } else if (t.side === "SELL") {
        let remainingToSell = t.size;
        if (isSessionTrade) volume += t.price * t.size;

        while (remainingToSell > 0.000001 && lots.length > 0) {
          const lot = lots[0];
          const sellFromLot = Math.min(lot.size, remainingToSell);

          if (isSessionTrade) {
            const pnl = (t.price - lot.price) * sellFromLot;
            realizedPnl += pnl;
            if (pnl > 0) wins++;
            else if (pnl < 0) losses++; // Strict loss
          }

          lot.size -= sellFromLot;
          remainingToSell -= sellFromLot;

          if (lot.size < 0.000001) {
            lots.shift();
          }
        }
      }

      if (isSessionTrade) {
        history.push(realizedPnl);
        historyTimes.push(t.timestamp);
      }
      lotsMap.set(key, lots);
    }

    return { lotsMap, realizedPnl, wins, losses, volume, history, historyTimes };
  }, [liveSessionStart]);

  const handlePaperClose = async (pos: EnrichedPaperPosition) => {
    if (!confirm(`Close ${pos.size.toFixed(2)} shares of "${pos.question || "Position"}"?`)) return;
    setClosingId(pos.tokenId);
    try {
      const trade = {
        marketConditionId: pos.marketConditionId,
        tokenId: pos.tokenId,
        side: "SELL",
        price: pos.currentPrice,
        size: pos.size,
        executedAt: new Date().toISOString(),
        originNodeId: "manual-close",
      };

      const res = await fetch(`/api/paper-trades/${pos.strategyId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-session-token": token } : {}),
        },
        body: JSON.stringify({ userId, trades: [trade] }),
      });

      if (!res.ok) throw new Error("Failed to close");
      await fetchPaperData();
    } catch (e) {
      alert("Failed to close position: " + String(e));
    } finally {
      setClosingId(null);
    }
  };

  const resetAllStats = async () => {
    if (!confirm("Are you sure you want to RESET ALL paper trading stats? This cannot be undone.")) return;
    try {
      setPaperLoading(true);
      const headers: Record<string, string> = {};
      if (token) headers["x-session-token"] = token;
      await fetch(`/api/paper-trades/all?userId=${userId}`, { method: "DELETE", headers });
      setPaperTrades([]);
      setPaperPositions([]);
      const nowIso = new Date().toISOString();
      setPaperStats({
        winRate: 0,
        totalPnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        history: [0, 0],
        historyTimes: [nowIso, nowIso],
      });
    } catch {
      alert("Failed to reset stats");
    } finally {
      setPaperLoading(false);
    }
  };

  const resetLiveStats = () => {
    if (!confirm("Reset live trading stats for this session?")) return;
    const now = new Date();
    setLiveSessionStart(now);
    const nowIso = now.toISOString();
    setLiveStats({
      winRate: 0,
      totalPnl: 0,
      volume: 0,
      history: [0],
      historyTimes: [nowIso],
    });
    setLiveClosedPositions([]);
    fetchPositions({ silent: true });
    fetchTrades();
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || isNaN(Number(withdrawAmount)) || Number(withdrawAmount) <= 0) {
      alert("Please enter a valid amount.");
      return;
    }
    if (!withdrawAddress) {
      alert("Please enter a destination address.");
      return;
    }
    
    setIsWithdrawing(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (token) headers["x-session-token"] = token;
      
      const res = await fetch("/api/positions/withdraw", {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: Number(withdrawAmount),
          destinationAddress: withdrawAddress
        })
      });
      
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Withdrawal failed");
      }
      
      alert(`Withdrawal successful! TX Hash: ${data.txHash}`);
      setShowWithdrawModal(false);
      setWithdrawAmount("");
      setWithdrawAddress("");
      fetchPositions(); // Refresh balance
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsWithdrawing(false);
    }
  };

  const resetAllPositions = async () => {
    if (mode === "paper") {
      await resetAllStats();
      return;
    }

    if (displayPositions.length === 0) return;
    if (!confirm("Are you sure you want to close ALL live positions? This will place market sell orders.")) return;

    try {
      setResettingAll(true);
      const failures: string[] = [];
      const sizeByAsset = new Map<string, { conditionId: string; outcome: string; size: number }>();
      displayPositions.forEach((pos) => {
        const existing = sizeByAsset.get(pos.asset);
        if (existing) {
          existing.size += pos.size;
        } else {
          sizeByAsset.set(pos.asset, {
            conditionId: pos.conditionId,
            outcome: pos.side,
            size: pos.size,
          });
        }
      });

      const results = await Promise.all(
        Array.from(sizeByAsset.entries()).map(async ([asset, details]) => {
          const res = await fetch("/api/positions/close", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tokenId: asset,
              conditionId: details.conditionId,
              shares: details.size,
              outcome: details.outcome,
              userId,
            }),
          });
          const data = await res.json() as { success: boolean; error?: string };
          return data.success ? null : data.error || details.conditionId;
        }),
      );

      results.forEach((err) => {
        if (err) failures.push(err);
      });

      if (failures.length > 0) {
        alert(`Failed to close ${failures.length} position${failures.length > 1 ? "s" : ""}.`);
      }
    } catch {
      alert("Failed to reset live positions");
    } finally {
      setResettingAll(false);
      fetchPositions();
      fetchTrades();
    }
  };

  // Fetch paper trades from API
  const fetchPaperData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!userId || !token) return;
    try {
      if (!silent && !paperLoaded) {
        setPaperLoading(true);
      }
      const headers: Record<string, string> = {};
      if (token) headers["x-session-token"] = token;

      const res = await fetch(`/api/paper-trades/all`, { headers });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Not authenticated. Please log in.");
        }
        throw new Error("Failed to fetch paper trades");
      }
      const data = await res.json() as { trades: PaperTrade[] };
      const allTrades = data.trades || [];

      setPaperTrades(allTrades);

      // Process trades to lots (FIFO)
      const { lotsMap, realizedPnl, wins, losses, history, historyTimes } = processTradesToLots(allTrades);
      let resolutionWins = 0;
      let resolutionLosses = 0;

      // Reconstruct flat positions from lots for display
      // We will duplicate "EnrichedPaperPosition" for each lot if we want to separate them?
      // Or just return a flat list of lots enriched.
      const builtPositions: EnrichedPaperPosition[] = [];

      lotsMap.forEach((lots, key) => {
        const [conditionId, tokenId] = key.split("_");
        const relatedTrade = allTrades.find(t => `${t.marketConditionId}_${t.tokenId}` === key);
        if (!relatedTrade) return;

        const totalSize = lots.reduce((sum, lot) => sum + lot.size, 0);
        if (totalSize <= 0.001) return;

        const totalCost = lots.reduce((sum, lot) => sum + (lot.price * lot.size), 0);
        const avgEntryPrice = totalSize > 0 ? totalCost / totalSize : 0;
        const firstBuyTime = lots.map(l => l.timestamp).sort()[0];

        builtPositions.push({
          strategyId: relatedTrade.strategyId,
          marketConditionId: conditionId,
          tokenId: tokenId,
          side: "YES",
          size: totalSize,
          avgEntryPrice,
          currentPrice: avgEntryPrice,
          unrealizedPnl: 0,
          openedAt: firstBuyTime || relatedTrade.executedAt,
          active: true,
          closed: false
        } as EnrichedPaperPosition);
      });

      // Fetch current prices & Metadata
      const uniqueTokenIds = [...new Set(builtPositions.map(p => p.tokenId))];
      const uniqueConditionIds = [...new Set(builtPositions.map(p => p.marketConditionId))];

      const marketMeta = new Map<string, { outcomePrices?: string[]; clobTokenIds?: string[]; closed?: boolean; question?: string; image?: string; active?: boolean }>();

      await Promise.all([
        // 1. Fetch Prices
        Promise.all(uniqueTokenIds.map(async (tid) => {
          try {
            const priceRes = await fetch(`https://clob.polymarket.com/midpoint?token_id=${tid}`);
            if (priceRes.ok) {
              const pData = await priceRes.json();
              const mid = parseFloat(pData.mid);
              builtPositions.forEach(p => {
                if (p.tokenId === tid) {
                  p.currentPrice = mid;
                  p.unrealizedPnl = (mid - p.avgEntryPrice) * p.size;
                }
              });
            }
          } catch { }
        })),
        // 2. Fetch Market Metadata
        Promise.all(uniqueConditionIds.map(async (cid) => {
          try {
            const mRes = await fetch(`https://gamma-api.polymarket.com/markets?condition_id=${cid}`);
            if (mRes.ok) {
              const mData = await mRes.json();
              const market = Array.isArray(mData) ? mData[0] : mData;
              if (market) {
                if (cid) {
                  marketMeta.set(cid, {
                    outcomePrices: market.outcomePrices,
                    clobTokenIds: market.clobTokenIds,
                    closed: market.closed,
                    question: market.question,
                    image: market.image || market.icon || "",
                    active: market.active,
                  });
                }
                builtPositions.forEach(p => {
                  if (p.marketConditionId === cid) {
                    p.question = market.question;
                    p.image = market.image || market.icon || "";
                    p.active = market.active;
                    p.closed = market.closed;
                  }
                });
              }
            }
          } catch { }
        }))
      ]);

      builtPositions.forEach(p => {
        const meta = marketMeta.get(p.marketConditionId);
        if (meta?.closed && Array.isArray(meta.outcomePrices) && Array.isArray(meta.clobTokenIds)) {
          const idx = meta.clobTokenIds.findIndex((id) => String(id) === String(p.tokenId));
          if (idx >= 0) {
            const settled = parseFloat(String(meta.outcomePrices[idx]));
            if (!isNaN(settled)) {
              p.currentPrice = settled;
              p.unrealizedPnl = (settled - p.avgEntryPrice) * p.size;
              if (p.unrealizedPnl > 0) resolutionWins++;
              else if (p.unrealizedPnl < 0) resolutionLosses++;
            }
          }
        }
      });

      const lastPaperTradeByKey = new Map<string, PaperTrade>();
      allTrades.forEach((t) => {
        const key = `${t.marketConditionId}_${t.tokenId}`;
        const existing = lastPaperTradeByKey.get(key);
        if (!existing || new Date(t.executedAt).getTime() > new Date(existing.executedAt).getTime()) {
          lastPaperTradeByKey.set(key, t);
        }
      });

      const closedPaperPositions: EnrichedPaperPosition[] = [];
      lotsMap.forEach((lots, key) => {
        if (lots.length > 0) return;
        const [conditionId, tokenId] = key.split("_");
        const lastTrade = lastPaperTradeByKey.get(key);
        if (!lastTrade) return;
        const meta = marketMeta.get(conditionId);
        closedPaperPositions.push({
          strategyId: lastTrade.strategyId,
          marketConditionId: conditionId,
          tokenId,
          side: "YES",
          size: 0,
          avgEntryPrice: lastTrade.price,
          currentPrice: lastTrade.price,
          unrealizedPnl: 0,
          openedAt: lastTrade.executedAt,
          active: false,
          closed: true,
          question: meta?.question,
          image: meta?.image,
        } as EnrichedPaperPosition);
      });

      closedPaperPositions.forEach((p) => {
        const meta = marketMeta.get(p.marketConditionId);
        if (meta) {
          p.closed = meta.closed ?? true;
          p.active = meta.active ?? false;
          p.question = meta.question || p.question;
          p.image = meta.image || p.image;
        }
      });

      const resolvedPaperPositions = builtPositions.filter((p) => p.closed || p.active === false);
      const filteredPaperPositions = builtPositions.filter((p) => {
        if (p.closed || p.active === false) return false;
        const value = p.currentPrice * p.size;
        return Math.abs(p.size) >= DUST_SIZE && Math.abs(value) >= DUST_VALUE;
      });

      setPaperPositions(filteredPaperPositions);
      const closedPaperMap = new Map<string, EnrichedPaperPosition>();
      closedPaperPositions.forEach((p) => {
        closedPaperMap.set(`${p.marketConditionId}_${p.tokenId}_${p.openedAt}`, p);
      });
      resolvedPaperPositions.forEach((p) => {
        closedPaperMap.set(`${p.marketConditionId}_${p.tokenId}_${p.openedAt}`, {
          ...p,
          active: false,
          closed: true,
        });
      });
      setPaperClosedPositions(Array.from(closedPaperMap.values()));

      const totalUnrealized = filteredPaperPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
      const totalEvents = wins + losses + resolutionWins + resolutionLosses;
      const winRate = totalEvents > 0 ? ((wins + resolutionWins) / totalEvents) : 0;
      const timeline = history.length > 0
        ? [...history, realizedPnl + totalUnrealized]
        : [0, realizedPnl + totalUnrealized];
      const timelineTimes = historyTimes.length > 0
        ? [...historyTimes, new Date().toISOString()]
        : [new Date().toISOString(), new Date().toISOString()];

      setPaperStats({
        winRate,
        totalPnl: realizedPnl + totalUnrealized,
        bestTrade: 0,
        worstTrade: 0,
        history: timeline.length > 1 ? timeline : [0, 0],
        historyTimes: timelineTimes.length > 1 ? timelineTimes : [new Date().toISOString(), new Date().toISOString()]
      });

    } catch (e) {
      console.error(e);
    } finally {
      if (!silent && !paperLoaded) {
        setPaperLoading(false);
      }
      setPaperLoaded(true);
    }
  }, [userId, token, processTradesToLots, paperLoaded]);

  useEffect(() => {
    if (mode === "paper" && !paperMaintenance) {
      fetchPaperData();
      const interval = setInterval(() => fetchPaperData({ silent: true }), 10000);
      return () => clearInterval(interval);
    }
  }, [mode, paperMaintenance, fetchPaperData]);

  const fetchPositions = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent && !liveLoaded) {
        setLoading(true);
      }
      setError(null);
      const headers: Record<string, string> = {};
      if (token) headers["x-session-token"] = token;
      const userQuery = userId && userId !== "anonymous" ? `?userId=${encodeURIComponent(userId)}` : "";
      
      const [res, balanceRes] = await Promise.all([
        fetch(`/api/positions/${userQuery}`, { headers }),
        fetch(`/api/positions/balance${userQuery}`, { headers }).catch(() => null)
      ]);

      if (balanceRes && balanceRes.ok) {
        const bData = await balanceRes.json();
        if (bData.balance !== undefined) setUsdcBalance(bData.balance);
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { positions: Position[]; error?: string };
      if (data.error && data.positions.length === 0) {
        setError(data.error);
      }
      setPositions(data.positions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!silent && !liveLoaded) {
        setLoading(false);
      }
      setLiveLoaded(true);
    }
  }, [liveLoaded, token, userId]);

  const fetchTrades = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers["x-session-token"] = token;
      const userQuery = userId && userId !== "anonymous" ? `?userId=${encodeURIComponent(userId)}` : "";
      const res = await fetch(`/api/positions/trades${userQuery}`, { headers });
      if (!res.ok) return;
      const data = await res.json() as { trades: Trade[] };
      setTrades(data.trades || []);
    } catch {
      // Non-critical
    }
  }, [token, userId]);

  useEffect(() => {
    if (mode !== "live") return;
    fetchPositions();
    fetchTrades();
  }, [mode, fetchPositions, fetchTrades]);

  // Calculate live stats (and lots) when trades/positions change
  useEffect(() => {
    if (trades.length === 0) return;

    const { lotsMap, realizedPnl, wins, losses, volume, history, historyTimes } = processTradesToLots(trades);
    const tradeMetaByKey = new Map<string, { question?: string; slug?: string; image?: string }>();
    const lastTradeByKey = new Map<string, Trade>();
    trades.forEach(t => {
      const key = `${t.conditionId}_${t.asset}`;
      if (!tradeMetaByKey.has(key)) {
        tradeMetaByKey.set(key, { question: t.question, slug: t.slug, image: t.icon });
      }
      const existing = lastTradeByKey.get(key);
      if (!existing || new Date(t.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
        lastTradeByKey.set(key, t);
      }
    });

    const chainPositionsByAsset = new Map<string, Position>();
    positions.forEach((p) => chainPositionsByAsset.set(p.asset, p));

    // Build Live Display Positions (Lots)
    const derivedPositions: Position[] = [];
    let resolutionPnl = 0;
    let resolutionWins = 0;
    let resolutionLosses = 0;

    lotsMap.forEach((lots, key) => {
      const [conditionId, asset] = key.split("_");
      // Find chain position for price/metadata
      const chainPos = chainPositionsByAsset.get(asset);
      const tradeMeta = tradeMetaByKey.get(key);

      if (!chainPos || chainPos.closed || chainPos.active === false || chainPos.currentValue <= DUST_VALUE) {
        const lastTrade = lastTradeByKey.get(key);
        const tradeSide = lastTrade?.outcome || "YES";
        const existing = {
          conditionId,
          asset,
          size: 0,
          avgPrice: lastTrade?.price ?? 0,
          currentPrice: lastTrade?.price ?? 0,
          initialValue: 0,
          currentValue: 0,
          cashPnl: 0,
          percentPnl: 0,
          realizedPnl: 0,
          side: tradeSide,
          outcomeIndex: 0,
          question: tradeMeta?.question || "",
          slug: tradeMeta?.slug || "",
          image: tradeMeta?.image || "",
          active: false,
          closed: true,
        } as Position;
        derivedPositions.push(existing);
        return;
      }

      lots.forEach(lot => {
        let currentPrice = chainPos?.currentPrice || lot.price;

        // Resolution Logic: Use outcomePrices if closed
        if (chainPos?.closed && chainPos?.outcomePrices && chainPos.outcomePrices.length > chainPos.outcomeIndex) {
          const settledPrice = parseFloat(chainPos.outcomePrices[chainPos.outcomeIndex]);
          if (!isNaN(settledPrice)) {
            currentPrice = settledPrice;
            // If strictly 0 or 1, and != entry?
            const pnl = (currentPrice - lot.price) * lot.size;
            resolutionPnl += pnl; // Add to Session PnL? 
            // If session reset logic applies:
            // Resolution happens at a time.
            // We don't have "Resolution Time".
            // Assume it happens NOW if closed.
            if (pnl > 0) resolutionWins++;
            else if (pnl < 0) resolutionLosses++;
          }
        }

        const size = lot.size;
        const cashPnl = (currentPrice - lot.price) * size;

        derivedPositions.push({
          conditionId,
          asset,
          size,
          avgPrice: lot.price,
          currentPrice,
          initialValue: size * lot.price,
          currentValue: size * currentPrice,
          cashPnl,
          percentPnl: lot.price > 0 ? (currentPrice - lot.price) / lot.price : 0,
          realizedPnl: 0,
          side: chainPos?.side || "YES",
          outcomeIndex: chainPos?.outcomeIndex || 0,
          question: chainPos?.question || tradeMeta?.question || "",
          slug: chainPos?.slug || tradeMeta?.slug || "",
          image: chainPos?.image || tradeMeta?.image || "",
          active: chainPos?.active ?? true,
          closed: chainPos?.closed ?? false,
          winningOutcome: chainPos?.winningOutcome
        });
      });
    });

    const openLivePositions = derivedPositions.filter((p) => {
      if (p.closed || p.active === false) return false;
      const value = p.currentValue;
      return Math.abs(p.size) >= DUST_SIZE && Math.abs(value) >= DUST_VALUE;
    });

    setDisplayPositions(openLivePositions);
    const closedLiveMap = new Map<string, Position>();
    derivedPositions.forEach((p) => {
      if (p.closed || p.active === false) {
        closedLiveMap.set(`${p.conditionId}_${p.asset}`, { ...p, closed: true, active: false });
      }
    });
    lotsMap.forEach((lots, key) => {
      if (lots.length > 0) return;
      const [conditionId, asset] = key.split("_");
      const lastTrade = lastTradeByKey.get(key);
      const tradeMeta = tradeMetaByKey.get(key);
      closedLiveMap.set(`${conditionId}_${asset}`, {
        conditionId,
        asset,
        size: 0,
        avgPrice: lastTrade?.price ?? 0,
        currentPrice: lastTrade?.price ?? 0,
        initialValue: 0,
        currentValue: 0,
        cashPnl: 0,
        percentPnl: 0,
        realizedPnl: 0,
        side: lastTrade?.outcome || "YES",
        outcomeIndex: 0,
        question: tradeMeta?.question || "",
        slug: tradeMeta?.slug || "",
        image: tradeMeta?.image || "",
        active: false,
        closed: true,
      });
    });
    setLiveClosedPositions(Array.from(closedLiveMap.values()));

    const currentUnrealized = openLivePositions.reduce((sum, p) => sum + p.cashPnl, 0);
    // Note: If resolved, p.cashPnl is effectively realized via settlement.
    // So logic: realizedPnl (Trading) + currentUnrealized (Holding). 
    // If Holding is resolved, it's (1 - entry) or (0 - entry).
    // This correctly reflects Total PnL.

    const totalEvents = wins + losses + resolutionWins + resolutionLosses;
    const timeline = history.length > 0
      ? [...history, realizedPnl + currentUnrealized]
      : [0, realizedPnl + currentUnrealized];
    const timelineTimes = historyTimes.length > 0
      ? [...historyTimes, new Date().toISOString()]
      : [new Date().toISOString(), new Date().toISOString()];

    setLiveStats({
      winRate: totalEvents > 0 ? (wins + resolutionWins) / totalEvents : 0,
      totalPnl: realizedPnl + currentUnrealized,
      volume,
      history: timeline.length > 1 ? timeline : [0, 0],
      historyTimes: timelineTimes.length > 1 ? timelineTimes : [new Date().toISOString(), new Date().toISOString()]
    });

  }, [trades, positions, processTradesToLots]);


  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (mode === "paper" && paperMaintenance) return;
    const interval = setInterval(() => {
      if (mode === "live") {
        fetchPositions({ silent: true });
        fetchTrades();
      } else {
        fetchPaperData({ silent: true });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [mode, paperMaintenance, fetchPositions, fetchTrades, fetchPaperData]);

  const handleClose = async (pos: Position) => {
    if (!confirm(`Close ${pos.size.toFixed(2)} shares of "${pos.question || pos.conditionId}" (${pos.side})?`)) return;

    setClosingId(pos.asset);
    try {
      const res = await fetch("/api/positions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: pos.asset,
          conditionId: pos.conditionId,
          shares: pos.size,
          outcome: pos.side,
          userId,
        }),
      });

      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        // Optimistically remove from list
        setPositions(prev => prev.filter(p => p.asset !== pos.asset));
        // Refresh positions properly
        fetchPositions();
        fetchTrades();
      } else {
        alert(data.error || "Failed to close position");
      }
    } catch (err) {
      alert("Failed to close position");
    } finally {
      setClosingId(null);
    }
  };

  const liveTotalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
  const paperTotalValue = paperPositions.reduce((sum, p) => sum + p.currentPrice * p.size, 0);
  const activeTotalValue = mode === "live" ? liveTotalValue : paperTotalValue;
  const activeTotalPnl = mode === "live" ? liveStats.totalPnl : paperStats.totalPnl;
  const activeWinRate = mode === "live" ? liveStats.winRate : paperStats.winRate;
  const activeHistory = mode === "live" ? liveStats.history : paperStats.history;
  const activeHistoryTimes = mode === "live" ? liveStats.historyTimes : paperStats.historyTimes;
  const activeTrades = mode === "live" ? trades : paperTrades;
  const activePositions = mode === "live" ? displayPositions : paperPositions;
  const activeClosedPositions = mode === "live" ? liveClosedPositions : paperClosedPositions;
  const activeLoading = mode === "live" ? (!liveLoaded && loading) : (!paperLoaded && paperLoading);
  const activeError = mode === "live" ? error : null;
  const activeVolume = mode === "live" ? liveStats.volume : 0;
  const isPaper = mode === "paper";
  const openPositions = activePositions.filter((pos) => {
    const closed = isPaper ? (pos as EnrichedPaperPosition).closed : (pos as Position).closed;
    const active = isPaper ? (pos as EnrichedPaperPosition).active ?? true : (pos as Position).active ?? true;
    return !closed && active;
  });
  const closedPositions = (() => {
    const map = new Map<string, EnrichedPaperPosition | Position>();
    const add = (pos: EnrichedPaperPosition | Position) => {
      const key = isPaper
        ? `${(pos as EnrichedPaperPosition).marketConditionId}_${(pos as EnrichedPaperPosition).tokenId}_${(pos as EnrichedPaperPosition).openedAt || ""}`
        : `${(pos as Position).conditionId}_${(pos as Position).asset}`;
      map.set(key, pos);
    };
    activePositions.forEach((pos) => {
      const closed = isPaper ? (pos as EnrichedPaperPosition).closed : (pos as Position).closed;
      const active = isPaper ? (pos as EnrichedPaperPosition).active ?? true : (pos as Position).active ?? true;
      if (closed || !active) add(pos);
    });
    activeClosedPositions.forEach(add);
    return Array.from(map.values());
  })();
  const displayedPositions = positionView === "open" ? openPositions : closedPositions;

  if (mode === "paper" && paperMaintenance) {
    return (
      <div className="dashboard">
        <div className="dashboard-hero" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1>Positions</h1>
            <p>Track live and paper positions, PnL, and trade history.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="default" onClick={() => setMode("live")}>
              <Radio size={14} />
              Live
            </Button>
            <Button variant="primary" title="Paper positions are under maintenance">
              <FileText size={14} />
              Paper (Maintenance)
            </Button>
          </div>
        </div>

        <div className="pb-card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <AlertCircle size={18} color="#f59e0b" />
            <div style={{ fontWeight: 700, fontSize: 16 }}>Paper Positions are under maintenance</div>
          </div>
          <div style={{ color: "var(--pb-text-muted)", fontSize: 13, marginBottom: 14 }}>
            Paper trading position history is temporarily disabled. Live positions and trade history are still available.
          </div>
          <Button variant="primary" onClick={() => setMode("live")}>
            <Radio size={14} />
            View Live Positions
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-hero" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Positions</h1>
          <p>Track live and paper positions, PnL, and trade history.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant={mode === "live" ? "primary" : "default"} onClick={() => setMode("live")}>
            <Radio size={14} />
            Live
          </Button>
          <Button variant={mode === "paper" ? "primary" : "default"} onClick={() => setMode("paper")}>
            <FileText size={14} />
            {paperMaintenance ? "Paper (Maintenance)" : "Paper"}
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(420px, 600px)", gap: 18, width: "100%", marginBottom: 20 }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, width: "100%" }}>
            <div className="pb-card">
              <div style={{ fontSize: 12, color: "var(--pb-text-muted)", marginBottom: 6 }}>Total PnL</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: activeTotalPnl >= 0 ? "#10b981" : "#ef4444" }}>
                {formatUsd(activeTotalPnl)}
              </div>
            </div>
            <div className="pb-card">
              <div style={{ fontSize: 12, color: "var(--pb-text-muted)", marginBottom: 6 }}>Total Value</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {formatUsd(activeTotalValue)}
              </div>
            </div>
            {mode === "live" && usdcBalance !== null && (
              <div className="pb-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--pb-text-muted)", marginBottom: 6 }}>Available USDC</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6" }}>
                    {formatUsd(usdcBalance)}
                  </div>
                </div>
                <div style={{ marginTop: "auto", paddingTop: "8px" }}>
                  <Button variant="default" size="sm" onClick={() => setShowWithdrawModal(true)} style={{ width: "100%", fontSize: "11px" }}>
                    Withdraw
                  </Button>
                </div>
              </div>
            )}
            <div className="pb-card">
              <div style={{ fontSize: 12, color: "var(--pb-text-muted)", marginBottom: 6 }}>Win Rate</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {formatPct(activeWinRate)}
              </div>
            </div>
            <div className="pb-card">
              <div style={{ fontSize: 12, color: "var(--pb-text-muted)", marginBottom: 6 }}>
                {mode === "live" ? "Volume" : "Trades"}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {mode === "live" ? formatUsd(activeVolume) : activeTrades.length}
              </div>
            </div>
          </div>
          <div className="pb-card" style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <Button onClick={() => {
              if (mode === "live") {
                fetchPositions({ silent: true });
                fetchTrades();
              } else {
                fetchPaperData({ silent: true });
              }
            }}>
              <RefreshCw size={14} />
              Refresh
            </Button>
          {mode === "live" && (
            <Button onClick={resetLiveStats}>
              Reset Live Stats
            </Button>
          )}
            <Button variant="danger" onClick={resetAllPositions} disabled={paperLoading || resettingAll}>
              <Trash2 size={14} />
              Reset All Positions
            </Button>
          </div>
        </div>
        <div className="pb-card" style={{ padding: 18, minHeight: 320 }}>
          <div style={{ fontSize: 12, color: "var(--pb-text-muted)", marginBottom: 8 }}>PnL Timeline</div>
          <SimpleLineChart
            data={activeHistory.length > 1 ? activeHistory : [0, 0]}
            times={activeHistoryTimes.length > 1 ? activeHistoryTimes : [new Date().toISOString(), new Date().toISOString()]}
            height={260}
            color={activeTotalPnl >= 0 ? "#10b981" : "#ef4444"}
            formatValue={formatUsd}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Button variant={tab === "positions" ? "primary" : "default"} onClick={() => setTab("positions")}>
          <BarChart3 size={14} />
          Positions
        </Button>
        <Button variant={tab === "trades" ? "primary" : "default"} onClick={() => setTab("trades")}>
          <DollarSign size={14} />
          Trades
        </Button>
      </div>

      {tab === "positions" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Button variant={positionView === "open" ? "primary" : "default"} onClick={() => setPositionView("open")}>
            Open
          </Button>
          <Button variant={positionView === "closed" ? "primary" : "default"} onClick={() => setPositionView("closed")}>
            Closed
          </Button>
        </div>
      )}

      {activeError && (
        <div className="pb-card" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--pb-risk)", marginBottom: 16 }}>
          <AlertCircle size={16} />
          <span>{activeError}</span>
        </div>
      )}

      {activeLoading && (
        <div className="pb-card" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={16} className="loading-spinner" />
          <span>Loading {mode === "live" ? "live" : "paper"} data...</span>
        </div>
      )}

      {!activeLoading && tab === "positions" && (
        <div style={{ display: "grid", gap: 12 }}>
          {displayedPositions.length === 0 && (
            <div className="pb-card" style={{ color: "var(--pb-text-muted)" }}>
              No {positionView} {mode === "live" ? "live" : "paper"} positions yet.
            </div>
          )}
          {displayedPositions.map((pos, index) => {
            if (isPaper) {
              const p = pos as EnrichedPaperPosition;
              const title = p.question || p.marketConditionId;
              return (
                <div key={`${p.marketConditionId}_${p.tokenId}_${index}`} className="pb-card" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                    {p.image && (
                      <img src={p.image} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {title}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--pb-text-muted)" }}>
                        {p.side} · {p.size.toFixed(2)} @ {formatUsd(p.avgEntryPrice)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600 }}>{formatUsd(p.currentPrice)}</div>
                      <div style={{ fontSize: 12, color: p.unrealizedPnl >= 0 ? "#10b981" : "#ef4444" }}>
                        {formatUsd(p.unrealizedPnl)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handlePaperClose(p)}
                      disabled={closingId === p.tokenId}
                    >
                      <X size={14} />
                      Close
                    </Button>
                  </div>
                </div>
              );
            }

            const p = pos as Position;
            const link = p.slug ? `https://polymarket.com/market/${p.slug}` : "";
            return (
              <div key={`${p.asset}_${index}`} className="pb-card" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  {p.image && (
                    <img src={p.image} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.question || p.conditionId}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--pb-text-muted)" }}>
                      {p.side} · {p.size.toFixed(2)} @ {formatUsd(p.avgPrice)}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 600 }}>{formatUsd(p.currentPrice)}</div>
                    <div style={{ fontSize: 12, color: p.cashPnl >= 0 ? "#10b981" : "#ef4444" }}>
                      {formatUsd(p.cashPnl)} · {formatPct(p.percentPnl)}
                    </div>
                  </div>
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" className="pb-btn pb-btn-icon" title="Open market">
                      <ExternalLink size={14} />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleClose(p)}
                    disabled={closingId === p.asset}
                  >
                    <X size={14} />
                    Close
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!activeLoading && tab === "trades" && (
        <div className="pb-card" style={{ padding: 0, overflowX: "auto" }}>
          {activeTrades.length === 0 && (
            <div style={{ padding: 16, color: "var(--pb-text-muted)" }}>
              No {mode === "live" ? "live" : "paper"} trades yet.
            </div>
          )}
          {activeTrades.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, color: "var(--pb-text-muted)" }}>
                  <th style={{ padding: "12px 16px" }}>Market</th>
                  <th style={{ padding: "12px 16px" }}>Side</th>
                  <th style={{ padding: "12px 16px" }}>Size</th>
                  <th style={{ padding: "12px 16px" }}>Price</th>
                  <th style={{ padding: "12px 16px" }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {activeTrades.map((trade, index) => {
                  if (isPaper) {
                    const t = trade as PaperTrade;
                    return (
                      <tr key={`${t.id || t.executedAt}_${index}`} style={{ borderTop: "1px solid var(--pb-border)" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600 }}>{t.marketConditionId}</td>
                        <td style={{ padding: "12px 16px" }}>{t.side}</td>
                        <td style={{ padding: "12px 16px" }}>{t.size.toFixed(2)}</td>
                        <td style={{ padding: "12px 16px" }}>{formatUsd(t.price)}</td>
                        <td style={{ padding: "12px 16px", color: "var(--pb-text-muted)" }}>{timeAgo(t.executedAt)}</td>
                      </tr>
                    );
                  }

                  const t = trade as Trade;
                  return (
                    <tr key={`${t.id}_${index}`} style={{ borderTop: "1px solid var(--pb-border)" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>
                        {t.question || t.conditionId}
                      </td>
                      <td style={{ padding: "12px 16px" }}>{t.side} {t.outcome}</td>
                      <td style={{ padding: "12px 16px" }}>{t.size.toFixed(2)}</td>
                      <td style={{ padding: "12px 16px" }}>{formatUsd(t.price)}</td>
                      <td style={{ padding: "12px 16px", color: "var(--pb-text-muted)" }}>{timeAgo(t.timestamp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showWithdrawModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div className="pb-card" style={{ width: 400, maxWidth: "90%", padding: 24 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Withdraw USDC (Polygon)</h3>
            <p style={{ fontSize: 13, color: "var(--pb-text-muted)", marginBottom: 20 }}>
              Available Balance: <strong style={{ color: "white" }}>{usdcBalance !== null ? formatUsd(usdcBalance) : "0.00"}</strong>
            </p>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: "var(--pb-text-muted)" }}>Amount (USDC)</label>
                <button 
                  onClick={() => setWithdrawAmount(usdcBalance ? (Math.floor(usdcBalance * 100) / 100).toString() : "0")}
                  style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 11, cursor: "pointer", padding: 0 }}
                >
                  Max
                </button>
              </div>
              <input 
                type="number" 
                value={withdrawAmount} 
                onChange={(e) => setWithdrawAmount(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", background: "var(--pb-panel)", border: "1px solid var(--pb-border)", color: "white", borderRadius: 4 }}
                placeholder="e.g. 50"
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 12, marginBottom: 8, color: "var(--pb-text-muted)" }}>Destination Address (0x...)</label>
              <input 
                type="text" 
                value={withdrawAddress} 
                onChange={(e) => setWithdrawAddress(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", background: "var(--pb-panel)", border: "1px solid var(--pb-border)", color: "white", borderRadius: 4 }}
                placeholder="0x..."
              />
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <Button variant="default" onClick={() => setShowWithdrawModal(false)} disabled={isWithdrawing}>Cancel</Button>
              <Button variant="primary" onClick={handleWithdraw} disabled={isWithdrawing}>
                {isWithdrawing ? "Processing..." : "Withdraw"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




