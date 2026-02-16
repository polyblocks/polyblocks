/**
 * Evaluator — walks a topologically sorted graph and evaluates each node.
 * This is the core execution loop used by both:
 *  - The backend scheduler (real/paper trading)
 *  - The frontend debug-preview (dry-run with mock data)
 *
 * Node-type specific handlers are injected via a NodeHandlerRegistry,
 * keeping this module free of Polymarket API dependencies.
 */
import { ExecutionStatus } from "@polyblocks/types";
import { topologicalSort } from "./graph.js";
// ─── Evaluator ──────────────────────────────────────────────────────────────
export async function evaluateGraph(graph, handlers, ctx) {
    const startedAt = new Date().toISOString();
    const nodeResults = [];
    const topo = topologicalSort(graph.nodes, graph.edges);
    if (topo.hasCycle) {
        return {
            id: ctx.runId,
            strategyId: ctx.strategyId,
            startedAt,
            completedAt: new Date().toISOString(),
            status: ExecutionStatus.Failed,
            nodeResults: [],
            summary: "Graph contains a cycle — cannot execute.",
        };
    }
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    // Store each node's output so downstream can read it
    const nodeOutputs = new Map();
    let overallStatus = ExecutionStatus.Completed;
    for (const nodeId of topo.order) {
        if (ctx.signal?.aborted) {
            overallStatus = ExecutionStatus.Failed;
            break;
        }
        const node = nodeMap.get(nodeId);
        const handler = handlers.get(node.type);
        if (!handler) {
            nodeResults.push({
                nodeId,
                status: "skipped",
                durationMs: 0,
                error: `No handler registered for block type: ${node.type}`,
            });
            continue;
        }
        // ── Resolve inputs from upstream connections ────────────────────────────
        const inputs = {};
        const incomingEdges = graph.edges.filter((e) => e.target === nodeId);
        for (const edge of incomingEdges) {
            const upstreamOutput = nodeOutputs.get(edge.source);
            if (upstreamOutput && edge.sourceHandle in upstreamOutput) {
                inputs[edge.targetHandle] = upstreamOutput[edge.sourceHandle];
            }
        }
        // ── Check if signal inputs are present (gating) ────────────────────────
        // If a node has a "signal" input port connected but the upstream didn't
        // fire (returned null/undefined for that port), we skip this node.
        const signalEdges = incomingEdges.filter((e) => e.targetHandle === "signal" || e.targetHandle === "trigger");
        if (signalEdges.length > 0) {
            const anySignalFired = signalEdges.some((e) => {
                const val = nodeOutputs.get(e.source)?.[e.sourceHandle];
                return val !== null && val !== undefined && val !== false;
            });
            if (!anySignalFired) {
                nodeResults.push({
                    nodeId,
                    status: "skipped",
                    durationMs: 0,
                });
                // Still set outputs as empty so downstream sees no signal
                nodeOutputs.set(nodeId, {});
                continue;
            }
        }
        // ── Execute ────────────────────────────────────────────────────────────
        const t0 = performance.now();
        try {
            const output = await handler.execute(node, inputs, ctx);
            const durationMs = Math.round(performance.now() - t0);
            nodeOutputs.set(nodeId, output);
            nodeResults.push({
                nodeId,
                status: "completed",
                output,
                durationMs,
            });
            ctx.log(nodeId, "Completed", output);
        }
        catch (err) {
            const durationMs = Math.round(performance.now() - t0);
            const errorMsg = err instanceof Error ? err.message : String(err);
            nodeOutputs.set(nodeId, {});
            nodeResults.push({
                nodeId,
                status: "failed",
                durationMs,
                error: errorMsg,
            });
            ctx.log(nodeId, `Failed: ${errorMsg}`);
            overallStatus = ExecutionStatus.Failed;
            // Don't abort the entire graph — downstream nodes will just get no input
        }
    }
    return {
        id: ctx.runId,
        strategyId: ctx.strategyId,
        startedAt,
        completedAt: new Date().toISOString(),
        status: overallStatus,
        nodeResults,
        summary: `Executed ${nodeResults.filter((r) => r.status === "completed").length}/${graph.nodes.length} nodes`,
    };
}
//# sourceMappingURL=evaluator.js.map