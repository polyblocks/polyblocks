/**
 * Strategy Scheduler
 *
 * Server-side scheduler that keeps strategies running even when the user
 * navigates away from the editor. Supports both paper and live modes.
 */
import { evaluateGraph } from "@polyblocks/engine-core";
import { createPaperHandlers } from "./paperHandlers.js";
import { createLiveHandlers } from "./liveHandlers.js";
import { nanoid } from "nanoid";
/**
 * In-memory scheduler for MVP.
 * Strategies persist across page navigations — they run server-side.
 */
class StrategyScheduler {
    schedules = new Map();
    listeners = new Map();
    start(graph, intervalMs, mode = "paper") {
        // Stop existing schedule for this strategy
        if (this.schedules.has(graph.id)) {
            this.stop(graph.id);
        }
        const entry = {
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
        console.log(`[Scheduler] Started strategy ${graph.id} (${graph.name}) in ${mode} mode every ${intervalMs}ms`);
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
    /** Returns true if any strategy is currently scheduled. */
    hasAnyRunning() {
        return this.schedules.size > 0;
    }
    /** Returns the ID of the currently running strategy, or null. */
    getRunningStrategyId() {
        for (const [id] of this.schedules) {
            return id;
        }
        return null;
    }
    getStatus(strategyId) {
        const entry = this.schedules.get(strategyId);
        if (!entry)
            return null;
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
    getAllRunning() {
        const result = [];
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
    getRecentLogs(strategyId) {
        const entry = this.schedules.get(strategyId);
        return entry?.recentLogs || [];
    }
    onResult(strategyId, listener) {
        if (!this.listeners.has(strategyId)) {
            this.listeners.set(strategyId, []);
        }
        this.listeners.get(strategyId).push(listener);
    }
    async runOnce(entry) {
        entry.isExecuting = true;
        const runId = nanoid();
        const ctx = {
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
            if (entry.recentLogs.length > 20)
                entry.recentLogs.length = 20;
            // Notify listeners
            const listeners = this.listeners.get(entry.graph.id) || [];
            for (const listener of listeners) {
                listener(result);
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            entry.lastError = msg;
            console.error(`[Scheduler] Error running strategy ${entry.graph.id}:`, msg);
        }
        finally {
            entry.isExecuting = false;
        }
    }
}
// Singleton
export const scheduler = new StrategyScheduler();
//# sourceMappingURL=scheduler.js.map