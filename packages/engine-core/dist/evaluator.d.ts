/**
 * Evaluator — walks a topologically sorted graph and evaluates each node.
 * This is the core execution loop used by both:
 *  - The backend scheduler (real/paper trading)
 *  - The frontend debug-preview (dry-run with mock data)
 *
 * Node-type specific handlers are injected via a NodeHandlerRegistry,
 * keeping this module free of Polymarket API dependencies.
 */
import type { StrategyGraph, StrategyNode, ExecutionLog } from "@polyblocks/types";
/** The data flowing through edges: portId → value */
export type PortValues = Record<string, unknown>;
/**
 * A node handler receives:
 *  - The node's own config
 *  - Resolved input values from upstream connections
 *  - An execution context with helpers
 *
 * It returns the output port values.
 */
export interface NodeHandler {
    execute(node: StrategyNode, inputs: PortValues, ctx: ExecutionContext): Promise<PortValues>;
}
export interface ExecutionContext {
    /** Unique ID for this execution run */
    runId: string;
    /** Strategy being executed */
    strategyId: string;
    /** User ID who owns the strategy */
    userId?: string;
    /** Whether this is paper or live */
    mode: "paper" | "live";
    /** Logging */
    log: (nodeId: string, message: string, data?: unknown) => void;
    /** Access to shared state (cooldown timestamps, positions, etc.) */
    state: Map<string, unknown>;
    /** Abort signal */
    signal?: AbortSignal;
}
export type NodeHandlerRegistry = Map<string, NodeHandler>;
export declare function evaluateGraph(graph: StrategyGraph, handlers: NodeHandlerRegistry, ctx: ExecutionContext): Promise<ExecutionLog>;
//# sourceMappingURL=evaluator.d.ts.map