/**
 * PricingPage — crypto payment page with MetaMask + manual payment for Pro subscription.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import {
  Crown,
  CheckCircle,
  Copy,
  ArrowLeft,
  Loader2,
  Wallet,
  ExternalLink,
  Users,
  Zap,
  BadgeCheck,
  Shield,
  Mail,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────
const PAYMENT_WALLET = "0x06f344E8805Ce78e62699b46e3d8BC78a6c1a35f";
const PAYMENT_AMOUNT = "7"; // $7 USDC
const CHAIN = "Polygon";
const CHAIN_ID_HEX = "0x89"; // 137 in hex (Polygon mainnet)
const CHAIN_ID_DEC = 137;
// USDC on Polygon
const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // native USDC on Polygon
const USDC_DECIMALS = 6;

// ERC-20 transfer function selector: transfer(address,uint256)
const ERC20_TRANSFER_SIG = "0xa9059cbb";

// ── EIP-6963 + EIP-1193 interfaces ──────────────────────────────────────────

interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
}

interface EIP6963ProviderInfo {
  rdns: string;
  uuid: string;
  name: string;
  icon: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

interface EIP6963AnnounceProviderEvent extends Event {
  detail: EIP6963ProviderDetail;
}

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": EIP6963AnnounceProviderEvent;
  }
  interface Window {
    ethereum?: EIP1193Provider & { isMetaMask?: boolean };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pad a hex number to 64 hex chars (32 bytes). */
function padHex64(hex: string): string {
  return hex.replace(/^0x/, "").padStart(64, "0");
}

/** Encode an ERC-20 transfer(address, uint256) call. */
function encodeTransfer(to: string, amountRaw: bigint): string {
  const addrPadded = padHex64(to);
  const amtPadded = padHex64(amountRaw.toString(16));
  return `${ERC20_TRANSFER_SIG}${addrPadded}${amtPadded}`;
}

