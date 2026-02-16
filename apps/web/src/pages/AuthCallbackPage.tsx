/**
 * AuthCallbackPage — handles the redirect from Google OAuth.
 * Reads the token from URL params, sends to backend, and redirects to dashboard.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore, type User } from "../stores/authStore";

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get("token");
      const err = searchParams.get("error");

      if (err) {
        setError(err);
        setTimeout(() => navigate("/landing"), 3000);
        return;
      }

      if (!token) {
        setError("No authentication token received.");
        setTimeout(() => navigate("/landing"), 3000);
        return;
      }

      try {
        // Exchange token for user session
        const res = await fetch("/api/auth/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          throw new Error("Authentication failed");
        }

        const data = await res.json() as { user: User; token: string };

        // Save to store (both user and session token)
        localStorage.setItem("polyblocks_user", JSON.stringify(data.user));
        localStorage.setItem("polyblocks_token", data.token || token);
        useAuthStore.setState({ user: data.user, token: data.token || token, initialized: true });

        navigate("/");
      } catch (err) {
        setError("Authentication failed. Please try again.");
        setTimeout(() => navigate("/landing"), 3000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="auth-loading">
      {error ? (
        <>
          <p style={{ color: "var(--pb-risk)" }}>{error}</p>
          <p>Redirecting...</p>
        </>
      ) : (
        <>
          <div className="auth-spinner" />
          <p>Signing you in…</p>
        </>
      )}
    </div>
  );
}
