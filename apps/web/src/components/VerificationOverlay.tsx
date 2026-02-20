import { useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { Loader2, Mail, CheckCircle, AlertTriangle } from "lucide-react";
import { Button, Input } from "@polyblocks/ui";

export default function VerificationOverlay() {
  const { user, refreshUser, token } = useAuthStore();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  if (!user || user.verified) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    
    setLoading(true);
    setError("");
    setMsg("");
    
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": token || "",
        },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Verification failed");
      }
      
      setMsg("Successfully verified!");
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError("");
    setMsg("");
    
    try {
      const res = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: {
          "x-session-token": token || "",
        },
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to resend code");
      }
      
      setMsg("A new code has been sent to your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setResending(false);
    }
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      backdropFilter: "blur(8px)",
      zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        backgroundColor: "var(--pb-panel-bg)",
        border: "1px solid var(--pb-border)",
        borderRadius: 16, padding: 32, width: 400, maxWidth: "90%",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
        textAlign: "center"
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          backgroundColor: "rgba(139, 92, 246, 0.1)",
          color: "var(--pb-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px"
        }}>
          <Mail size={28} />
        </div>
        
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 12px", color: "var(--pb-text-primary)" }}>
          Check your email
        </h2>
        
        <p style={{ fontSize: 14, color: "var(--pb-text-muted)", margin: "0 0 24px", lineHeight: 1.5 }}>
          We sent a 6-digit verification code to<br />
          <strong style={{ color: "var(--pb-text-primary)" }}>{user.email}</strong>
        </p>

        {error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "12px", borderRadius: 8,
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "var(--pb-risk)",
            fontSize: 13, marginBottom: 20, textAlign: "left"
          }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {msg && !error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "12px", borderRadius: 8,
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            color: "var(--pb-success)",
            fontSize: 13, marginBottom: 20, textAlign: "left"
          }}>
            <CheckCircle size={16} />
            {msg}
          </div>
        )}

        <form onSubmit={handleVerify} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            type="text"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{
              textAlign: "center", fontSize: 24, letterSpacing: 8, padding: "16px",
              fontWeight: "bold"
            }}
            autoFocus
          />
          
          <Button type="submit" variant="primary" size="default" disabled={loading || code.length < 6}>
            {loading ? <Loader2 size={18} className="spin" /> : "Verify Email"}
          </Button>
        </form>

        <div style={{ marginTop: 24, fontSize: 13, color: "var(--pb-text-muted)" }}>
          Didn't receive the code?{" "}
          <button 
            onClick={handleResend}
            disabled={resending}
            style={{
              background: "none", border: "none", color: "var(--pb-accent)",
              cursor: "pointer", padding: 0, fontWeight: 600,
              textDecoration: "underline",
              opacity: resending ? 0.5 : 1
            }}
          >
            {resending ? "Sending..." : "Resend"}
          </button>
        </div>
      </div>
    </div>
  );
}