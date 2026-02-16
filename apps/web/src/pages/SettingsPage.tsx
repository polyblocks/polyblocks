/**
 * SettingsPage — configure Polymarket trading credentials and wallet settings.
 */

import { useState, useEffect } from "react";
import { Button, Input, Select } from "@polyblocks/ui";
import { useAuthStore } from "../stores/authStore";
import {
  Shield,
  Key,
  Wallet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  RefreshCw,
  User as UserIcon,
  Crown,
  Mail,
  Calendar,
  LogOut,
} from "lucide-react";

interface CredentialStatus {
  isConfigured: boolean;
  signatureType: number;
  funderAddress: string;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
}

const SIGNATURE_TYPES = [
  {
    value: 0,
    label: "EOA Wallet",
    description: "Direct wallet — holds USDCe and position tokens, pays own gas",
  },
  {
    value: 1,
    label: "Polymarket Proxy (Magic Link / Email)",
    description: "Trade through your Polymarket.com account (Magic Link or Google login)",
  },
  {
    value: 2,
    label: "Polymarket Proxy (Browser Wallet)",
    description: "Trade through your Polymarket.com account (browser wallet connection)",
  },
];

export default function SettingsPage() {
  const { user, isPro, logout, refreshUser } = useAuthStore();

  // Form state
  const [privateKey, setPrivateKey] = useState("");
  const [signatureType, setSignatureType] = useState(0);
  const [funderAddress, setFunderAddress] = useState("");

  // UI state
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load current status on mount
  useEffect(() => {
    fetchStatus();
    refreshUser(); // sync latest user data (tier, etc.)
  }, []);

  async function fetchStatus() {
    try {
      setLoading(true);
      const res = await fetch("/api/credentials/status");
      const data = await res.json() as CredentialStatus;
      setStatus(data);
      setSignatureType(data.signatureType);
      if (data.funderAddress) setFunderAddress(data.funderAddress);
    } catch {
      // API not reachable
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!privateKey.trim()) {
      setMessage({ type: "error", text: "Private key is required" });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/credentials/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privateKey: privateKey.trim(),
          signatureType,
          funderAddress: funderAddress.trim() || undefined,
        }),
      });

      const data = await res.json() as {
        success: boolean;
        error?: string;
        walletAddress?: string;
        apiKeyPreview?: string;
      };

      if (data.success) {
        setMessage({
          type: "success",
          text: `Credentials saved! Wallet: ${data.walletAddress}`,
        });
        setPrivateKey(""); // Clear from UI for security
        await fetchStatus();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save credentials" });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/credentials/test", { method: "POST" });
      const data = await res.json() as { success: boolean; error?: string; message?: string };

      if (data.success) {
        setMessage({ type: "success", text: data.message || "Connection successful!" });
      } else {
        setMessage({ type: "error", text: data.error || "Connection failed" });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleClear() {
    if (!confirm("Are you sure you want to clear all credentials?")) return;

    try {
      await fetch("/api/credentials/clear", { method: "DELETE" });
      setMessage({ type: "success", text: "Credentials cleared" });
      setPrivateKey("");
      setFunderAddress("");
      await fetchStatus();
    } catch {
      setMessage({ type: "error", text: "Failed to clear credentials" });
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <h1>Settings</h1>
        <p>Configure your Polymarket trading credentials for live execution.</p>
      </div>

      <div className="settings-content">
        {/* Account Card */}
        {user && (
          <div className="settings-card">
            <div className="settings-card-header">
              <UserIcon size={18} />
              <h2>Account</h2>
            </div>
            <div className="settings-card-body">
              <div className="account-profile">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="account-avatar"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="account-avatar-placeholder">
                    {user.name?.charAt(0).toUpperCase() || "?"}
                  </div>
                )}
                <div className="account-info">
                  <h3 className="account-name">{user.name || "Unnamed"}</h3>
                  <div className="account-detail">
                    <Mail size={13} />
                    <span>{user.email}</span>
                  </div>
                  <div className="account-detail">
                    <Crown size={13} className={isPro() ? "pro-icon" : ""} />
                    <span className={isPro() ? "pro-text" : ""}>
                      {isPro() ? "Pro Member" : "Free Tier"}
                    </span>
                    {isPro() && user.expiresAt && (
                      <span className="account-expires">
                        <Calendar size={11} />
                        Expires {new Date(user.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="account-actions">
                {!isPro() && (
                  <Button size="sm" variant="primary" onClick={() => window.location.href = "/pricing"}>
                    <Crown size={14} />
                    Upgrade to Pro
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => { logout(); window.location.href = "/landing"; }}>
                  <LogOut size={14} />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Connection Status Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <Shield size={18} />
            <h2>Connection Status</h2>
          </div>
          <div className="settings-card-body">
            {loading ? (
              <div className="settings-status-row">
                <Loader2 size={16} className="spin" />
                <span>Checking status…</span>
              </div>
            ) : status?.isConfigured ? (
              <>
                <div className="settings-status-row success">
                  <CheckCircle size={16} />
                  <span>Credentials configured</span>
                </div>
                <div className="settings-detail-grid">
                  <div className="settings-detail">
                    <span className="settings-detail-label">API Key</span>
                    <span className="settings-detail-value mono">{status.apiKeyPreview}</span>
                  </div>
                  <div className="settings-detail">
                    <span className="settings-detail-label">Signature Type</span>
                    <span className="settings-detail-value">
                      {SIGNATURE_TYPES.find((s) => s.value === status.signatureType)?.label || "Unknown"}
                    </span>
                  </div>
                  <div className="settings-detail">
                    <span className="settings-detail-label">Funder Address</span>
                    <span className="settings-detail-value mono">
                      {status.funderAddress
                        ? `${status.funderAddress.slice(0, 8)}…${status.funderAddress.slice(-6)}`
                        : "—"}
                    </span>
                  </div>
                </div>
                <div className="settings-actions-row">
                  <Button size="sm" onClick={handleTest} disabled={testing}>
                    {testing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                    {testing ? "Testing…" : "Test Connection"}
                  </Button>
                  <Button size="sm" variant="danger" onClick={handleClear}>
                    <Trash2 size={14} />
                    Clear Credentials
                  </Button>
                </div>
              </>
            ) : (
              <div className="settings-status-row warning">
                <AlertTriangle size={16} />
                <span>No credentials configured — live trading is disabled</span>
              </div>
            )}
          </div>
        </div>

        {/* Credential Input Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <Key size={18} />
            <h2>{status?.isConfigured ? "Update Credentials" : "Set Up Credentials"}</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-form">
              <div className="property-group">
                <label>
                  <Wallet size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                  Private Key
                </label>
                <Input
                  type="password"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                  autoComplete="off"
                />
                <span className="settings-hint">
                  Your private key is used to derive API credentials and sign orders.
                  It is stored server-side in memory only and never persisted to disk.
                </span>
              </div>

              <div className="property-group">
                <label>Signature Type</label>
                <Select
                  value={String(signatureType)}
                  onChange={(e) => setSignatureType(Number(e.target.value))}
                >
                  {SIGNATURE_TYPES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </Select>
                <span className="settings-hint">
                  {SIGNATURE_TYPES.find((s) => s.value === signatureType)?.description}
                </span>
              </div>

              <div className="property-group">
                <label>
                  Funder Address
                  <span style={{ color: "var(--pb-text-muted)", fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                    (optional for EOA)
                  </span>
                </label>
                <Input
                  value={funderAddress}
                  onChange={(e) => setFunderAddress(e.target.value)}
                  placeholder={signatureType === 0 ? "Uses your wallet address" : "Your Polymarket proxy wallet address"}
                  spellCheck={false}
                />
                <span className="settings-hint">
                  {signatureType === 0
                    ? "For EOA wallets, this defaults to your wallet address. Leave empty."
                    : "Required for proxy wallets. Find this in your Polymarket account settings."}
                </span>
              </div>

              <div className="settings-actions-row" style={{ marginTop: 8 }}>
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !privateKey.trim()}>
                  {saving ? <Loader2 size={14} className="spin" /> : <Key size={14} />}
                  {saving ? "Deriving API keys…" : "Save & Derive API Keys"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`settings-message ${message.type}`}>
            {message.type === "success" ? <CheckCircle size={16} /> : <XCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Security Notice */}
        <div className="settings-card">
          <div className="settings-card-header">
            <AlertTriangle size={18} style={{ color: "var(--pb-trigger)" }} />
            <h2>Security Notice</h2>
          </div>
          <div className="settings-card-body">
            <ul className="settings-security-list">
              <li>Your private key is stored <strong>in-memory only</strong> on the local API server</li>
              <li>Credentials are <strong>lost when the server restarts</strong> — you'll need to re-enter them</li>
              <li>Never share your private key or API credentials with anyone</li>
              <li>Use a dedicated trading wallet with limited funds for safety</li>
              <li>Always test strategies in <strong>Paper Mode</strong> before enabling Live trading</li>
              <li>Live mode executes <strong>real orders with real money</strong> on Polygon mainnet</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
