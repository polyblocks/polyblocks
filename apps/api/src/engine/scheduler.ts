/**
 * Strategy Scheduler
 *
 * Server-side scheduler that keeps strategies running even when the user
 * navigates away from the editor. Supports both paper and live modes.
 */

import type { StrategyGraph, ExecutionLog } from "@polyblocks/types";
import { evaluateGraph } from "@polyblocks/engine-core";
import type { ExecutionContext } from "@polyblocks/engine-core";
import { createPaperHandlers } from "./paperHandlers.js";
import { createLiveHandlers } from "./liveHandlers.js";
import { nanoid } from "nanoid";

interface ScheduledStrategy {
  graph: StrategyGraph;
  intervalMs: number;
  mode: "paper" | "live";
  timer?: ReturnType<typeof setInterval>;
  isExecuting: boolean;
  startedAt: string;
  iteration: number;
  lastResult?: ExecutionLog;
  recentLogs: ExecutionLog[];
  lastError?: string;
  /** Persistent state across runs — keeps cooldown timestamps, seen hashes, etc. */
  persistentState: Map<string, unknown>;
}

/**
 * In-memory scheduler for MVP.
 * Strategies persist across page navigations — they run server-side.
 */
class StrategyScheduler {
  private schedules = new Map<string, ScheduledStrategy>();
  private listeners = new Map<string, Array<(log: ExecutionLog) => void>>();

  start(graph: StrategyGraph, intervalMs: number, mode: "paper" | "live" = "paper") {
    // Stop existing schedule for this strategy
    if (this.schedules.has(graph.id)) {
      this.stop(graph.id);
    }

    const entry: ScheduledStrategy = {
      graph,
      intervalMs,
      mode,
      isExecuting: false,
      startedAt: new Date().toISOString(),
      iteration: 0,
      recentLogs: [],
      persistentState: new Map(),
    };

    // Run immediately, then on interval
    this.runOnce(entry);

    entry.timer = setInterval(() => {
      if (!entry.isExecuting) {
        this.runOnce(entry);
      }
    }, intervalMs);

    this.schedules.set(graph.id, entry);
    console.log(
      `[Scheduler] Started strategy ${graph.id} (${graph.name}) in ${mode} mode every ${intervalMs}ms`,
    );
  }

  stop(strategyId: string) {
    const entry = this.schedules.get(strategyId);
    if (entry?.timer) {
      clearInterval(entry.timer);
    }
    this.schedules.delete(strategyId);
    console.log(`[Scheduler] Stopped strategy ${strategyId}`);
  }

  stopAll() {
    for (const [id] of this.schedules) {
      this.stop(id);
    }
  }

  isScheduled(strategyId: string): boolean {
    return this.schedules.has(strategyId);
  }

  getStatus(strategyId: string) {
    const entry = this.schedules.get(strategyId);
    if (!entry) return null;
    return {
      strategyId,
      strategyName: entry.graph.name,
      intervalMs: entry.intervalMs,
      mode: entry.mode,
      isExecuting: entry.isExecuting,
      startedAt: entry.startedAt,
      iteration: entry.iteration,
      lastError: entry.lastError,
      lastResult: entry.lastResult,
    };
  }

  /** Get status of ALL running strategies */
  getAllRunning(): Array<{
    strategyId: string;
    strategyName: string;
    mode: "paper" | "live";
    startedAt: string;
    iteration: number;
    intervalMs: number;
    lastError?: string;
  }> {
    const result: Array<{
      strategyId: string;
      strategyName: string;
      mode: "paper" | "live";
      startedAt: string;
      iteration: number;
      intervalMs: number;
      lastError?: string;
    }> = [];

    for (const [id, entry] of this.schedules) {
      result.push({
        strategyId: id,
        strategyName: entry.graph.name,
        mode: entry.mode,
        startedAt: entry.startedAt,
        iteration: entry.iteration,
        intervalMs: entry.intervalMs,
        lastError: entry.lastError,
      });
    }

    return result;
  }

  /** Get recent logs for a scheduled strategy */
  getRecentLogs(strategyId: string): ExecutionLog[] {
    const entry = this.schedules.get(strategyId);
    return entry?.recentLogs || [];
  }

  onResult(strategyId: string, listener: (log: ExecutionLog) => void) {
    if (!this.listeners.has(strategyId)) {
      this.listeners.set(strategyId, []);
    }
    this.listeners.get(strategyId)!.push(listener);
  }

  private async runOnce(entry: ScheduledStrategy) {
    entry.isExecuting = true;
    const runId = nanoid();

    const ctx: ExecutionContext = {
      runId,
      strategyId: entry.graph.id,
      mode: entry.mode,
      log: (nodeId, message, data) => {
        console.log(`  [${nodeId}] ${message}`, data ?? "");
      },
      // Reuse persistent state across runs so dedup (UserActivity),
      // cooldowns, and exposure tracking survive between iterations
      state: entry.persistentState,
    };

    try {
      const handlers = entry.mode === "live" ? createLiveHandlers() : createPaperHandlers();
      const result = await evaluateGraph(entry.graph, handlers, ctx);
      entry.lastResult = result;
      entry.iteration++;
      entry.lastError = undefined;

      // Keep last 20 logs
      entry.recentLogs.unshift(result);
      if (entry.recentLogs.length > 20) entry.recentLogs.length = 20;

      // Notify listeners
      const listeners = this.listeners.get(entry.graph.id) || [];
      for (const listener of listeners) {
        listener(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.lastError = msg;
      console.error(`[Scheduler] Error running strategy ${entry.graph.id}:`, msg);
    } finally {
      entry.isExecuting = false;
    }
  }
}

// Singleton
export const scheduler = new StrategyScheduler();
