/**
 * LandingPage — high-converting marketing page with hero, features, social proof, pricing, and auth.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { Blocks, Zap, Shield, TrendingUp, BarChart3, GitBranch, CheckCircle, ArrowRight, Crown, Star, Layers, Play, Lock, Mail, Loader2, Users, Globe, Bot, Sparkles, Target, Workflow, BadgeCheck, MessageCircle, Clock, Headphones, Send } from "lucide-react";
import "../styles/landing-animations.css";

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

  // Contact form state
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Scroll effect state
  const [scrollY, setScrollY] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<"up" | "down">("up");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate mouse position relative to center of screen for parallax
      const x = (e.clientX - window.innerWidth / 2) * 0.05;
      const y = (e.clientY - window.innerHeight / 2) * 0.05;
      setMousePos({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    let lastScrollY = window.pageYOffset;
    let ticking = false;

    const updateScroll = () => {
      const currentScrollY = window.pageYOffset;
      setScrollY(currentScrollY);

      if (Math.abs(currentScrollY - lastScrollY) > 5) {
        setScrollDirection(currentScrollY > lastScrollY ? "down" : "up");
        lastScrollY = currentScrollY > 0 ? currentScrollY : 0;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScroll);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleStart = () => {
    if (isLoggedIn()) {
      navigate("/dashboard");
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
        navigate("/dashboard");
      }
    } else {
      const result = await loginWithEmail(email, password);
      if (result.error) {
        setAuthError(result.error);
      } else {
        navigate("/dashboard");
      }
    }
  };

  return (
    <div className="landing">
      {/* ── Background Animation ───────────────────────────────────────── */}
      <div className="landing-bg-animation">
        <div style={{ transform: `translate(${mousePos.x * 1.5}px, ${mousePos.y * 1.5}px)`, transition: 'transform 0.1s ease-out' }}>
          <div className="glow-orb orb-1" />
        </div>
        <div style={{ transform: `translate(${mousePos.x * -1.2}px, ${mousePos.y * -1.2}px)`, transition: 'transform 0.1s ease-out' }}>
          <div className="glow-orb orb-2" />
        </div>
        <div style={{ transform: `translate(${mousePos.x * 0.8}px, ${mousePos.y * 0.8}px)`, transition: 'transform 0.1s ease-out' }}>
          <div className="glow-orb orb-3" />
        </div>
        <div className="grid-overlay" style={{ transform: `translate(${mousePos.x * -0.5}px, ${mousePos.y * -0.5}px)`, transition: 'transform 0.1s ease-out' }} />
      </div>

      {/* ── Navbar ────────────────────────────────────────────────────── */}
      <nav 
        className="landing-nav"
        style={{
          transform: scrollY > 50 && scrollDirection === "down" ? "translateY(-100%)" : "translateY(0)",
          transition: "transform 0.3s ease-in-out, background 0.3s ease",
          background: scrollY > 20 ? "rgba(10, 10, 10, 0.8)" : "transparent",
          backdropFilter: scrollY > 20 ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrollY > 20 ? "blur(12px)" : "none",
        }}
      >
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
        <div className="landing-hero-live-badge">
          <Zap size={14} style={{ color: "#f59e0b" }} />
          <span>Live trading on Polymarket is just <strong>5 USDC/mo</strong></span>
        </div>
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
          <div 
            className="preview-window"
            style={{
              transform: scrollY === 0 
                ? "perspective(1000px) rotateX(0deg) translateY(0)"
                : `perspective(1000px) rotateX(${scrollDirection === "down" ? 8 : -4}deg) translateY(${scrollDirection === "down" ? 15 : -5}px)`,
              transition: "transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.6s ease",
              boxShadow: scrollDirection === "down" 
                ? "0 30px 60px rgba(0,0,0,0.5), 0 0 0 1px var(--pb-border)" 
                : "0 10px 30px rgba(0,0,0,0.3), 0 0 0 1px var(--pb-border)"
            }}
          >
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

      {/* ── Social Proof Bar ────────────────────────────────────────── */}
      <div className="landing-social-proof">
        <div className="social-proof-item">
          <strong>500+</strong>
          <span>Strategies Built</span>
        </div>
        <div className="social-proof-divider" />
        <div className="social-proof-item">
          <strong>31</strong>
          <span>Block Types</span>
        </div>
        <div className="social-proof-divider" />
        <div className="social-proof-item">
          <strong>24/7</strong>
          <span>Automated Trading</span>
        </div>
        <div className="social-proof-divider" />
        <div className="social-proof-item">
          <strong>$0</strong>
          <span>To Start</span>
        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section className="landing-section" id="features">
        <div className="landing-section-header">
          <h2>Everything You Need to Trade Smarter</h2>
          <p>31 block types, real-time data, AI-powered builder, and a powerful execution engine — all visual.</p>
        </div>

        <div className="landing-features">
          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(99,102,241,0.12)", color: "var(--pb-accent)" }}>
              <Blocks size={22} />
            </div>
            <h3>31 Block Types</h3>
            <p>Market data, triggers, conditions, logic gates, risk management, order execution, custom APIs — every building block you need.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
              <Layers size={22} />
            </div>
            <h3>Visual Canvas</h3>
            <p>Drag &amp; drop blocks onto a React Flow canvas. Connect them visually with animated data-flow edges to build complex strategies without code.</p>
          </div>

          <div className="landing-feature-card featured">
            <div className="feature-icon" style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>
              <Users size={22} />
            </div>
            <h3>Copy Trading <span className="feature-badge pro">PRO</span></h3>
            <p>Mirror trades from top Polymarket wallets automatically. Built-in duplicate prevention ensures you never re-take the same trade.</p>
          </div>

          <div className="landing-feature-card featured">
            <div className="feature-icon" style={{ background: "rgba(6,182,212,0.12)", color: "#06b6d4" }}>
              <Bot size={22} />
            </div>
            <h3>AI Strategy Builder <span className="feature-badge new">NEW</span></h3>
            <p>Describe your strategy in plain English and let GPT-4o generate the entire block layout automatically. From idea to strategy in seconds.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
              <BarChart3 size={22} />
            </div>
            <h3>Paper Trading</h3>
            <p>Test strategies with simulated orders. See logs, trades, and P&amp;L in real time — zero risk involved.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
              <Zap size={22} />
            </div>
            <h3>Live Trading <span className="feature-badge pro">PRO</span></h3>
            <p>Execute real orders on Polymarket via the CLOB API. Full wallet integration with position tracking.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>
              <Globe size={22} />
            </div>
            <h3>Custom API Data <span className="feature-badge beta">BETA</span></h3>
            <p>Pull data from any external API — weather, news, crypto prices — and feed it into your strategies for maximum flexibility.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>
              <GitBranch size={22} />
            </div>
            <h3>Advanced Logic</h3>
            <p>IF/ELSE branching, AND/OR/NOT gates with signal pass-through, multi-market comparison, Kelly position sizing — build anything.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>
              <Shield size={22} />
            </div>
            <h3>Risk Management</h3>
            <p>Max exposure limits, daily loss limits, kill switch, cooldown blocks, and duplicate trade prevention keep your strategies safe.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon" style={{ background: "rgba(236,72,153,0.12)", color: "#ec4899" }}>
              <Target size={22} />
            </div>
            <h3>EV &amp; Edge Calculator</h3>
            <p>Calculate expected value, implied probability, and your edge vs the market. Only take +EV bets with built-in math blocks.</p>
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
            <p>Drag blocks from the palette onto the canvas — or describe your strategy in plain English and let AI build it for you.</p>
          </div>
          <div className="landing-step-arrow">
            <ArrowRight size={20} />
          </div>
          <div className="landing-step">
            <div className="step-number">2</div>
            <h3>Connect</h3>
            <p>Wire blocks together. Animated data-flow edges show signals routing through conditions and logic gates to action blocks.</p>
          </div>
          <div className="landing-step-arrow">
            <ArrowRight size={20} />
          </div>
          <div className="landing-step">
            <div className="step-number">3</div>
            <h3>Run</h3>
            <p>Hit Paper Run to simulate, or upgrade to Pro for Live Run + Copy Trading. Watch execution logs, trades, and positions in real time.</p>
          </div>
        </div>
      </section>

      {/* ── Testimonials / Use Cases ──────────────────────────────────── */}
      <section className="landing-section" id="use-cases">
        <div className="landing-section-header">
          <h2>What You Can Build</h2>
          <p>Real strategies our users run every day.</p>
        </div>

        <div className="landing-use-cases">
          <div className="use-case-card">
            <div className="use-case-icon" style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>
              <Users size={20} />
            </div>
            <h4>Copy Trader</h4>
            <p>Follow a whale wallet. When they buy, you buy — automatically. With duplicate prevention so you never double-up.</p>
            <span className="use-case-tag">Most Popular</span>
          </div>
          <div className="use-case-card">
            <div className="use-case-icon" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
              <TrendingUp size={20} />
            </div>
            <h4>EV Arbitrage</h4>
            <p>Calculate expected value across markets. Only place bets when your edge exceeds 2%. Kelly-sized for optimal returns.</p>
          </div>
          <div className="use-case-card">
            <div className="use-case-icon" style={{ background: "rgba(6,182,212,0.12)", color: "#06b6d4" }}>
              <Globe size={20} />
            </div>
            <h4>Weather Trader</h4>
            <p>Pull real-time weather data via Custom API block. Trade weather markets based on actual forecast data.</p>
            <span className="use-case-tag beta">Beta</span>
          </div>
          <div className="use-case-card">
            <div className="use-case-icon" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
              <Sparkles size={20} />
            </div>
            <h4>Multi-Condition Buyer</h4>
            <p>Price above 0.6 AND volume over $10K AND spread under 3¢? Then buy $50 — all wired visually.</p>
          </div>
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            gridColumn: "1 / -1", 
            marginTop: 16,
            color: "var(--pb-text-muted)",
            fontSize: 14,
            fontWeight: 500
          }}>
            ...and many more
          </div>
        </div>
      </section>

      {/* ── Documentation ────────────────────────────────────────────── */}
      <section className="landing-section landing-section-alt" id="docs">
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
              <li><strong>User Activity</strong> — Copy trading data from any wallet <Crown size={10} style={{ color: "var(--pb-accent)" }} /></li>
              <li><strong>Custom API</strong> — External REST API data integration <span style={{ fontSize: 9, color: "#06b6d4", fontWeight: 700 }}>BETA</span></li>
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
            <h4>🔀 Logic &amp; Math</h4>
            <ul>
              <li><strong>AND/OR Gate</strong> — With signal pass-through</li>
              <li><strong>NOT Gate</strong> — Invert a signal</li>
              <li><strong>IF/ELSE</strong> — Branch on a condition</li>
              <li><strong>Math</strong> — Multi-input arithmetic</li>
              <li><strong>EV Calculator</strong> — Expected value analysis</li>
              <li><strong>Edge Calculator</strong> — True prob vs market</li>
              <li><strong>Position Sizer</strong> — Kelly criterion sizing</li>
            </ul>
          </div>

          <div className="doc-category">
            <h4>📊 Action Blocks</h4>
            <ul>
              <li><strong>Place Order</strong> — Market order with dedup option</li>
              <li><strong>Limit Order</strong> — Limit order at specific price</li>
              <li><strong>Cancel Order</strong> — Cancel open orders</li>
              <li><strong>Notification</strong> — Log alerts and events</li>
            </ul>
          </div>

          <div className="doc-category">
            <h4>🛡️ Risk Blocks</h4>
            <ul>
              <li><strong>Max Exposure</strong> — Cap total position size</li>
              <li><strong>Daily Loss Limit</strong> — Auto-stop on drawdown</li>
              <li><strong>Kill Switch</strong> — Emergency halt all orders</li>
              <li><strong>Cooldown</strong> — Rate-limit executions</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section className="landing-section landing-section-alt" id="pricing">
        <div className="landing-section-header">
          <h2>Simple, Transparent Pricing</h2>
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
              <li><CheckCircle size={14} /> All 31 block types</li>
              <li><CheckCircle size={14} /> Unlimited strategies</li>
              <li><CheckCircle size={14} /> Paper trading (simulated)</li>
              <li><CheckCircle size={14} /> Execution logs</li>
              <li><CheckCircle size={14} /> AI strategy builder</li>
              <li><CheckCircle size={14} /> Strategy templates</li>
              <li><CheckCircle size={14} /> Custom API data <span style={{ fontSize: 9, color: "#06b6d4", fontWeight: 700 }}>BETA</span></li>
              <li className="disabled"><Lock size={14} /> Live trading</li>
              <li className="disabled"><Lock size={14} /> Copy trading</li>
              <li className="disabled"><Lock size={14} /> User activity monitoring</li>
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
              <span className="price-amount pb-price-old">20 USDC</span>
              <span className="price-amount pb-price-new">10 USDC</span>
              <span className="price-period">/mo</span>
            </div>
            <p className="pricing-desc">Full power. Real trading + copy trading on Polymarket.</p>
            <ul className="pricing-features">
              <li><CheckCircle size={14} /> Everything in Free</li>
              <li className="highlight"><Zap size={14} /> Live trading with real orders</li>
              <li className="highlight"><Users size={14} /> Copy Trading dashboard</li>
              <li className="highlight"><BadgeCheck size={14} /> User Activity block</li>
              <li><CheckCircle size={14} /> CLOB API integration</li>
              <li><CheckCircle size={14} /> Wallet management</li>
              <li><CheckCircle size={14} /> Duplicate trade prevention</li>
              <li><CheckCircle size={14} /> Priority support</li>
              <li><CheckCircle size={14} /> Pay with crypto (USDC)</li>
            </ul>
            <button className="pricing-btn pro" onClick={() => {
              if (isLoggedIn()) {
                navigate("/pricing");
              } else {
                login();
              }
            }}>
              <Crown size={14} />
              Upgrade to Pro — <span className="pb-price-old">20 USDC</span> <span className="pb-price-new">10 USDC</span>/mo
            </button>
            <p className="pricing-guarantee">30-day money-back guarantee</p>
          </div>

          {/* Enterprise tier */}
          <div className="pricing-card enterprise">
            <div className="pricing-badge enterprise-badge">
              <MessageCircle size={12} />
              Custom Plan
            </div>
            <div className="pricing-tier">Enterprise</div>
            <div className="pricing-price">
              <span className="price-amount" style={{ fontSize: 28 }}>Let's Talk</span>
            </div>
            <p className="pricing-desc">Need custom solutions? 24/7 automated trading at scale.</p>
            <ul className="pricing-features">
              <li><CheckCircle size={14} /> Everything in Pro</li>
              <li className="highlight"><Clock size={14} /> 24/7 automated trading</li>
              <li className="highlight"><Headphones size={14} /> Dedicated support</li>
              <li className="highlight"><MessageCircle size={14} /> Custom strategy building</li>
              <li><CheckCircle size={14} /> Priority bug fixes</li>
              <li><CheckCircle size={14} /> Volume discounts</li>
              <li><CheckCircle size={14} /> Custom integrations</li>
              <li><CheckCircle size={14} /> Early access to features</li>
            </ul>
            <a
              href="#contact"
              className="pricing-btn enterprise"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <MessageCircle size={14} />
              Discuss with Us
            </a>
            <p className="pricing-guarantee">contact@poly-blocks.com</p>
          </div>
        </div>
      </section>

      {/* ── Contact Form ─────────────────────────────────────────────────── */}
      <section className="landing-section" id="contact">
        <div className="landing-section-header">
          <h2>Get in Touch</h2>
          <p>Questions about Enterprise, custom strategies, or just want to chat? We'd love to hear from you.</p>
        </div>

        <div className="contact-form-container">
          {contactSent ? (
            <div className="contact-success">
              <CheckCircle size={32} />
              <h3>Message Sent!</h3>
              <p>We'll get back to you at <strong>{contactEmail}</strong> as soon as possible.</p>
            </div>
          ) : (
            <form
              className="contact-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setContactLoading(true);
                setContactError(null);
                try {
                  const res = await fetch("/api/contact/submit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: contactName,
                      email: contactEmail,
                      message: contactMessage,
                    }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setContactSent(true);
                  } else {
                    setContactError(data.error || "Failed to send message. Please try again.");
                  }
                } catch {
                  setContactError("Network error. Please try again.");
                } finally {
                  setContactLoading(false);
                }
              }}
            >
              <div className="contact-form-row">
                <input
                  type="text"
                  placeholder="Your name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                  className="contact-input"
                />
                <input
                  type="email"
                  placeholder="Your email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                  className="contact-input"
                />
              </div>
              <textarea
                placeholder="Tell us what you need — custom strategies, 24/7 trading, enterprise plan, etc."
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                required
                rows={5}
                className="contact-input contact-textarea"
              />
              {contactError && (
                <div className="contact-error">
                  {contactError}
                </div>
              )}
              <button type="submit" className="contact-submit-btn" disabled={contactLoading}>
                {contactLoading ? (
                  <><Loader2 size={14} className="spin" /> Sending...</>
                ) : (
                  <><Send size={14} /> Send Message</>
                )}
              </button>
              <p className="contact-hint">
                Or email us directly at{" "}
                <a href="mailto:contact@poly-blocks.com">contact@poly-blocks.com</a>
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="landing-cta-banner">
        <div className="cta-banner-content">
          <Workflow size={32} />
          <h2>Ready to automate your Polymarket trading?</h2>
          <p>Join hundreds of traders building smarter strategies with Polyblocks.</p>
          <button className="landing-btn-primary" onClick={handleStart}>
            <Play size={16} />
            Start Building — Free
          </button>
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
        <div className="landing-footer-right">
          <a href="mailto:contact@poly-blocks.com" className="landing-footer-link">
            <Mail size={14} />
            contact@poly-blocks.com
          </a>
          <p>© {new Date().getFullYear()} Polyblocks. No-code trading for Polymarket.</p>
        </div>
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



