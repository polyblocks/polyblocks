/**
 * Copy Trading Zustand store — persistent state that survives page navigation.
 * The polling interval runs outside React component lifecycle.
 * Running state is persisted to localStorage so refresh shows accurate status.
 */

import { create } from "zustand";

export type TradingMode = "paper" | "live";

export interface CopyTrade {
  id: string;
  time: string;
  side: string;
  outcome: string;
  title: string;
  size: number;
  price: number;
  status: "copied" | "skipped" | "error";
  reason?: string;
  mode: TradingMode;
}

interface CopyTradingState {
  // Config
  targetAddress: string;
  intervalSec: number;
  maxSize: number;
  sizePercent: number;
  mode: TradingMode;

  // Runtime
  running: boolean;
  status: string | null;
  trades: CopyTrade[];
  startedAt: string | null;

  // Actions
  setTargetAddress: (addr: string) => void;
  setIntervalSec: (sec: number) => void;
  setMaxSize: (max: number) => void;
  setSizePercent: (pct: number) => void;
  setMode: (mode: TradingMode) => void;
  start: () => void;
  stop: () => void;
  clearTrades: () => void;
  /** Restore running state on app init (after page refresh) */
  restoreRunningState: () => void;
}

// ─── Persistent state helpers ───────────────────────────────────────────────

const COPY_STATE_KEY = "polyblocks_copy_trading_state";
const COPY_TRADES_KEY = "polyblocks_copy_trading_trades";

interface PersistedCopyState {
  running: boolean;
  targetAddress: string;
  intervalSec: number;
  maxSize: number;
  sizePercent: number;
  mode: TradingMode;
  startedAt: string | null;
}

function loadPersistedState(): PersistedCopyState | null {
  try {
    const raw = localStorage.getItem(COPY_STATE_KEY);
    return raw ? JSON.parse(raw) as PersistedCopyState : null;
  } catch { return null; }
}

function savePersistedState(state: PersistedCopyState) {
  try { localStorage.setItem(COPY_STATE_KEY, JSON.stringify(state)); } catch { /* quota */ }
}

function clearPersistedState() {
  try { localStorage.removeItem(COPY_STATE_KEY); } catch { /* */ }
}

function loadPersistedTrades(): CopyTrade[] {
  try {
    const raw = localStorage.getItem(COPY_TRADES_KEY);
    return raw ? JSON.parse(raw) as CopyTrade[] : [];
  } catch { return []; }
}

function savePersistedTrades(trades: CopyTrade[]) {
  try { localStorage.setItem(COPY_TRADES_KEY, JSON.stringify(trades.slice(0, 50))); } catch { /* quota */ }
}

// Module-level timer so it survives component unmount
let copyTimer: ReturnType<typeof setInterval> | null = null;
let seenHashes = new Set<string>();
let isFirstFetch = true;

async function fetchAndCopy(get: () => CopyTradingState, set: (partial: Partial<CopyTradingState>) => void) {
  const { targetAddress, maxSize, sizePercent, mode } = get();
  if (!targetAddress.trim()) return;

  try {
    const url = `https://data-api.polymarket.com/activity?user=${encodeURIComponent(targetAddress.trim())}&limit=1&sortBy=TIMESTAMP&sortDirection=DESC`;
    const res = await fetch(url);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      set({ status: "No activity found for this address" });
      return;
    }

    const trade = data[0];
    const txHash = trade.transactionHash || `${trade.timestamp}_${trade.conditionId}`;
    const side = String(trade.side || "");
    const outcome = String(trade.outcome || "");
    const title = String(trade.title || "Unknown");
    const size = parseFloat(String(trade.usdcSize ?? trade.size ?? "0"));
    const price = parseFloat(String(trade.price ?? "0"));

    // First fetch — just record, don't copy
    if (isFirstFetch) {
      isFirstFetch = false;
      seenHashes.add(txHash);
      set({ status: `Monitoring ${targetAddress.slice(0, 8)}… — waiting for new trades` });
      return;
    }

    // Dedup
    if (seenHashes.has(txHash)) {
      set({ status: "No new trades since last check" });
      return;
    }

    seenHashes.add(txHash);

    const scaledSize = size * (sizePercent / 100);
    const cappedSize = Math.min(scaledSize, maxSize);

    const newTrade: CopyTrade = {
      id: txHash,
      time: new Date().toLocaleTimeString(),
      side,
      outcome,
      title,
      size: cappedSize,
      price,
      status: "copied",
      mode,
    };

    // TODO: In live mode, submit real order via API

    const prev = get().trades;
    const modeLabel = mode === "live" ? "🔴 LIVE" : "📝 Paper";
    const updatedTrades = [newTrade, ...prev].slice(0, 50);
    set({
      trades: updatedTrades,
      status: `🎯 ${modeLabel} Copied: ${side} ${outcome} "${title.slice(0, 30)}" — $${cappedSize.toFixed(2)} @ ${price.toFixed(4)}`,
    });
    savePersistedTrades(updatedTrades);
  } catch (err) {
    set({ status: `❌ Error: ${(err as Error).message}` });
  }
}

