/**
 * BacktestingPage — Copy Trading feature for Pro users.
 * Uses the same logic as UserActivity block — monitors a whale address and mirrors trades.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import {
  Users,
  Crown,
  Play,
  Square,
  Loader2,
  CheckCircle,
  TrendingUp,
  Clock,
  Shield,
  Zap,
  Lock,
} from "lucide-react";
import { Button, Input } from "@polyblocks/ui";

interface CopyTrade {
  id: string;
  time: string;
  side: string;
  outcome: string;
  title: string;
  size: number;
  price: number;
  status: "copied" | "skipped" | "error";
  reason?: string;
}

export default function BacktestingPage() {
  const navigate = useNavigate();
  const { isPro } = useAuthStore();
  const [targetAddress, setTargetAddress] = useState("");
  const [intervalSec, setIntervalSec] = useState(30);
  const [maxSize, setMaxSize] = useState(50);
  const [running, setRunning] = useState(false);
  const [trades, setTrades] = useState<CopyTrade[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenHashesRef = useRef(new Set<string>());
  const firstFetchRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const fetchAndCopy = useCallback(async () => {
    if (!targetAddress.trim()) return;

    try {
      const url = `https://data-api.polymarket.com/activity?user=${encodeURIComponent(targetAddress.trim())}&limit=1&sortBy=TIMESTAMP&sortDirection=DESC`;
      const res = await fetch(url);
      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        setStatus("No activity found for this address");
        return;
      }

      const trade = data[0];
      const txHash = trade.transactionHash || `${trade.timestamp}_${trade.conditionId}`;
      const side = String(trade.side || "");
      const outcome = String(trade.outcome || "");
      const title = String(trade.title || "Unknown");
      const size = parseFloat(String(trade.usdcSize ?? trade.size ?? "0"));
      const price = parseFloat(String(trade.price ?? "0"));

      // First fetch — just record, don't copy
      if (firstFetchRef.current) {
        firstFetchRef.current = false;
        seenHashesRef.current.add(txHash);
        setStatus(`Monitoring ${targetAddress.slice(0, 8)}… — waiting for new trades`);
        return;
      }

      // Dedup — skip already-seen trades
      if (seenHashesRef.current.has(txHash)) {
        setStatus(`No new trades since last check`);
        return;
      }

      seenHashesRef.current.add(txHash);

      // Cap size
      const cappedSize = Math.min(size, maxSize);

      const newTrade: CopyTrade = {
        id: txHash,
        time: new Date().toLocaleTimeString(),
        side,
        outcome,
        title,
        size: cappedSize,
        price,
        status: "copied",
      };

      // In paper mode, just log the trade
      setTrades((prev) => [newTrade, ...prev].slice(0, 50));
      setStatus(`🎯 Copied: ${side} ${outcome} "${title.slice(0, 30)}" — $${cappedSize.toFixed(2)} @ ${price.toFixed(4)}`);
    } catch (err) {
      setStatus(`❌ Error: ${(err as Error).message}`);
    }
  }, [targetAddress, maxSize]);

  const handleStart = useCallback(() => {
    if (!targetAddress.trim()) {
      setStatus("Please enter a target wallet address");
      return;
    }
    setRunning(true);
    firstFetchRef.current = true;
    seenHashesRef.current.clear();
    setStatus("Starting copy trading…");
    fetchAndCopy(); // initial fetch
    timerRef.current = setInterval(fetchAndCopy, intervalSec * 1000);
  }, [targetAddress, intervalSec, fetchAndCopy]);

  const handleStop = useCallback(() => {
    setRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus("Copy trading stopped");
  }, []);

  // ── Pro Gate ────────────────────────────────────────────────────────────
  if (!isPro()) {
    return (
      <div className="page-container" style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
            }}
          >
            <Lock size={40} color="var(--pb-accent)" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Copy Trading</h1>
          <p style={{ color: "var(--pb-text-muted)", fontSize: 15, maxWidth: 440, margin: "0 auto 24px" }}>
            Mirror trades from top Polymarket wallets automatically.
            Copy Trading is a Pro-exclusive feature.
          </p>
          <div style={{
            background: "var(--pb-surface-2)",
            border: "1px solid var(--pb-border)",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <CheckCircle size={14} color="#22c55e" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Auto-mirror trades</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--pb-text-muted)", margin: 0 }}>Instantly copy whale moves</p>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <CheckCircle size={14} color="#22c55e" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Duplicate prevention</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--pb-text-muted)", margin: 0 }}>Never re-take the same trade</p>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <CheckCircle size={14} color="#22c55e" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Size capping</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--pb-text-muted)", margin: 0 }}>Set max order size limits</p>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <CheckCircle size={14} color="#22c55e" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Real-time logs</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--pb-text-muted)", margin: 0 }}>Full trade history & status</p>
              </div>
            </div>
            <Button variant="primary" onClick={() => navigate("/pricing")}>
              <Crown size={14} />
              Upgrade to Pro — $7/mo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Copy Trading UI ────────────────────────────────────────────────────
  return (
    <div className="page-container" style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "linear-gradient(135deg, var(--pb-accent), #8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Users size={24} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Copy Trading</h1>
          <p style={{ color: "var(--pb-text-muted)", fontSize: 13, margin: 0 }}>
            Mirror trades from any Polymarket wallet in real time
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <Crown size={14} color="var(--pb-accent)" />
          <span style={{ fontSize: 12, color: "var(--pb-accent)", fontWeight: 600 }}>PRO</span>
        </div>
      </div>

      {/* Config */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            gridColumn: "1 / -1",
            background: "var(--pb-surface-2)",
            border: "1px solid var(--pb-border)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pb-text-secondary)", marginBottom: 6, display: "block" }}>
            Target Wallet Address
          </label>
          <Input
            placeholder="0x... (Polymarket wallet to copy)"
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
            disabled={running}
            style={{ fontFamily: "monospace" }}
          />
          <p style={{ fontSize: 11, color: "var(--pb-text-muted)", marginTop: 4, margin: "4px 0 0" }}>
            Enter the wallet address of the trader you want to copy. Find whale wallets on Polymarket leaderboard.
          </p>
        </div>

        <div
          style={{
            background: "var(--pb-surface-2)",
            border: "1px solid var(--pb-border)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pb-text-secondary)", marginBottom: 6, display: "block" }}>
            <Clock size={12} style={{ marginRight: 4 }} />
            Check Interval (seconds)
          </label>
          <Input
            type="number"
            min={10}
            max={300}
            value={intervalSec}
            onChange={(e) => setIntervalSec(Number(e.target.value))}
            disabled={running}
          />
        </div>

        <div
          style={{
            background: "var(--pb-surface-2)",
            border: "1px solid var(--pb-border)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pb-text-secondary)", marginBottom: 6, display: "block" }}>
            <Shield size={12} style={{ marginRight: 4 }} />
            Max Trade Size ($)
          </label>
          <Input
            type="number"
            min={1}
            max={10000}
            value={maxSize}
            onChange={(e) => setMaxSize(Number(e.target.value))}
            disabled={running}
          />
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {!running ? (
          <Button variant="primary" onClick={handleStart} disabled={!targetAddress.trim()}>
            <Play size={14} />
            Start Copy Trading
          </Button>
        ) : (
          <Button variant="danger" onClick={handleStop}>
            <Square size={14} />
            Stop
          </Button>
        )}
        {status && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: status.startsWith("❌") ? "#ef4444" : status.includes("🎯") ? "#22c55e" : "var(--pb-text-secondary)",
            padding: "0 12px",
            background: "var(--pb-surface-2)",
            borderRadius: 8,
            flex: 1,
          }}>
            {running && !status.startsWith("❌") && <Loader2 size={14} className="spin" />}
            {status}
          </div>
        )}
      </div>

      {/* Feature badges */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, background: "rgba(16,185,129,0.1)", color: "#10b981", padding: "4px 10px", borderRadius: 999 }}>
          <Zap size={10} /> Real-time monitoring
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, background: "rgba(99,102,241,0.1)", color: "var(--pb-accent)", padding: "4px 10px", borderRadius: 999 }}>
          <Shield size={10} /> Duplicate prevention
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, background: "rgba(245,158,11,0.1)", color: "#f59e0b", padding: "4px 10px", borderRadius: 999 }}>
          <TrendingUp size={10} /> Paper mode (safe)
        </span>
      </div>

      {/* Trade log */}
      <div
        style={{
          background: "var(--pb-surface-2)",
          border: "1px solid var(--pb-border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--pb-border)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>Trade Log</span>
          <span style={{ fontSize: 11, color: "var(--pb-text-muted)" }}>
            {trades.length} trade{trades.length !== 1 ? "s" : ""} copied
          </span>
        </div>

        {trades.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--pb-text-muted)", fontSize: 13 }}>
            {running
              ? "Waiting for new trades from target wallet…"
              : "Start copy trading to see trades here"}
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {trades.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--pb-border)",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--pb-text-muted)", width: 70, flexShrink: 0 }}>{t.time}</span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    background: t.side === "BUY" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                    color: t.side === "BUY" ? "#10b981" : "#ef4444",
                  }}
                >
                  {t.side}
                </span>
                <span style={{ fontWeight: 600, color: "var(--pb-accent)" }}>{t.outcome}</span>
                <span style={{ flex: 1, color: "var(--pb-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.title}
                </span>
                <span style={{ fontWeight: 600, color: "var(--pb-text-primary)" }}>${t.size.toFixed(2)}</span>
                <span style={{ color: "var(--pb-text-muted)" }}>@ {t.price.toFixed(4)}</span>
                <CheckCircle size={12} color="#22c55e" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
