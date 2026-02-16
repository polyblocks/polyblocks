/**
 * Strategy Scheduler
 *
 * Uses BullMQ to schedule strategy graph evaluations at configurable intervals.
 * Falls back to a simple setInterval-based scheduler if Redis is unavailable.
 */

import type { StrategyGraph, ExecutionLog } from "@polyblocks/types";
import { evaluateGraph } from "@polyblocks/engine-core";
import type { ExecutionContext } from "@polyblocks/engine-core";
import { createPaperHandlers } from "./paperHandlers.js";
import { nanoid } from "nanoid";

interface ScheduledStrategy {
  graph: StrategyGraph;
  intervalMs: number;
  timer?: ReturnType<typeof setInterval>;
  isRunning: boolean;
  lastResult?: ExecutionLog;
}

/**
 * In-memory scheduler for MVP.
 * For production, replace with BullMQ repeatable jobs backed by Redis.
 */
class StrategyScheduler {
  private schedules = new Map<string, ScheduledStrategy>();
  private listeners = new Map<string, Array<(log: ExecutionLog) => void>>();

  start(graph: StrategyGraph, intervalMs: number) {
    // Stop existing schedule for this strategy
    if (this.schedules.has(graph.id)) {
      this.stop(graph.id);
    }

    const entry: ScheduledStrategy = {
      graph,
      intervalMs,
      isRunning: false,
    };

    // Run immediately, then on interval
    this.runOnce(entry);

    entry.timer = setInterval(() => {
      if (!entry.isRunning) {
        this.runOnce(entry);
      }
    }, intervalMs);

    this.schedules.set(graph.id, entry);
    console.log(
      `[Scheduler] Started strategy ${graph.id} (${graph.name}) every ${intervalMs}ms`,
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
      intervalMs: entry.intervalMs,
      isRunning: entry.isRunning,
      lastResult: entry.lastResult,
    };
  }

  onResult(strategyId: string, listener: (log: ExecutionLog) => void) {
    if (!this.listeners.has(strategyId)) {
      this.listeners.set(strategyId, []);
    }
    this.listeners.get(strategyId)!.push(listener);
  }

  private async runOnce(entry: ScheduledStrategy) {
    entry.isRunning = true;
    const runId = nanoid();

    const ctx: ExecutionContext = {
      runId,
      strategyId: entry.graph.id,
      mode: "paper",
      log: (nodeId, message, data) => {
        console.log(`  [${nodeId}] ${message}`, data ?? "");
      },
      state: new Map(),
    };

    try {
      const handlers = createPaperHandlers();
      const result = await evaluateGraph(entry.graph, handlers, ctx);
      entry.lastResult = result;

      // Notify listeners
      const listeners = this.listeners.get(entry.graph.id) || [];
      for (const listener of listeners) {
        listener(result);
      }
    } catch (err) {
      console.error(`[Scheduler] Error running strategy ${entry.graph.id}:`, err);
    } finally {
      entry.isRunning = false;
    }
  }
}

// Singleton
export const scheduler = new StrategyScheduler();
