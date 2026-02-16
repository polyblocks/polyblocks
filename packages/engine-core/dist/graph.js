/**
 * Graph utilities: topological sort, cycle detection, and adjacency helpers.
 * Operates on the serialisable StrategyGraph — no runtime/framework deps.
 */
export function buildAdjacency(nodes, edges) {
    const forward = new Map();
    const reverse = new Map();
    const edgeById = new Map();
    const byTargetPort = new Map();
    const bySourcePort = new Map();
    for (const n of nodes) {
        forward.set(n.id, []);
        reverse.set(n.id, []);
    }
    for (const e of edges) {
        edgeById.set(e.id, e);
        forward.get(e.source)?.push(e.target);
        reverse.get(e.target)?.push(e.source);
        const tKey = `${e.target}:${e.targetHandle}`;
        if (!byTargetPort.has(tKey))
            byTargetPort.set(tKey, []);
        byTargetPort.get(tKey).push(e);
        const sKey = `${e.source}:${e.sourceHandle}`;
        if (!bySourcePort.has(sKey))
            bySourcePort.set(sKey, []);
        bySourcePort.get(sKey).push(e);
    }
    return { forward, reverse, edgeById, byTargetPort, bySourcePort };
}
export function topologicalSort(nodes, edges) {
    const adj = buildAdjacency(nodes, edges);
    const inDegree = new Map();
    for (const n of nodes) {
        inDegree.set(n.id, 0);
    }
    for (const e of edges) {
        inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
    const queue = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0)
            queue.push(id);
    }
    const order = [];
    while (queue.length > 0) {
        const current = queue.shift();
        order.push(current);
        for (const neighbor of adj.forward.get(current) ?? []) {
            const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
            inDegree.set(neighbor, newDeg);
            if (newDeg === 0)
                queue.push(neighbor);
        }
    }
    return {
        order,
        hasCycle: order.length !== nodes.length,
    };
}
// ─── Find Root Nodes (no incoming edges) ────────────────────────────────────
export function findRoots(nodes, edges) {
    const hasIncoming = new Set(edges.map((e) => e.target));
    return nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
}
//# sourceMappingURL=graph.js.map