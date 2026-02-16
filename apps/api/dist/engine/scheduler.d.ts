/**
 * Strategy Scheduler
 *
 * Uses BullMQ to schedule strategy graph evaluations at configurable intervals.
 * Falls back to a simple setInterval-based scheduler if Redis is unavailable.
 */
import type { StrategyGraph, ExecutionLog } from "@polyblocks/types";
/**
 * In-memory scheduler for MVP.
 * For production, replace with BullMQ repeatable jobs backed by Redis.
 */
declare class StrategyScheduler {
    private schedules;
    private listeners;
    start(graph: StrategyGraph, intervalMs: number): void;
    stop(strategyId: string): void;
    stopAll(): void;
    isScheduled(strategyId: string): boolean;
    getStatus(strategyId: string): {
        intervalMs: number;
        isRunning: boolean;
        lastResult: ExecutionLog | undefined;
    } | null;
    onResult(strategyId: string, listener: (log: ExecutionLog) => void): void;
    private runOnce;
}
export declare const scheduler: StrategyScheduler;
export {};
//# sourceMappingURL=scheduler.d.ts.map