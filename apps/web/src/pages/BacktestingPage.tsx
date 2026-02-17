/**
 * BacktestingPage — Coming Soon placeholder for future backtesting feature.
 */

import { FlaskConical, TrendingUp, BarChart3, Clock, Zap } from "lucide-react";

export default function BacktestingPage() {
  return (
    <div className="page-container" style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px" }}>
      <div style={{ textAlign: "center" }}>
        {/* Icon */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(249,115,22,0.15))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}
        >
          <FlaskConical size={40} color="#f59e0b" />
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Backtesting</h1>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "#f59e0b",
            background: "rgba(245,158,11,0.1)",
            padding: "4px 12px",
            borderRadius: 999,
            marginBottom: 16,
          }}
        >
          <Clock size={12} />
          Coming Soon
        </div>
        <p
          style={{
            color: "var(--pb-text-muted)",
            fontSize: 15,
            maxWidth: 440,
            margin: "0 auto 32px",
            lineHeight: 1.6,
          }}
        >
          Test your strategies against historical market data before risking real money.
          See how your blocks would have performed in the past.
        </p>

        {/* Feature preview cards */}
        <div
          style={{
            background: "var(--pb-surface-2)",
            border: "1px solid var(--pb-border)",
            borderRadius: 12,
            padding: 24,
            textAlign: "left",
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "var(--pb-text-primary)" }}>
            What to expect
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(99,102,241,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <BarChart3 size={18} color="var(--pb-accent)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Historical Simulation</div>
                <div style={{ fontSize: 12, color: "var(--pb-text-muted)" }}>
                  Run your strategy against past market data to see how it would have traded
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(16,185,129,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <TrendingUp size={18} color="#10b981" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>P&L Analytics</div>
                <div style={{ fontSize: 12, color: "var(--pb-text-muted)" }}>
                  Detailed profit/loss curves, drawdown charts, Sharpe ratio, and win rate metrics
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(245,158,11,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Zap size={18} color="#f59e0b" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Strategy Optimization</div>
                <div style={{ fontSize: 12, color: "var(--pb-text-muted)" }}>
                  Compare different parameter settings and find the optimal configuration
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom note */}
        <p style={{ fontSize: 12, color: "var(--pb-text-muted)", marginTop: 20 }}>
          We're building this right now. Stay tuned for updates!
        </p>
      </div>
    </div>
  );
}