/** Switch wallet to Polygon or add it. */
async function ensurePolygonNetwork(provider: EIP1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (err: unknown) {
    const switchErr = err as { code?: number };
    // 4902 = chain not added
    if (switchErr.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: "Polygon Mainnet",
            nativeCurrency: { name: "MATIC", symbol: "POL", decimals: 18 },
            rpcUrls: ["https://polygon-rpc.com"],
            blockExplorerUrls: ["https://polygonscan.com"],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const navigate = useNavigate();
  const { user, isPro, refreshUser } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // MetaMask state
  const [mmBusy, setMmBusy] = useState(false);
  const [mmStatus, setMmStatus] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"metamask" | "manual">(
    "metamask",
  );

  // ── EIP-6963 wallet detection ───────────────────────────────────────────
  const [walletProviders, setWalletProviders] = useState<EIP6963ProviderDetail[]>([]);
  const providersRef = useRef<EIP6963ProviderDetail[]>([]);

  useEffect(() => {
    const onAnnounce = (event: EIP6963AnnounceProviderEvent) => {
      const detail = event.detail;
      // Deduplicate by uuid
      if (providersRef.current.some((p) => p.info.uuid === detail.info.uuid)) return;
      providersRef.current = [...providersRef.current, detail];
      setWalletProviders([...providersRef.current]);
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    // Request providers from installed extensions
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    };
  }, []);

  // Find MetaMask specifically, or fall back to any provider, or window.ethereum
  const getProvider = useCallback((): EIP1193Provider | null => {
    // Prefer MetaMask from EIP-6963 announced providers
    const mm = walletProviders.find(
      (p) => p.info.rdns === "io.metamask" || p.info.name.toLowerCase().includes("metamask"),
    );
    if (mm) return mm.provider;
    // Fall back to first EIP-6963 provider
    if (walletProviders.length > 0) return walletProviders[0].provider;
    // Fall back to legacy window.ethereum
    if (window.ethereum) return window.ethereum;
    return null;
  }, [walletProviders]);

  const hasWallet = walletProviders.length > 0 || !!window.ethereum;

  // QR code for manual payment
  const qrData = `ethereum:${PAYMENT_WALLET}@${CHAIN_ID_DEC}?value=0&uint256=${PAYMENT_AMOUNT}e6`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}&bgcolor=1a1a2e&color=e2e8f0`;

  const handleCopy = () => {
    navigator.clipboard.writeText(PAYMENT_WALLET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── MetaMask payment ────────────────────────────────────────────────────
  const handleMetaMaskPay = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setMmStatus("No wallet detected. Please install MetaMask.");
      return;
    }
    if (!user?.id) {
      setMmStatus("Please log in before making a payment.");
      return;
    }
    setMmBusy(true);
    setMmStatus(null);
    setSubmitResult(null);

    try {
      // 1. Connect wallet
      setMmStatus("Connecting wallet…");
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const sender = accounts[0];
      if (!sender) throw new Error("No account selected");

      // 2. Ensure Polygon network
      setMmStatus("Switching to Polygon…");
      await ensurePolygonNetwork(provider);

      // 3. Build ERC-20 transfer
      const amountRaw = BigInt(PAYMENT_AMOUNT) * 10n ** BigInt(USDC_DECIMALS); // 7 * 1e6
      const data = encodeTransfer(PAYMENT_WALLET, amountRaw);

      setMmStatus("Confirm the transaction in MetaMask…");

      // 4. Send tx
      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: sender,
            to: USDC_CONTRACT,
            data,
            value: "0x0", // no native value
          },
        ],
      })) as string;

      setTxHash(hash);
      setMmStatus("Transaction sent! Verifying…");

      // 5. Auto-verify on backend
      try {
        const res = await fetch("/api/auth/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            txHash: hash,
            walletAddress: sender,
          }),
        });
        const result = (await res.json()) as { ok: boolean; message: string };
        setSubmitResult(result);

        if (result.ok) {
          setMmStatus("Payment verified ✓");
          await refreshUser();
          setTimeout(() => navigate("/dashboard"), 2000);
        } else {
          setMmStatus(null);
        }
      } catch {
        // Backend verification failed but tx was sent — user can verify manually
        setMmStatus("Transaction sent but auto-verify failed. Use Manual Transfer tab to verify with your tx hash.");
      }
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string };
      if (e.code === 4001) {
        setMmStatus("Transaction rejected by user.");
      } else {
        setMmStatus(e.message || "Something went wrong.");
      }
    } finally {
      setMmBusy(false);
    }
  }, [user, refreshUser, navigate, getProvider]);

  // ── Manual tx hash verify ───────────────────────────────────────────────
  const handleSubmitPayment = async () => {
    if (!txHash.trim()) return;
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await fetch("/api/auth/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id, txHash: txHash.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setSubmitResult(data);

      if (data.ok) {
        await refreshUser();
        setTimeout(() => navigate("/dashboard"), 2000);
      }
    } catch {
      setSubmitResult({
        ok: false,
        message: "Network error. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Already Pro ─────────────────────────────────────────────────────────
  if (isPro()) {
    return (
      <div className="pricing-page">
        <div className="pricing-page-card">
          <div className="pricing-page-success">
            <Crown size={32} />
            <h2>You're a Pro!</h2>
            <p>
              Your Pro subscription is active. You have full access to live
              trading.
            </p>
            {user?.expiresAt && (
              <p className="pricing-expires">
                Expires: {new Date(user.expiresAt).toLocaleDateString()}
              </p>
            )}
            <button
              className="pricing-back-btn"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft size={14} />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main pricing UI ────────────────────────────────────────────────────
  return (
    <div className="pricing-page">
      <button className="pricing-back-link" onClick={() => navigate("/dashboard")}>
        <ArrowLeft size={14} />
        Back to Dashboard
      </button>

      <div className="pricing-page-card">
        <div className="pricing-page-header">
          <Crown size={24} />
          <h2>Upgrade to Pro</h2>
          <p>$7/month — Pay with USDC on Polygon</p>
        </div>

        <div className="pricing-page-body">
          {/* What you get */}
          <div className="pricing-perks">
            <h3>What's included in Pro:</h3>
            <ul>
              <li>
                <Zap size={14} /> Live trading with real orders
              </li>
              <li>
                <Users size={14} /> Copy Trading dashboard
              </li>
              <li>
                <BadgeCheck size={14} /> User Activity block (whale tracking)
              </li>
              <li>
                <CheckCircle size={14} /> CLOB API order execution
              </li>
              <li>
                <Shield size={14} /> Duplicate trade prevention
              </li>
              <li>
                <CheckCircle size={14} /> Wallet credential management
              </li>
              <li>
                <CheckCircle size={14} /> Priority support
              </li>
            </ul>
          </div>

          {/* ─── Payment method tabs ────────────────────────────────── */}
          <div className="pricing-method-tabs">
            <button
              className={`pricing-method-tab ${paymentMethod === "metamask" ? "active" : ""}`}
              onClick={() => setPaymentMethod("metamask")}
            >
              <Wallet size={14} />
              Pay with MetaMask
            </button>
            <button
              className={`pricing-method-tab ${paymentMethod === "manual" ? "active" : ""}`}
              onClick={() => setPaymentMethod("manual")}
            >
              <Copy size={14} />
              Manual Transfer
            </button>
          </div>

          {/* ─── MetaMask payment ───────────────────────────────────── */}
          {paymentMethod === "metamask" && (
            <div className="pricing-payment pricing-metamask-section">
              <div className="pricing-metamask-header">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
                  alt="MetaMask"
                  width={40}
                  height={40}
                />
                <div>
                  <h3>Pay with MetaMask</h3>
                  <p className="pricing-payment-note">
                    Send <strong>{PAYMENT_AMOUNT} USDC</strong> on{" "}
                    <strong>{CHAIN}</strong> directly from your wallet.
                    One-click checkout — we'll handle the rest.
                  </p>
                </div>
              </div>

              <div className="pricing-metamask-details">
                <div className="pricing-detail-row">
                  <span>Amount</span>
                  <span className="pricing-detail-value">
                    {PAYMENT_AMOUNT} USDC
                  </span>
                </div>
                <div className="pricing-detail-row">
                  <span>Network</span>
                  <span className="pricing-detail-value">{CHAIN}</span>
                </div>
                <div className="pricing-detail-row">
                  <span>To</span>
                  <span className="pricing-detail-value pricing-detail-addr">
                    {PAYMENT_WALLET.slice(0, 6)}…{PAYMENT_WALLET.slice(-4)}
                  </span>
                </div>
              </div>

              {hasWallet ? (
                <button
                  className="pricing-metamask-btn"
                  onClick={handleMetaMaskPay}
                  disabled={mmBusy}
                >
                  {mmBusy ? (
                    <Loader2 size={18} className="spin" />
                  ) : (
                    <img
                      src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
                      alt=""
                      width={18}
                      height={18}
                    />
                  )}
                  {mmBusy ? "Processing…" : "Pay with MetaMask"}
                </button>
              ) : (
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pricing-metamask-btn pricing-metamask-install"
                >
                  <ExternalLink size={16} />
                  Install MetaMask
                </a>
              )}

              {mmStatus && (
                <div className="pricing-mm-status">{mmStatus}</div>
              )}

              {txHash && (
                <div className="pricing-tx-sent">
                  <span>Tx:</span>
                  <a
                    href={`https://polygonscan.com/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {txHash.slice(0, 10)}…{txHash.slice(-8)}
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}

              {submitResult && (
                <div
                  className={`pricing-result ${submitResult.ok ? "success" : "error"}`}
                >
                  {submitResult.message}
                </div>
              )}
            </div>
          )}

          {/* ─── Manual transfer ────────────────────────────────────── */}
          {paymentMethod === "manual" && (
            <div className="pricing-payment">
              <h3>
                Send {PAYMENT_AMOUNT} USDC on {CHAIN}
              </h3>
              <p className="pricing-payment-note">
                Send exactly <strong>{PAYMENT_AMOUNT} USDC</strong> on the{" "}
                <strong>{CHAIN}</strong> network to the address below. Your
                Pro access will be activated after verification.
              </p>

              {/* QR Code */}
              <div className="pricing-qr">
                <img
                  src={qrUrl}
                  alt="Payment QR Code"
                  width={200}
                  height={200}
                />
              </div>

              {/* Wallet address */}
              <div className="pricing-address">
                <code>{PAYMENT_WALLET}</code>
                <button onClick={handleCopy} title="Copy address">
                  {copied ? (
                    <CheckCircle size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>

              {/* TX hash submission */}
              <div className="pricing-verify">
                <h4>Verify your payment</h4>
                <p>After sending, paste your transaction hash below:</p>
                <div className="pricing-tx-input">
                  <input
                    type="text"
                    placeholder="0x..."
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                  />
                  <button
                    onClick={handleSubmitPayment}
                    disabled={submitting || !txHash.trim()}
                  >
                    {submitting ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <CheckCircle size={14} />
                    )}
                    {submitting ? "Verifying…" : "Verify"}
                  </button>
                </div>

                {submitResult && (
                  <div
                    className={`pricing-result ${submitResult.ok ? "success" : "error"}`}
                  >
                    {submitResult.message}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Support contact ────────────────────────────────────── */}
          <div className="pricing-support-contact">
            <Mail size={16} />
            <div>
              <p>Need help or have a custom request?</p>
              <a href="mailto:contact@poly-blocks.com">contact@poly-blocks.com</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
