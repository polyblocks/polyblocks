/**
 * Strategy Scheduler
 *
 * Server-side scheduler that keeps strategies running even when the user
 * navigates away from the editor. Supports both paper and live modes.
 */

import type { StrategyGraph, ExecutionLog } from "@polyblocks/types";
import { ExecutionStatus } from "@polyblocks/types";
import { evaluateGraph } from "@polyblocks/engine-core";
import type { ExecutionContext } from "@polyblocks/engine-core";
import { createPaperHandlers } from "./paperHandlers.js";
import { createLiveHandlers } from "./liveHandlers.js";
import { nanoid } from "nanoid";

interface ScheduledStrategy {
  userId: string;
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

  private makeKey(userId: string, strategyId: string): string {
    return `${userId}:${strategyId}`;
  }

  start(userId: string, graph: StrategyGraph, intervalMs: number, mode: "paper" | "live" = "paper") {
    const key = this.makeKey(userId, graph.id);

    // Stop existing schedule for this strategy
    if (this.schedules.has(key)) {
      this.stop(userId, graph.id);
    }

    const entry: ScheduledStrategy = {
      userId,
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

    this.schedules.set(key, entry);
    console.log(
      `[Scheduler] Started strategy ${graph.id} for user ${userId} (${graph.name}) in ${mode} mode every ${intervalMs}ms`,
    );
  }

  stop(userId: string, strategyId: string) {
    const key = this.makeKey(userId, strategyId);
    const entry = this.schedules.get(key);
    if (entry?.timer) {
      clearInterval(entry.timer);
    }
    this.schedules.delete(key);
    console.log(`[Scheduler] Stopped strategy ${strategyId} for user ${userId}`);
  }

  stopAll() {
    for (const [, entry] of this.schedules) {
      this.stop(entry.userId, entry.graph.id);
    }
  }

  isScheduled(userId: string, strategyId: string): boolean {
    return this.schedules.has(this.makeKey(userId, strategyId));
  }

  /** Returns true if any strategy is currently scheduled. */
  hasAnyRunning(): boolean {
    return this.schedules.size > 0;
  }

  /** Returns the ID of the currently running strategy, or null. */
  getRunningStrategyId(userId: string): string | null {
    for (const [, entry] of this.schedules) {
      if (entry.userId === userId) return entry.graph.id;
    }
    return null;
  }

  getStatus(userId: string, strategyId: string) {
    const entry = this.schedules.get(this.makeKey(userId, strategyId));
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
  getAllRunning(userId: string): Array<{
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

    for (const [, entry] of this.schedules) {
      if (entry.userId !== userId) continue;
      result.push({
        strategyId: entry.graph.id,
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
  getRecentLogs(userId: string, strategyId: string): ExecutionLog[] {
    const entry = this.schedules.get(this.makeKey(userId, strategyId));
    return entry?.recentLogs || [];
  }

  onResult(userId: string, strategyId: string, listener: (log: ExecutionLog) => void) {
    const key = this.makeKey(userId, strategyId);
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)!.push(listener);
  }

  private async runOnce(entry: ScheduledStrategy) {
    entry.isExecuting = true;
    const runId = nanoid();

    const ctx: ExecutionContext = {
      runId,
      strategyId: entry.graph.id,
      userId: entry.graph.userId,
      mode: entry.mode,
      log: (nodeId, message, data) => {
        console.log(`  [${nodeId}] ${message}`, data ?? "");
      },
      // Reuse persistent state across runs so dedup (UserActivity),
      // cooldowns, and exposure tracking survive between iterations
      state: entry.persistentState,
    };

    try {
      const handlers = entry.mode === "live" ? createLiveHandlers(entry.graph.userId) : createPaperHandlers();
      const result = await evaluateGraph(entry.graph, handlers, ctx);
      entry.lastResult = result;
      entry.iteration++;
      entry.lastError = undefined;

      // Keep last 20 logs
      entry.recentLogs.unshift(result);
      if (entry.recentLogs.length > 20) entry.recentLogs.length = 20;

      // Notify listeners
      const listeners = this.listeners.get(this.makeKey(entry.userId, entry.graph.id)) || [];
      for (const listener of listeners) {
        listener(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      entry.lastError = stack || msg;
      console.error(`[Scheduler] Error running strategy ${entry.graph.id}:`, msg);
      if (stack) {
        console.error(`[Scheduler] Stack trace:`, stack);
      }
      
      // Create an error log entry
      const errorLog: ExecutionLog = {
        id: `error_${nanoid()}`,
        strategyId: entry.graph.id,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: ExecutionStatus.Failed,
        nodeResults: [],
        error: stack || msg,
      };
      entry.recentLogs.unshift(errorLog);
      if (entry.recentLogs.length > 20) entry.recentLogs.length = 20;
    } finally {
      entry.isExecuting = false;
    }
  }
}

// Singleton
export const scheduler = new StrategyScheduler();
