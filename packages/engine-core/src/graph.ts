/**
 * Graph utilities: topological sort, cycle detection, and adjacency helpers.
 * Operates on the serialisable StrategyGraph — no runtime/framework deps.
 */

import type { StrategyEdge, StrategyNode } from "@polyblocks/types";

// ─── Adjacency ──────────────────────────────────────────────────────────────

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

export function buildAdjacency(
  nodes: StrategyNode[],
  edges: StrategyEdge[],
): AdjacencyMap {
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  const edgeById = new Map<string, StrategyEdge>();
  const byTargetPort = new Map<string, StrategyEdge[]>();
  const bySourcePort = new Map<string, StrategyEdge[]>();

  for (const n of nodes) {
    forward.set(n.id, []);
    reverse.set(n.id, []);
  }

  for (const e of edges) {
    edgeById.set(e.id, e);

    forward.get(e.source)?.push(e.target);
    reverse.get(e.target)?.push(e.source);

    const tKey = `${e.target}:${e.targetHandle}`;
    if (!byTargetPort.has(tKey)) byTargetPort.set(tKey, []);
    byTargetPort.get(tKey)!.push(e);

    const sKey = `${e.source}:${e.sourceHandle}`;
    if (!bySourcePort.has(sKey)) bySourcePort.set(sKey, []);
    bySourcePort.get(sKey)!.push(e);
  }

  return { forward, reverse, edgeById, byTargetPort, bySourcePort };
}

// ─── Topological Sort (Kahn's algorithm) ────────────────────────────────────

export interface TopologicalResult {
  /** Nodes in execution order (root → leaves). Empty if cycle detected. */
  order: string[];
  /** True if the graph contains a cycle */
  hasCycle: boolean;
}

export function topologicalSort(
  nodes: StrategyNode[],
  edges: StrategyEdge[],
): TopologicalResult {
  const adj = buildAdjacency(nodes, edges);
  const inDegree = new Map<string, number>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
  }
  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adj.forward.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return {
    order,
    hasCycle: order.length !== nodes.length,
  };
}

// ─── Find Root Nodes (no incoming edges) ────────────────────────────────────

export function findRoots(
  nodes: StrategyNode[],
  edges: StrategyEdge[],
): string[] {
  const hasIncoming = new Set(edges.map((e) => e.target));
  return nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
}
