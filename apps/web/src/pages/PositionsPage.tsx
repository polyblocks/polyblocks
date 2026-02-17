/**
 * PositionsPage — shows all real on-chain positions from Polymarket CLOB
 * with the ability to close each one.
 * Has two top-level modes: Live Trading (real CLOB) and Paper Trading (from editor store).
 */

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  X,
  RefreshCw,
  AlertCircle,
  Loader2,
  ExternalLink,
  DollarSign,
  BarChart3,
  Activity,
  FileText,
  Radio,
} from "lucide-react";
import { Button } from "@polyblocks/ui";
import { useEditorStore } from "../stores/editorStore";

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
  const [mode, setMode] = useState<"live" | "paper">("live");
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"positions" | "trades">("positions");

  // Paper data from editor store
  const paperTrades = useEditorStore((s) => s.trades);
  const paperPositions = useEditorStore((s) => s.positions);

  const fetchPositions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/positions/");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { positions: Position[]; error?: string };
      if (data.error && data.positions.length === 0) {
        setError(data.error);
      }
      setPositions(data.positions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch("/api/positions/trades");
      if (!res.ok) return;
      const data = await res.json() as { trades: Trade[] };
      setTrades(data.trades || []);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    fetchTrades();
  }, [fetchPositions, fetchTrades]);

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
        }),
      });

      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        // Refresh positions
        await fetchPositions();
      } else {
        alert(`Failed to close: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setClosingId(null);
    }
  };

  const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
  const totalPnl = positions.reduce((sum, p) => sum + p.cashPnl, 0);

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <h1>Positions & Trades</h1>
        <p>Your real Polymarket positions and trade history.</p>
      </div>

      {/* ── Live / Paper Mode Toggle ───────────────────────────────── */}
      <div className="pos-mode-toggle">
        <button
          className={`pos-mode-btn ${mode === "live" ? "active live" : ""}`}
          onClick={() => setMode("live")}
        >
          <Radio size={14} />
          Live Trading
        </button>
        <button
          className={`pos-mode-btn ${mode === "paper" ? "active paper" : ""}`}
          onClick={() => setMode("paper")}
        >
          <FileText size={14} />
          Paper Trading
          {paperTrades.length > 0 && (
            <span className="tab-badge">{paperTrades.length}</span>
          )}
        </button>
      </div>

      {/* ── PAPER MODE ─────────────────────────────────────────────── */}
      {mode === "paper" && (
        <>
          {/* Paper summary */}
          <div className="positions-summary">
            <div className="pos-stat-card">
              <div className="pos-stat-icon" style={{ background: "rgba(99,102,241,0.12)", color: "var(--pb-accent)" }}>
                <BarChart3 size={18} />
              </div>
              <div className="pos-stat-content">
                <div className="pos-stat-label">Paper Positions</div>
                <div className="pos-stat-value">{paperPositions.length}</div>
              </div>
            </div>
            <div className="pos-stat-card">
              <div className="pos-stat-icon" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
                <DollarSign size={18} />
              </div>
              <div className="pos-stat-content">
                <div className="pos-stat-label">Total Value</div>
                <div className="pos-stat-value">
                  {formatUsd(paperPositions.reduce((s, p) => s + p.size * p.currentPrice, 0))}
                </div>
              </div>
            </div>
            <div className="pos-stat-card">
              <div className="pos-stat-icon" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
                <Activity size={18} />
              </div>
              <div className="pos-stat-content">
                <div className="pos-stat-label">Paper Trades</div>
                <div className="pos-stat-value">{paperTrades.length}</div>
              </div>
            </div>
          </div>

          {/* Paper tabs */}
          <div className="pos-tabs">
            <button className={`pos-tab ${tab === "positions" ? "active" : ""}`} onClick={() => setTab("positions")}>
              Positions {paperPositions.length > 0 && <span className="tab-badge">{paperPositions.length}</span>}
            </button>
            <button className={`pos-tab ${tab === "trades" ? "active" : ""}`} onClick={() => setTab("trades")}>
              Trade History {paperTrades.length > 0 && <span className="tab-badge">{paperTrades.length}</span>}
            </button>
          </div>

          {/* Paper positions */}
          {tab === "positions" && paperPositions.length === 0 && (
            <div className="library-empty">
              <BarChart3 size={48} strokeWidth={1} style={{ color: "var(--pb-text-muted)", marginBottom: 16 }} />
              <p style={{ color: "var(--pb-text-muted)", fontSize: 14 }}>No paper positions yet.</p>
              <p style={{ color: "var(--pb-text-muted)", fontSize: 13 }}>
                Paper positions appear here after you run strategies in paper mode.
              </p>
            </div>
          )}

          {tab === "positions" && paperPositions.length > 0 && (
            <div className="positions-grid">
              {paperPositions.map((pp) => (
                <div key={`${pp.strategyId}-${pp.tokenId}`} className="position-card">
                  <div className="position-header">
                    <div className="position-market-info">
                      <h3 className="position-question">
                        {pp.marketConditionId.slice(0, 12)}…
                      </h3>
                      <div className="position-badges">
                        <span className="trade-side-badge paper">
                          <FileText size={10} /> PAPER
                        </span>
                        <span className={`trade-side-badge ${pp.side.toLowerCase()}`}>
                          {pp.side === "YES" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {pp.side}
                        </span>
                        <span className="position-size">{pp.size.toFixed(2)} shares</span>
                      </div>
                    </div>
                  </div>
                  <div className="position-stats">
                    <div className="position-stat">
                      <span className="position-stat-label">Avg Entry</span>
                      <span className="position-stat-value">{formatUsd(pp.avgEntryPrice)}</span>
                    </div>
                    <div className="position-stat">
                      <span className="position-stat-label">Current</span>
                      <span className="position-stat-value">{formatUsd(pp.currentPrice)}</span>
                    </div>
                    <div className="position-stat">
                      <span className="position-stat-label">Value</span>
                      <span className="position-stat-value">{formatUsd(pp.size * pp.currentPrice)}</span>
                    </div>
                    <div className="position-stat">
                      <span className="position-stat-label">P&L</span>
                      <span
                        className="position-stat-value"
                        style={{ color: pp.unrealizedPnl >= 0 ? "#10b981" : "#ef4444" }}
                      >
                        {pp.unrealizedPnl >= 0 ? "+" : ""}{formatUsd(pp.unrealizedPnl)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Paper trades */}
          {tab === "trades" && paperTrades.length === 0 && (
            <div className="library-empty">
              <Activity size={48} strokeWidth={1} style={{ color: "var(--pb-text-muted)", marginBottom: 16 }} />
              <p style={{ color: "var(--pb-text-muted)", fontSize: 14 }}>No paper trades yet.</p>
              <p style={{ color: "var(--pb-text-muted)", fontSize: 13 }}>
                Run a strategy in paper mode to see trades here.
              </p>
            </div>
          )}

          {tab === "trades" && paperTrades.length > 0 && (
            <div className="trades-table-wrapper" style={{ margin: "0 auto", maxWidth: 900 }}>
              <table className="trades-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Side</th>
                    <th>Price</th>
                    <th>Size</th>
                    <th>Value</th>
                    <th>Origin Node</th>
                  </tr>
                </thead>
                <tbody>
                  {paperTrades.map((pt) => (
                    <tr key={pt.id} className={`trade-row trade-${pt.side.toLowerCase()}`}>
                      <td className="trade-time">{pt.executedAt ? timeAgo(pt.executedAt) : "—"}</td>
                      <td>
                        <span className={`trade-side-badge ${pt.side.toLowerCase()}`}>
                          {pt.side === "BUY" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {pt.side}
                        </span>
                      </td>
                      <td className="trade-price">{formatUsd(pt.price)}</td>
                      <td>{pt.size.toFixed(2)}</td>
                      <td className="trade-value">{formatUsd(pt.price * pt.size)}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--pb-text-muted)" }}>
                        {pt.originNodeId.slice(0, 8)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── LIVE MODE ──────────────────────────────────────────────── */}
      {mode === "live" && (
        <>
      <div className="positions-summary">
        <div className="pos-stat-card">
          <div className="pos-stat-icon" style={{ background: "rgba(99,102,241,0.12)", color: "var(--pb-accent)" }}>
            <BarChart3 size={18} />
          </div>
          <div className="pos-stat-content">
            <div className="pos-stat-label">Open Positions</div>
            <div className="pos-stat-value">{positions.length}</div>
          </div>
        </div>
        <div className="pos-stat-card">
          <div className="pos-stat-icon" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
            <DollarSign size={18} />
          </div>
          <div className="pos-stat-content">
            <div className="pos-stat-label">Total Value</div>
            <div className="pos-stat-value">{formatUsd(totalValue)}</div>
          </div>
        </div>
        <div className="pos-stat-card">
          <div className="pos-stat-icon" style={{ background: totalPnl >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: totalPnl >= 0 ? "#10b981" : "#ef4444" }}>
            <Activity size={18} />
          </div>
          <div className="pos-stat-content">
            <div className="pos-stat-label">Total P&L</div>
            <div className="pos-stat-value" style={{ color: totalPnl >= 0 ? "#10b981" : "#ef4444" }}>
              {totalPnl >= 0 ? "+" : ""}{formatUsd(totalPnl)}
            </div>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="pos-tabs">
        <button className={`pos-tab ${tab === "positions" ? "active" : ""}`} onClick={() => setTab("positions")}>
          Positions {positions.length > 0 && <span className="tab-badge">{positions.length}</span>}
        </button>
        <button className={`pos-tab ${tab === "trades" ? "active" : ""}`} onClick={() => setTab("trades")}>
          Trade History {trades.length > 0 && <span className="tab-badge">{trades.length}</span>}
        </button>
        <div style={{ flex: 1 }} />
        <Button
          size="sm"
          onClick={() => { fetchPositions(); fetchTrades(); }}
          title="Refresh"
          style={{ gap: 4 }}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="pos-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && positions.length === 0 && (
        <div className="library-empty">
          <Loader2 size={32} className="spin" style={{ color: "var(--pb-text-muted)" }} />
          <p style={{ color: "var(--pb-text-muted)", marginTop: 12, fontSize: 13 }}>Loading positions…</p>
        </div>
      )}

      {/* Positions tab */}
      {tab === "positions" && !loading && positions.length === 0 && !error && (
        <div className="library-empty">
          <BarChart3 size={48} strokeWidth={1} style={{ color: "var(--pb-text-muted)", marginBottom: 16 }} />
          <p style={{ color: "var(--pb-text-muted)", fontSize: 14 }}>No open positions.</p>
          <p style={{ color: "var(--pb-text-muted)", fontSize: 13 }}>
            Positions appear here after you place live trades on Polymarket.
          </p>
        </div>
      )}

      {tab === "positions" && positions.length > 0 && (
        <div className="positions-grid">
          {positions.map((pos) => (
            <div key={pos.asset} className="position-card">
              <div className="position-header">
                {pos.image && (
                  <img src={pos.image} alt="" className="position-market-img" />
                )}
                <div className="position-market-info">
                  <h3 className="position-question">
                    {pos.question || `Market ${pos.conditionId.slice(0, 8)}…`}
                  </h3>
                  <div className="position-badges">
                    <span className={`trade-side-badge ${pos.side.toLowerCase()}`}>
                      {pos.side === "Yes" || pos.outcomeIndex === 0 ? (
                        <TrendingUp size={10} />
                      ) : (
                        <TrendingDown size={10} />
                      )}
                      {pos.side || (pos.outcomeIndex === 0 ? "YES" : "NO")}
                    </span>
                    <span className="position-size">{pos.size.toFixed(2)} shares</span>
                  </div>
                </div>
              </div>

              <div className="position-stats">
                <div className="position-stat">
                  <span className="position-stat-label">Avg Entry</span>
                  <span className="position-stat-value">{formatUsd(pos.avgPrice)}</span>
                </div>
                <div className="position-stat">
                  <span className="position-stat-label">Current</span>
                  <span className="position-stat-value">{formatUsd(pos.currentPrice)}</span>
                </div>
                <div className="position-stat">
                  <span className="position-stat-label">Value</span>
                  <span className="position-stat-value">{formatUsd(pos.currentValue)}</span>
                </div>
                <div className="position-stat">
                  <span className="position-stat-label">P&L</span>
                  <span
                    className="position-stat-value"
                    style={{ color: pos.cashPnl >= 0 ? "#10b981" : "#ef4444" }}
                  >
                    {pos.cashPnl >= 0 ? "+" : ""}{formatUsd(pos.cashPnl)}
                    <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>
                      ({formatPct(pos.percentPnl)})
                    </span>
                  </span>
                </div>
              </div>

              <div className="position-actions">
                {pos.slug && (
                  <a
                    href={`https://polymarket.com/event/${pos.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="position-link-btn"
                  >
                    <ExternalLink size={12} />
                    View
                  </a>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleClose(pos)}
                  style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
                  disabled={closingId === pos.asset}
                >
                  {closingId === pos.asset ? (
                    <Loader2 size={12} className="spin" />
                  ) : (
                    <X size={12} />
                  )}
                  {closingId === pos.asset ? "Closing…" : "Close Position"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trades tab */}
      {tab === "trades" && trades.length === 0 && (
        <div className="library-empty">
          <Activity size={48} strokeWidth={1} style={{ color: "var(--pb-text-muted)", marginBottom: 16 }} />
          <p style={{ color: "var(--pb-text-muted)", fontSize: 14 }}>No trade history found.</p>
        </div>
      )}

      {tab === "trades" && trades.length > 0 && (
        <div className="trades-table-wrapper" style={{ margin: "0 auto", maxWidth: 900 }}>
          <table className="trades-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Market</th>
                <th>Side</th>
                <th>Outcome</th>
                <th>Price</th>
                <th>Size</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={t.id || i} className={`trade-row trade-${t.side.toLowerCase()}`}>
                  <td className="trade-time">{t.timestamp ? timeAgo(t.timestamp) : "—"}</td>
                  <td style={{ maxWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {t.icon && <img src={t.icon} alt="" style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0 }} />}
                      <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.question || t.conditionId.slice(0, 10) + "…"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`trade-side-badge ${t.side.toLowerCase()}`}>
                      {t.side === "BUY" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {t.side}
                    </span>
                  </td>
                  <td>
                    <span className={`trade-side-badge ${t.outcome.toLowerCase()}`}>
                      {t.outcome}
                    </span>
                  </td>
                  <td className="trade-price">{formatUsd(t.price)}</td>
                  <td>{t.size.toFixed(2)}</td>
                  <td className="trade-value">{formatUsd(t.price * t.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </div>
  );
}
