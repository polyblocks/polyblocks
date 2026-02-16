import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Workflow, BookTemplate, Library, Settings, LogOut, Crown, Users } from "lucide-react";
import { useAuthStore } from "../stores/authStore";

export default function Layout() {
  const { user, isPro, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/landing");
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
          to="/"
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
          to="/templates"
          className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
          title="Templates"
        >
          <BookTemplate size={20} />
        </NavLink>
        <NavLink
          to="/backtesting"
          className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
          title="Copy Trading"
        >
          <Users size={20} />
        </NavLink>
        <div className="nav-spacer" />

        {/* Tier badge */}
        {user && !isPro() && (
          <NavLink
            to="/pricing"
            className="nav-btn nav-upgrade"
            title="Upgrade to Pro"
          >
            <Crown size={18} />
          </NavLink>
        )}
        {user && isPro() && (
          <div className="nav-btn nav-pro-badge" title="Pro Member">
            <Crown size={18} />
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
        <Outlet />
      </main>
    </div>
  );
}