export const useCopyTradingStore = create<CopyTradingState>((set, get) => {
  const persisted = loadPersistedState();
  const persistedTrades = loadPersistedTrades();

  return {
    targetAddress: persisted?.targetAddress || "",
    intervalSec: persisted?.intervalSec || 30,
    maxSize: persisted?.maxSize || 50,
    sizePercent: persisted?.sizePercent || 100,
    mode: persisted?.mode || "paper",
    running: false, // Will be restored by restoreRunningState()
    status: null,
    trades: persistedTrades,
    startedAt: persisted?.startedAt || null,

    setTargetAddress: (addr) => set({ targetAddress: addr }),
    setIntervalSec: (sec) => set({ intervalSec: sec }),
    setMaxSize: (max) => set({ maxSize: max }),
    setSizePercent: (pct) => set({ sizePercent: pct }),
    setMode: (mode) => {
      if (!get().running) set({ mode });
    },

    start: () => {
      if (copyTimer) clearInterval(copyTimer);
      isFirstFetch = true;
      seenHashes.clear();

      const { intervalSec, mode, targetAddress, maxSize, sizePercent } = get();
      const startedAt = new Date().toISOString();
      set({
        running: true,
        startedAt,
        status: `Starting copy trading in ${mode === "live" ? "LIVE" : "paper"} mode…`,
      });

      // Persist running state
      savePersistedState({
        running: true,
        targetAddress,
        intervalSec,
        maxSize,
        sizePercent,
        mode,
        startedAt,
      });

      // Run immediately, then on interval
      fetchAndCopy(get, (partial) => set(partial));
      copyTimer = setInterval(() => {
        if (get().running) {
          fetchAndCopy(get, (partial) => set(partial));
        }
      }, intervalSec * 1000);
    },

    stop: () => {
      if (copyTimer) {
        clearInterval(copyTimer);
        copyTimer = null;
      }
      set({ running: false, status: "Copy trading stopped" });
      clearPersistedState();
    },

    clearTrades: () => {
      if (copyTimer) {
        clearInterval(copyTimer);
        copyTimer = null;
      }
      seenHashes.clear();
      isFirstFetch = true;
      set({ running: false, trades: [], status: "⛔ All trades closed and log cleared" });
      clearPersistedState();
      savePersistedTrades([]);
    },

    restoreRunningState: () => {
      const saved = loadPersistedState();
      if (!saved?.running) return;

      // Restore config from persisted state
      set({
        targetAddress: saved.targetAddress,
        intervalSec: saved.intervalSec,
        maxSize: saved.maxSize,
        sizePercent: saved.sizePercent,
        mode: saved.mode,
        startedAt: saved.startedAt,
      });

      // Restart the polling timer
      if (copyTimer) clearInterval(copyTimer);
      isFirstFetch = true;
      seenHashes.clear();

      set({
        running: true,
        status: `Restored copy trading (${saved.mode === "live" ? "LIVE" : "paper"} mode)…`,
      });

      fetchAndCopy(get, (partial) => set(partial));
      copyTimer = setInterval(() => {
        if (get().running) {
          fetchAndCopy(get, (partial) => set(partial));
        }
      }, saved.intervalSec * 1000);
    },
  };
});
