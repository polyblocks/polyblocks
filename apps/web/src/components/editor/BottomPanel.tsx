/**
 * BottomPanel — unified bottom panel with tabs: Logs, Trades, Positions.
 */

import { useEffect, useRef } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { Button } from "@polyblocks/ui";
import {
  Trash2,
  ChevronDown,
  CheckCircle,
  XCircle,
  SkipForward,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { BLOCK_REGISTRY, BlockType } from "@polyblocks/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getNodeLabel(nodeId: string): string {
  const nodes = useEditorStore.getState().nodes;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return nodeId;
  const blockType = node.data.blockType as BlockType;
  const def = BLOCK_REGISTRY[blockType];
  return (node.data.label as string) || def?.label || nodeId;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle size={12} style={{ color: "var(--pb-logic)" }} />;
    case "failed":
      return <XCircle size={12} style={{ color: "var(--pb-risk)" }} />;
    case "skipped":
      return <SkipForward size={12} style={{ color: "var(--pb-text-muted)" }} />;
    default:
      return <Clock size={12} style={{ color: "var(--pb-trigger)" }} />;
  }
}

function formatPrice(price: number): string {
  return `$${price.toFixed(3)}`;
}

function formatShares(shares: number): string {
  return shares.toFixed(2);
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

// ─── Logs Tab ───────────────────────────────────────────────────────────────

function LogsTab() {
  const logs = useEditorStore((s) => s.logs);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="bottom-panel-empty">
        No logs yet. Click <strong>Paper Run</strong> to execute your strategy.
      </div>
    );
  }

  return (
    <div className="log-list" ref={scrollRef}>
      {logs.map((log) => (
        <div key={log.id} className="log-run-group">
          <div className="log-run-header">
            <span style={{ color: "var(--pb-text-muted)", fontSize: 11 }}>
              {new Date(log.startedAt).toLocaleTimeString()}
            </span>
            <span
              style={{
                color:
                  log.status === "completed"
                    ? "var(--pb-logic)"
                    : "var(--pb-risk)",
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {log.status.toUpperCase()}
            </span>
            {log.summary && (
              <span
                style={{
                  color: "var(--pb-text-muted)",
                  fontSize: 11,
                  marginLeft: "auto",
                }}
              >
                {log.summary}
              </span>
            )}
          </div>
          {log.nodeResults.map((nr) => (
            <div
              key={`${log.id}-${nr.nodeId}`}
              className={`log-entry ${nr.status === "failed" ? "error" : nr.status === "skipped" ? "skipped" : ""}`}
            >
              <StatusIcon status={nr.status} />
              <span className="node-name">{getNodeLabel(nr.nodeId)}</span>
              <span className="message">
                {nr.error
                  ? `❌ ${nr.error}`
                  : nr.status === "skipped"
                    ? "skipped"
                    : nr.output
                      ? Object.entries(nr.output)
                          .map(
                            ([k, v]) =>
                              `${k}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v)}`,
                          )
                          .join(" · ")
                      : "done"}
              </span>
              <span className="duration">{nr.durationMs}ms</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Trades Tab ─────────────────────────────────────────────────────────────

function TradesTab() {
  const trades = useEditorStore((s) => s.trades);

  if (trades.length === 0) {
    return (
      <div className="bottom-panel-empty">
        No trades yet. Trades appear when <strong>PlaceOrder</strong> blocks
        execute during a Paper Run.
      </div>
    );
  }

  return (
    <div className="trades-table-wrapper">
      <table className="trades-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Side</th>
            <th>Price</th>
            <th>Shares</th>
            <th>Value</th>
            <th>Token</th>
            <th>Origin</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id} className={`trade-row trade-${trade.side.toLowerCase()}`}>
              <td className="trade-time">
                {new Date(trade.executedAt).toLocaleTimeString()}
              </td>
              <td>
                <span className={`trade-side-badge ${trade.side.toLowerCase()}`}>
                  {trade.side === "BUY" ? (
                    <ArrowUpRight size={10} />
                  ) : (
                    <ArrowDownRight size={10} />
                  )}
                  {trade.side}
                </span>
              </td>
              <td className="trade-price">{formatPrice(trade.price)}</td>
              <td>{formatShares(trade.size)}</td>
              <td className="trade-value">
                {formatPrice(trade.price * trade.size)}
              </td>
              <td className="trade-token" title={trade.tokenId}>
                {shortId(trade.tokenId)}
              </td>
              <td className="trade-origin">{getNodeLabel(trade.originNodeId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Positions Tab ──────────────────────────────────────────────────────────

function PositionsTab() {
  const positions = useEditorStore((s) => s.positions);

  if (positions.length === 0) {
    return (
      <div className="bottom-panel-empty">
        No open positions. Positions are created from executed trades.
      </div>
    );
  }

  return (
    <div className="trades-table-wrapper">
      <table className="trades-table">
        <thead>
          <tr>
            <th>Opened</th>
            <th>Side</th>
            <th>Shares</th>
            <th>Avg Entry</th>
            <th>Current</th>
            <th>P&L</th>
            <th>Token</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, i) => {
            const pnl = pos.unrealizedPnl;
            const pnlClass = pnl > 0 ? "pnl-positive" : pnl < 0 ? "pnl-negative" : "";
            return (
              <tr key={`${pos.tokenId}-${i}`} className="trade-row">
                <td className="trade-time">
                  {new Date(pos.openedAt).toLocaleTimeString()}
                </td>
                <td>
                  <span className={`trade-side-badge ${pos.side.toLowerCase()}`}>
                    {pos.side}
                  </span>
                </td>
                <td>{formatShares(pos.size)}</td>
                <td className="trade-price">{formatPrice(pos.avgEntryPrice)}</td>
                <td className="trade-price">{formatPrice(pos.currentPrice)}</td>
                <td className={`trade-pnl ${pnlClass}`}>
                  {pnl >= 0 ? "+" : ""}
                  {formatPrice(pnl)}
                </td>
                <td className="trade-token" title={pos.tokenId}>
                  {shortId(pos.tokenId)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function BottomPanel() {
  const bottomTab = useEditorStore((s) => s.bottomTab);
  const setBottomTab = useEditorStore((s) => s.setBottomTab);
  const clearLogs = useEditorStore((s) => s.clearLogs);
  const clearTrades = useEditorStore((s) => s.clearTrades);
  const toggleLogDrawer = useEditorStore((s) => s.toggleLogDrawer);
  const logs = useEditorStore((s) => s.logs);
  const trades = useEditorStore((s) => s.trades);
  const positions = useEditorStore((s) => s.positions);

  return (
    <div className="bottom-panel">
      <div className="bottom-panel-header">
        <div className="bottom-panel-tabs">
          <button
            className={`bottom-tab ${bottomTab === "logs" ? "active" : ""}`}
            onClick={() => setBottomTab("logs")}
          >
            Logs
            {logs.length > 0 && (
              <span className="tab-badge">{logs.length}</span>
            )}
          </button>
          <button
            className={`bottom-tab ${bottomTab === "trades" ? "active" : ""}`}
            onClick={() => setBottomTab("trades")}
          >
            Trades
            {trades.length > 0 && (
              <span className="tab-badge">{trades.length}</span>
            )}
          </button>
          <button
            className={`bottom-tab ${bottomTab === "positions" ? "active" : ""}`}
            onClick={() => setBottomTab("positions")}
          >
            Positions
            {positions.length > 0 && (
              <span className="tab-badge">{positions.length}</span>
            )}
          </button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <Button
            variant="icon"
            size="sm"
            onClick={bottomTab === "logs" ? clearLogs : clearTrades}
            title={bottomTab === "logs" ? "Clear logs" : "Clear trades"}
          >
            <Trash2 size={14} />
          </Button>
          <Button variant="icon" size="sm" onClick={toggleLogDrawer} title="Close">
            <ChevronDown size={14} />
          </Button>
        </div>
      </div>
      <div className="bottom-panel-body">
        {bottomTab === "logs" && <LogsTab />}
        {bottomTab === "trades" && <TradesTab />}
        {bottomTab === "positions" && <PositionsTab />}
      </div>
    </div>
  );
}
