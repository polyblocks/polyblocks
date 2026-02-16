/**
 * Strategy Scheduler
 *
 * Uses BullMQ to schedule strategy graph evaluations at configurable intervals.
 * Falls back to a simple setInterval-based scheduler if Redis is unavailable.
 */
import { evaluateGraph } from "@polyblocks/engine-core";
import { createPaperHandlers } from "./paperHandlers.js";
import { nanoid } from "nanoid";
/**
 * In-memory scheduler for MVP.
 * For production, replace with BullMQ repeatable jobs backed by Redis.
 */
class StrategyScheduler {
    schedules = new Map();
    listeners = new Map();
    start(graph, intervalMs) {
        // Stop existing schedule for this strategy
        if (this.schedules.has(graph.id)) {
            this.stop(graph.id);
        }
        const entry = {
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
        console.log(`[Scheduler] Started strategy ${graph.id} (${graph.name}) every ${intervalMs}ms`);
    }
    stop(strategyId) {
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
    isScheduled(strategyId) {
        return this.schedules.has(strategyId);
    }
    getStatus(strategyId) {
        const entry = this.schedules.get(strategyId);
        if (!entry)
            return null;
        return {
            intervalMs: entry.intervalMs,
            isRunning: entry.isRunning,
            lastResult: entry.lastResult,
        };
    }
    onResult(strategyId, listener) {
        if (!this.listeners.has(strategyId)) {
            this.listeners.set(strategyId, []);
        }
        this.listeners.get(strategyId).push(listener);
    }
    async runOnce(entry) {
        entry.isRunning = true;
        const runId = nanoid();
        const ctx = {
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
        }
        catch (err) {
            console.error(`[Scheduler] Error running strategy ${entry.graph.id}:`, err);
        }
        finally {
            entry.isRunning = false;
        }
    }
}
// Singleton
export const scheduler = new StrategyScheduler();
//# sourceMappingURL=scheduler.js.map