import { useState, useEffect, useCallback } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Workflow, BookTemplate, Library, Settings, LogOut, Crown, Users, Mail, MessageCircle, CheckCircle, Zap, X, Briefcase, Radio, Loader2, Square } from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { useCopyTradingStore } from "../stores/copyTradingStore";

interface RunningStrategy {
  strategyId: string;
  strategyName: string;
  mode: "paper" | "live";
}

export default function Layout() {
  const { user, isPro, logout } = useAuthStore();
  const navigate = useNavigate();
  const [showPlans, setShowPlans] = useState(false);
  const copyRunning = useCopyTradingStore((s) => s.running);
  const copyMode = useCopyTradingStore((s) => s.mode);
  const copyTarget = useCopyTradingStore((s) => s.targetAddress);
  const restoreCopyTrading = useCopyTradingStore((s) => s.restoreRunningState);
  const copyStop = useCopyTradingStore((s) => s.stop);
  const [runningStrategies, setRunningStrategies] = useState<RunningStrategy[]>([]);

  // Restore copy trading state on mount (survives page refresh)
  useEffect(() => {
    restoreCopyTrading();
  }, [restoreCopyTrading]);

  const handleStopStrategy = useCallback(async (strategyId: string) => {
    try {
      const token = useAuthStore.getState().token;
      await fetch("/api/execution/schedule/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-session-token": token } : {}),
        },
        body: JSON.stringify({ strategyId }),
      });
      // Immediately refresh the list
      fetchRunning();
    } catch { /* best effort */ }
  }, []);

  const fetchRunning = useCallback(async () => {
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch("/api/execution/schedule/running", {
        headers: token ? { "x-session-token": token } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setRunningStrategies(data.strategies || data.running || []);
      }
    } catch { /* ignore */ }
  }, []);

  // Poll for running strategies
  useEffect(() => {
    let mounted = true;
    fetchRunning();
    const iv = setInterval(() => { if (mounted) fetchRunning(); }, 10_000);
    return () => { mounted = false; clearInterval(iv); };
  }, [fetchRunning]);

  const totalRunning = runningStrategies.length + (copyRunning ? 1 : 0);
  const showGlobalBar = totalRunning > 0;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="app-layout">
      <nav className="app-sidebar-nav">
        <div className="logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round" />
            <polygon points="12,6 18,9.5 18,14.5 12,18 6,14.5 6,9.5" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2" fill="white" />
          </svg>
        </div>
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
          title="Dashboard"
        >
          <LayoutDashboard size={20} />
        </NavLink>
        <NavLink
          to="/editor"
          className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
          title="Strategy Editor"
        >
          <Workflow size={20} />
        </NavLink>
        <NavLink
          to="/library"
          className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
          title="My Strategies"
        >
          <Library size={20} />
        </NavLink>
        <NavLink
          to="/positions"
          className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
          title="Positions & Trades"
        >
          <Briefcase size={20} />
        </NavLink>
        <NavLink
          to="/templates"
          className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
          title="Templates"
        >
          <BookTemplate size={20} />
        </NavLink>
        <NavLink
          to="/copy-trading"
          className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
          title="Copy Trading"
        >
          <Users size={20} />
        </NavLink>

        <div className="nav-spacer" />

        {user && isPro() && (
          <button
            className="nav-btn nav-support"
            title="Contact Support"
            onClick={() => navigate("/landing#contact")}
          >
            <Mail size={16} />
          </button>
        )}
        {user && (
          <div className="nav-plans-wrapper">
            <button
              className={`nav-btn ${isPro() ? "nav-pro-badge" : "nav-upgrade"}`}
              title={isPro() ? "Pro Member — View Plans" : "View Plans"}
              onClick={() => setShowPlans(!showPlans)}
            >
              <Crown size={18} />
            </button>

            {showPlans && (
              <>
                <div className="nav-plans-overlay" onClick={() => setShowPlans(false)} />
                <div className="nav-plans-popup">
                  <div className="nav-plans-header">
                    <span>Plans</span>
                    <button className="nav-plans-close" onClick={() => setShowPlans(false)}>
                      <X size={14} />
                    </button>
                  </div>

                  <div className={`nav-plan-item ${!isPro() ? "current" : ""}`}>
                    <div className="nav-plan-name">
                      <CheckCircle size={13} />
                      Free
                    </div>
                    <div className="nav-plan-desc">Paper trading, all blocks, AI builder</div>
                    {!isPro() && <span className="nav-plan-badge">Current</span>}
                  </div>

                  <div className={`nav-plan-item pro ${isPro() ? "current" : ""}`}>
                    <div className="nav-plan-name">
                      <Zap size={13} />
                      Pro — <span className="pb-price-old">$20</span> <span className="pb-price-new">$10</span>/mo
                    </div>
                    <div className="nav-plan-desc">Live trading, copy trading, priority support</div>
                    {isPro() ? (
                      <span className="nav-plan-badge pro">Active</span>
                    ) : (
                      <button className="nav-plan-upgrade-btn" onClick={() => { setShowPlans(false); navigate("/pricing"); }}>
                        Upgrade
                      </button>
                    )}
                  </div>

                  <div className="nav-plan-item enterprise">
                    <div className="nav-plan-name">
                      <MessageCircle size={13} />
                      Enterprise
                    </div>
                    <div className="nav-plan-desc">24/7 trading, custom strategies, dedicated support</div>
                    <button className="nav-plan-discuss-btn" onClick={() => { setShowPlans(false); navigate("/landing#contact"); }}>
                      Discuss
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
          title="Settings"
        >
          <Settings size={20} />
        </NavLink>

        {/* User avatar & logout */}
        {user && (
          <>
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="nav-avatar"
                title={`${user.name} (${user.tier})`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="nav-avatar-placeholder" title={user.name}>
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <button className="nav-btn nav-logout" onClick={handleLogout} title="Log out">
              <LogOut size={18} />
            </button>
          </>
        )}
      </nav>
      <main className="app-main">
        {showGlobalBar && (
          <div className="global-running-bar">
            <div className="global-running-dot" />
            <Loader2 size={12} className="spin" />
            <span className="global-running-label">
              {runningStrategies.map((rs) => (
                <span key={rs.strategyId} className="global-running-item">
                  <Radio size={10} />
                  {rs.strategyName || rs.strategyId.slice(0, 8)}
                  <span className={`global-running-mode ${rs.mode}`}>
                    {rs.mode === "live" ? "LIVE" : "PAPER"}
                  </span>
                  <button
                    className="global-running-stop"
                    onClick={() => handleStopStrategy(rs.strategyId)}
                    title={`Stop ${rs.strategyName || "strategy"}`}
                  >
                    <Square size={8} />
                  </button>
                </span>
              ))}
              {copyRunning && (
                <span className="global-running-item">
                  <Users size={10} />
                  Copy Trading
                  <span style={{ fontFamily: "monospace", fontSize: 10, opacity: 0.7 }}>
                    {copyTarget.slice(0, 6)}…
                  </span>
                  <span className={`global-running-mode ${copyMode}`}>
                    {copyMode === "live" ? "LIVE" : "PAPER"}
                  </span>
                  <button
                    className="global-running-stop"
                    onClick={() => copyStop()}
                    title="Stop copy trading"
                  >
                    <Square size={8} />
                  </button>
                </span>
              )}
            </span>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
