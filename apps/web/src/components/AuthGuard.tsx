/**
 * AuthGuard — wraps protected routes. Redirects to / (landing) if not logged in.
 */

import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export default function AuthGuard() {
  const { user, initialized } = useAuthStore();

  if (!initialized) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" />
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
