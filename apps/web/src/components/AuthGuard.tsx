/**
 * AuthGuard — wraps protected routes. Redirects to / (landing) if not logged in.
 */

import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import OnboardingTutorial from "./OnboardingTutorial";
import VerificationOverlay from "./VerificationOverlay";

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

  // Prevent accessing protected pages (like /dashboard) if not verified,
  // but let them see the actual layout so they can log out if they want
  const showVerification = user.verified === false;

  return (
    <>
      <OnboardingTutorial />
      {showVerification && <VerificationOverlay />}
      <Outlet />
    </>
  );
}
