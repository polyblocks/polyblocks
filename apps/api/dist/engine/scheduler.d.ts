/**
 * Strategy Scheduler
 *
 * Server-side scheduler that keeps strategies running even when the user
 * navigates away from the editor. Supports both paper and live modes.
 */
import type { StrategyGraph, ExecutionLog } from "@polyblocks/types";
/**
 * In-memory scheduler for MVP.
 * Strategies persist across page navigations — they run server-side.
 */
declare class StrategyScheduler {
    private schedules;
    private listeners;
    start(graph: StrategyGraph, intervalMs: number, mode?: "paper" | "live"): void;
    stop(strategyId: string): void;
    stopAll(): void;
    isScheduled(strategyId: string): boolean;
    /** Returns true if any strategy is currently scheduled. */
    hasAnyRunning(): boolean;
    /** Returns the ID of the currently running strategy, or null. */
    getRunningStrategyId(): string | null;
    getStatus(strategyId: string): {
        strategyId: string;
        strategyName: string;
        intervalMs: number;
        mode: "live" | "paper";
        isExecuting: boolean;
        startedAt: string;
        iteration: number;
        lastError: string | undefined;
        lastResult: ExecutionLog | undefined;
    } | null;
    /** Get status of ALL running strategies */
    getAllRunning(): Array<{
        strategyId: string;
        strategyName: string;
        mode: "paper" | "live";
        startedAt: string;
        iteration: number;
        intervalMs: number;
        lastError?: string;
    }>;
    /** Get recent logs for a scheduled strategy */
    getRecentLogs(strategyId: string): ExecutionLog[];
    onResult(strategyId: string, listener: (log: ExecutionLog) => void): void;
    private runOnce;
}
export declare const scheduler: StrategyScheduler;
export {};
//# sourceMappingURL=scheduler.d.ts.map