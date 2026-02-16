/**
 * Graph utilities: topological sort, cycle detection, and adjacency helpers.
 * Operates on the serialisable StrategyGraph — no runtime/framework deps.
 */
import type { StrategyEdge, StrategyNode } from "@polyblocks/types";
export interface AdjacencyMap {
    /** nodeId → list of downstream nodeIds */
    forward: Map<string, string[]>;
    /** nodeId → list of upstream nodeIds */
    reverse: Map<string, string[]>;
    /** edgeId → edge */
    edgeById: Map<string, StrategyEdge>;
    /** targetNodeId:targetHandle → source edges */
    byTargetPort: Map<string, StrategyEdge[]>;
    /** sourceNodeId:sourceHandle → target edges */
    bySourcePort: Map<string, StrategyEdge[]>;
}
export declare function buildAdjacency(nodes: StrategyNode[], edges: StrategyEdge[]): AdjacencyMap;
export interface TopologicalResult {
    /** Nodes in execution order (root → leaves). Empty if cycle detected. */
    order: string[];
    /** True if the graph contains a cycle */
    hasCycle: boolean;
}
export declare function topologicalSort(nodes: StrategyNode[], edges: StrategyEdge[]): TopologicalResult;
export declare function findRoots(nodes: StrategyNode[], edges: StrategyEdge[]): string[];
//# sourceMappingURL=graph.d.ts.map