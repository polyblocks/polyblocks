/**
 * Copy Trading Zustand store — persistent state that survives page navigation.
 * The polling interval runs outside React component lifecycle.
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
    set({
      trades: [newTrade, ...prev].slice(0, 50),
      status: `🎯 ${modeLabel} Copied: ${side} ${outcome} "${title.slice(0, 30)}" — $${cappedSize.toFixed(2)} @ ${price.toFixed(4)}`,
    });
  } catch (err) {
    set({ status: `❌ Error: ${(err as Error).message}` });
  }
}

export const useCopyTradingStore = create<CopyTradingState>((set, get) => ({
  targetAddress: "",
  intervalSec: 30,
  maxSize: 50,
  sizePercent: 100,
  mode: "paper",
  running: false,
  status: null,
  trades: [],
  startedAt: null,

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

    const { intervalSec, mode } = get();
    set({
      running: true,
      startedAt: new Date().toISOString(),
      status: `Starting copy trading in ${mode === "live" ? "LIVE" : "paper"} mode…`,
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
  },

  clearTrades: () => {
    if (copyTimer) {
      clearInterval(copyTimer);
      copyTimer = null;
    }
    seenHashes.clear();
    isFirstFetch = true;
    set({ running: false, trades: [], status: "⛔ All trades closed and log cleared" });
  },
}));
