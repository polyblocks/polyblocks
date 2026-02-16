/**
 * Auth Zustand store — Google OAuth + email/password login, session, and subscription tier.
 *
 * Tiers:
 *   - "free"  → Can build strategies + paper trade. Cannot live trade.
 *   - "pro"   → Full access including live trading. $7/month.
 */

import { create } from "zustand";

// ── Types ───────────────────────────────────────────────────────────────────

export type UserTier = "free" | "pro";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  tier: UserTier;
  subscribedAt: string | null;
  expiresAt: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;  // session token
  loading: boolean;
  initialized: boolean;

  // Derived helpers
  isLoggedIn: () => boolean;
  isPro: () => boolean;
  canLiveTrade: () => boolean;

  // Actions
  login: () => void;                        // Google OAuth redirect
  loginWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  upgradeToPro: () => void;
  initialize: () => Promise<void>;
}

// ── localStorage keys ───────────────────────────────────────────────────────

const USER_KEY = "polyblocks_user";
const TOKEN_KEY = "polyblocks_token";

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function loadToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function saveAuth(user: User | null, token: string | null) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/** Helper to build headers with session token. */
function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["x-session-token"] = token;
  return h;
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,
  initialized: false,

  isLoggedIn: () => !!get().user,
  isPro: () => {
    const u = get().user;
    if (!u) return false;
    if (u.tier !== "pro") return false;
    if (u.expiresAt && new Date(u.expiresAt) < new Date()) return false;
    return true;
  },
  canLiveTrade: () => get().isPro(),

  // ── Initialize (load from localStorage + verify with server) ────────────
  initialize: async () => {
    const savedUser = loadUser();
    const savedToken = loadToken();

    if (savedUser && savedToken) {
      set({ user: savedUser, token: savedToken, initialized: true });
      // Verify session is still valid
      try {
        const res = await fetch("/api/auth/me", {
          headers: authHeaders(savedToken),
        });
        if (res.ok) {
          const data = await res.json() as { user: User };
          set({ user: data.user });
          saveAuth(data.user, savedToken);
        } else {
          // Session expired
          saveAuth(null, null);
          set({ user: null, token: null });
        }
      } catch {
        // Offline — use cached
      }
    } else {
      set({ initialized: true });
    }
  },

  // ── Google OAuth (redirect-based) ───────────────────────────────────────
  login: () => {
    window.location.href = "/api/auth/google";
  },

  // ── Email / Password Login ──────────────────────────────────────────────
  loginWithEmail: async (email: string, password: string) => {
    set({ loading: true });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { user?: User; token?: string; error?: string };

      if (!res.ok || !data.user || !data.token) {
        set({ loading: false });
        return { error: data.error || "Login failed" };
      }

      saveAuth(data.user, data.token);
      set({ user: data.user, token: data.token, loading: false, initialized: true });
      return {};
    } catch (err) {
      set({ loading: false });
      return { error: "Network error. Please try again." };
    }
  },

  // ── Email / Password Register ───────────────────────────────────────────
  register: async (email: string, password: string, name?: string) => {
    set({ loading: true });
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json() as { user?: User; token?: string; error?: string };

      if (!res.ok || !data.user || !data.token) {
        set({ loading: false });
        return { error: data.error || "Registration failed" };
      }

      saveAuth(data.user, data.token);
      set({ user: data.user, token: data.token, loading: false, initialized: true });
      return {};
    } catch (err) {
      set({ loading: false });
      return { error: "Network error. Please try again." };
    }
  },

  // ── Logout ──────────────────────────────────────────────────────────────
  logout: () => {
    const token = get().token;
    saveAuth(null, null);
    set({ user: null, token: null });
    fetch("/api/auth/logout", {
      method: "POST",
      headers: authHeaders(token),
    }).catch(() => {});
  },

  // ── Refresh user from server ────────────────────────────────────────────
  refreshUser: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const res = await fetch("/api/auth/me", {
        headers: authHeaders(token),
      });
      if (res.ok) {
        const data = await res.json() as { user: User };
        set({ user: data.user });
        saveAuth(data.user, token);
      }
    } catch {
      // offline
    }
  },

  upgradeToPro: () => {
    window.location.href = "/pricing";
  },
}));
