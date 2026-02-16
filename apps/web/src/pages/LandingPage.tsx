/**
 * LandingPage — marketing page with hero, features, pricing, and auth.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import {
  Blocks,
  Zap,
  Shield,
  TrendingUp,
  BarChart3,
  GitBranch,
  CheckCircle,
  ArrowRight,
  Crown,
  Star,
  Layers,
  Play,
  Lock,
  Mail,
  Loader2,
} from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();
  const { login, loginWithEmail, register, isLoggedIn, loading } = useAuthStore();

  // Auth form state
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAuthForm, setShowAuthForm] = useState(false);

  const handleStart = () => {
    if (isLoggedIn()) {
      navigate("/");
    } else {
      setShowAuthForm(true);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (authMode === "register") {
      const result = await register(email, password, name || undefined);
      if (result.error) {
        setAuthError(result.error);
      } else {
        navigate("/");
      }
    } else {
      const result = await loginWithEmail(email, password);
      if (result.error) {
        setAuthError(result.error);
      } else {
        navigate("/");
      }
    }
  };

  return (
    <div className="landing">
      {/* ── Navbar ────────────────────────────────────────────────────── */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round" />
            <polygon points="12,6 18,9.5 18,14.5 12,18 6,14.5 6,9.5" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2" fill="white" />
          </svg>
          <span>Polyblocks</span>
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#pricing">Pricing</a>
          <a href="#docs">Docs</a>
        </div>
        <button className="landing-nav-cta" onClick={handleStart}>
          {isLoggedIn() ? "Go to Dashboard" : "Get Started"}
          <ArrowRight size={14} />
        </button>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-hero-badge">
          <Star size={12} />
          No-Code Strategy Builder for Polymarket
        </div>
        <h1>
          Build Trading Strategies<br />
          <span className="gradient-text">Without Writing Code</span>
        </h1>
        <p className="landing-hero-sub">
          Drag blocks, connect logic, and trade on Polymarket — all from a visual canvas.
          Paper trade for free or go live with real orders.
        </p>
        <div className="landing-hero-actions">
          <button className="landing-btn-primary" onClick={handleStart}>
            <Play size={16} />
            Start Building — Free
          </button>
          <a className="landing-btn-secondary" href="#how-it-works">
            See How It Works
          </a>
        </div>
        <div className="landing-hero-preview">
          <div className="preview-window">
            <div className="preview-toolbar">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
              <span className="preview-title">Strategy Editor</span>
            </div>
            <div className="preview-canvas">
              <div className="preview-block trigger">
                <Zap size={14} />
                <span>Market Trigger</span>
              </div>
              <div className="preview-edge" />
              <div className="preview-block condition">
                <GitBranch size={14} />
                <span>Price &gt; 0.65</span>
              </div>
              <div className="preview-edge" />
              <div className="preview-block action">
                <TrendingUp size={14} />
                <span>Place Order</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section className="landing-section" id="features">
        <div className="landing-section-header">
          <h2>Everything You Need to Trade Smarter</h2>
          <p>29 block types, real-time data, and a powerful execution engine — all visual.</p>
        </div>

        <div className="landing-features">
          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(99,102,241,0.12)", color: "var(--pb-accent)" }}>
              <Blocks size={22} />
            </div>
            <h3>29 Block Types</h3>
            <p>Market data, triggers, conditions, logic gates, risk management, order execution — every building block you need.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
              <Layers size={22} />
            </div>
            <h3>Visual Canvas</h3>
            <p>Drag &amp; drop blocks onto a React Flow canvas. Connect them visually to build complex strategies without code.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
              <BarChart3 size={22} />
            </div>
            <h3>Paper Trading</h3>
            <p>Test strategies with simulated orders. See logs, trades, and P&amp;L in real time — no risk involved.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
              <Zap size={22} />
            </div>
            <h3>Live Trading</h3>
            <p>Upgrade to Pro and execute real orders on Polymarket via the CLOB API. Full wallet integration.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>
              <GitBranch size={22} />
            </div>
            <h3>Advanced Logic</h3>
            <p>IF/ELSE branching, AND/OR/NOT gates, multi-market comparison, position sizing — build anything.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>
              <Shield size={22} />
            </div>
            <h3>Risk Management</h3>
            <p>Stop-loss, take-profit, position sizer, and cooldown blocks keep your strategies safe.</p>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────── */}
      <section className="landing-section landing-section-alt" id="how-it-works">
        <div className="landing-section-header">
          <h2>How It Works</h2>
          <p>Get from idea to automated strategy in 3 simple steps.</p>
        </div>

        <div className="landing-steps">
          <div className="landing-step">
            <div className="step-number">1</div>
            <h3>Build</h3>
            <p>Drag blocks from the palette onto the canvas. Configure each block's settings — pick your markets, set thresholds, define order sizes.</p>
          </div>
          <div className="landing-step-arrow">
            <ArrowRight size={20} />
          </div>
          <div className="landing-step">
            <div className="step-number">2</div>
            <h3>Connect</h3>
            <p>Wire blocks together. Data flows from triggers through conditions and logic gates to action blocks. The visual flow shows your strategy at a glance.</p>
          </div>
          <div className="landing-step-arrow">
            <ArrowRight size={20} />
          </div>
          <div className="landing-step">
            <div className="step-number">3</div>
            <h3>Run</h3>
            <p>Hit Paper Run to simulate, or upgrade to Pro for Live Run with real orders. Watch execution logs, trades, and positions in real time.</p>
          </div>
        </div>
      </section>

      {/* ── Documentation ────────────────────────────────────────────── */}
      <section className="landing-section" id="docs">
        <div className="landing-section-header">
          <h2>Block Reference</h2>
          <p>Every block type at your fingertips.</p>
        </div>

        <div className="landing-docs-grid">
          <div className="doc-category">
            <h4>📡 Data Blocks</h4>
            <ul>
              <li><strong>Market Data</strong> — Fetch live Polymarket prices and volume</li>
              <li><strong>Order Book</strong> — Bid/ask spread, depth, and mid-price</li>
              <li><strong>Portfolio</strong> — Your current balances and positions</li>
              <li><strong>Market Search</strong> — Find markets by keyword</li>
              <li><strong>Multi-Market Compare</strong> — Side-by-side market comparison</li>
            </ul>
          </div>

          <div className="doc-category">
            <h4>⚡ Trigger Blocks</h4>
            <ul>
              <li><strong>Interval Trigger</strong> — Run on a timer (5s–24h)</li>
              <li><strong>Price Threshold</strong> — Fire when price crosses a level</li>
              <li><strong>Manual Trigger</strong> — Fire on-demand with a button</li>
              <li><strong>Event Resolution</strong> — Fire when market resolves</li>
            </ul>
          </div>

          <div className="doc-category">
            <h4>🧠 Condition Blocks</h4>
            <ul>
              <li><strong>Price Condition</strong> — Compare price vs threshold</li>
              <li><strong>Volume Filter</strong> — Gate on trade volume</li>
              <li><strong>Time Window</strong> — Only pass during hours/days</li>
              <li><strong>Spread Condition</strong> — Check bid–ask spread</li>
            </ul>
          </div>

          <div className="doc-category">
            <h4>🔀 Logic Blocks</h4>
            <ul>
              <li><strong>AND Gate</strong> — All inputs must be true</li>
              <li><strong>OR Gate</strong> — Any input can be true</li>
              <li><strong>NOT Gate</strong> — Invert a signal</li>
              <li><strong>IF/ELSE</strong> — Branch on a condition</li>
              <li><strong>Delay</strong> — Wait before passing signal</li>
            </ul>
          </div>

          <div className="doc-category">
            <h4>📊 Action Blocks</h4>
            <ul>
              <li><strong>Place Order</strong> — Buy/sell on Polymarket</li>
              <li><strong>Cancel Order</strong> — Cancel open orders</li>
              <li><strong>Alert</strong> — Log a notification</li>
              <li><strong>Position Sizer</strong> — Calculate order size by risk</li>
            </ul>
          </div>

          <div className="doc-category">
            <h4>🛡️ Risk Blocks</h4>
            <ul>
              <li><strong>Stop Loss</strong> — Exit below a price</li>
              <li><strong>Take Profit</strong> — Exit above a price</li>
              <li><strong>Cooldown</strong> — Rate-limit executions</li>
              <li><strong>Max Position</strong> — Cap position size</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section className="landing-section landing-section-alt" id="pricing">
        <div className="landing-section-header">
          <h2>Simple Pricing</h2>
          <p>Start free. Upgrade when you're ready to go live.</p>
        </div>

        <div className="landing-pricing">
          {/* Free tier */}
          <div className="pricing-card">
            <div className="pricing-tier">Free</div>
            <div className="pricing-price">
              <span className="price-amount">$0</span>
              <span className="price-period">/forever</span>
            </div>
            <p className="pricing-desc">Perfect for learning and testing strategies.</p>
            <ul className="pricing-features">
              <li><CheckCircle size={14} /> Visual strategy builder</li>
              <li><CheckCircle size={14} /> All 29 block types</li>
              <li><CheckCircle size={14} /> Unlimited strategies</li>
              <li><CheckCircle size={14} /> Paper trading (simulated)</li>
              <li><CheckCircle size={14} /> Execution logs &amp; analytics</li>
              <li><CheckCircle size={14} /> Strategy library &amp; templates</li>
              <li className="disabled"><Lock size={14} /> Live trading</li>
              <li className="disabled"><Lock size={14} /> Real order execution</li>
            </ul>
            <button className="pricing-btn" onClick={handleStart}>
              Get Started Free
            </button>
          </div>

          {/* Pro tier */}
          <div className="pricing-card pro">
            <div className="pricing-badge">
              <Crown size={12} />
              Most Popular
            </div>
            <div className="pricing-tier">Pro</div>
            <div className="pricing-price">
              <span className="price-amount">$7</span>
              <span className="price-period">/month</span>
            </div>
            <p className="pricing-desc">Full power. Real trading on Polymarket.</p>
            <ul className="pricing-features">
              <li><CheckCircle size={14} /> Everything in Free</li>
              <li><CheckCircle size={14} /> Live trading with real orders</li>
              <li><CheckCircle size={14} /> CLOB API integration</li>
              <li><CheckCircle size={14} /> Wallet management</li>
              <li><CheckCircle size={14} /> Priority support</li>
              <li><CheckCircle size={14} /> Pay with crypto</li>
            </ul>
            <button className="pricing-btn pro" onClick={() => {
              if (isLoggedIn()) {
                navigate("/pricing");
              } else {
                login();
              }
            }}>
              <Crown size={14} />
              Upgrade to Pro
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round" />
            <polygon points="12,6 18,9.5 18,14.5 12,18 6,14.5 6,9.5" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2" fill="white" />
          </svg>
          <span>Polyblocks</span>
        </div>
        <p>© {new Date().getFullYear()} Polyblocks. No-code trading for Polymarket.</p>
      </footer>

      {/* ── Auth Modal ───────────────────────────────────────────────── */}
      {showAuthForm && (
        <div className="auth-modal-overlay" onClick={() => setShowAuthForm(false)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{authMode === "login" ? "Sign In" : "Create Account"}</h2>
            <p className="auth-modal-sub">
              {authMode === "login"
                ? "Welcome back! Sign in to your account."
                : "Get started with Polyblocks for free."}
            </p>

            {/* Google button */}
            <button className="auth-google-btn" onClick={login}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailAuth} className="auth-email-form">
              {authMode === "register" && (
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="auth-input"
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="auth-input"
              />
              <input
                type="password"
                placeholder="Password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="auth-input"
              />

              {authError && (
                <div className="auth-error">{authError}</div>
              )}

              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? (
                  <><Loader2 size={14} className="spin" /> Please wait...</>
                ) : (
                  <><Mail size={14} /> {authMode === "login" ? "Sign In" : "Create Account"}</>
                )}
              </button>
            </form>

            <p className="auth-switch">
              {authMode === "login" ? (
                <>Don't have an account?{" "}<button onClick={() => { setAuthMode("register"); setAuthError(null); }}>Sign up</button></>
              ) : (
                <>Already have an account?{" "}<button onClick={() => { setAuthMode("login"); setAuthError(null); }}>Sign in</button></>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
