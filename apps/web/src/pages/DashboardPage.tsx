/**
 * DashboardPage — landing page with quick actions.
 */

import { useNavigate } from "react-router-dom";
import { useEditorStore } from "../stores/editorStore";
import { useAuthStore } from "../stores/authStore";
import { Plus, Workflow, BookTemplate, Library, Mail, Briefcase, BarChart3, Users } from "lucide-react";

export default function DashboardPage() {
  const navigate = useNavigate();
  const newStrategy = useEditorStore((s) => s.newStrategy);
  const { isPro } = useAuthStore();

  const handleNewStrategy = () => {
    newStrategy();
    navigate("/editor");
  };

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <h1>Polyblocks</h1>
        <p>No-code visual strategy builder for Polymarket.<br/>
        Drag blocks, connect them, and paper-trade in minutes.</p>
      </div>

      <div className="dashboard-actions">
        <div className="strategy-card" onClick={handleNewStrategy}>
          <div className="action-icon" style={{ background: "var(--pb-accent-muted)", color: "var(--pb-accent)" }}>
            <Plus size={24} />
          </div>
          <div className="action-label">New Strategy</div>
          <div className="action-desc">Start from a blank canvas</div>
        </div>

        <div className="strategy-card" onClick={() => navigate("/templates")}>
          <div className="action-icon" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--pb-logic)" }}>
            <BookTemplate size={24} />
          </div>
          <div className="action-label">Use a Template</div>
          <div className="action-desc">Start with a pre-built strategy</div>
        </div>

        <div className="strategy-card" onClick={() => navigate("/editor")}>
          <div className="action-icon" style={{ background: "rgba(139, 92, 246, 0.15)", color: "var(--pb-market)" }}>
            <Workflow size={24} />
          </div>
          <div className="action-label">Open Editor</div>
          <div className="action-desc">Continue where you left off</div>
        </div>

        <div className="strategy-card" onClick={() => navigate("/library")}>
          <div className="action-icon" style={{ background: "rgba(99, 102, 241, 0.15)", color: "var(--pb-accent)" }}>
            <Library size={24} />
          </div>
          <div className="action-label">My Strategies</div>
          <div className="action-desc">View your saved strategies</div>
        </div>

        <div className="strategy-card" onClick={() => navigate("/positions")}>
          <div className="action-icon" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--pb-trigger)" }}>
            <Briefcase size={24} />
          </div>
          <div className="action-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Positions</span>
            <span className="pb-badge pb-badge-action">Beta</span>
          </div>
          <div className="action-desc">Live and paper positions with PnL timeline</div>
        </div>

        <div className="strategy-card" onClick={() => navigate("/copy-trading")}>
          <div className="action-icon" style={{ background: "rgba(139, 92, 246, 0.15)", color: "var(--pb-market)" }}>
            <Users size={24} />
          </div>
          <div className="action-label">Copy Trading</div>
          <div className="action-desc">Mirror trades from top Polymarket wallets</div>
        </div>
      </div>

      {isPro() && (
        <div className="pro-support-hint">
          <Mail size={14} />
          <span>Need help? <a href="/landing#contact" onClick={(e) => { e.preventDefault(); navigate("/landing#contact"); }}>Contact support</a></span>
        </div>
      )}
    </div>
  );
}
