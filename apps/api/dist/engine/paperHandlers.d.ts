/**
 * Paper Trading Node Handlers
 *
 * Each handler implements the NodeHandler interface for a specific BlockType.
 * In paper mode, order execution is simulated against real CLOB order book
 * snapshots — no actual trades are placed.
 */
import type { NodeHandlerRegistry } from "@polyblocks/engine-core";
export declare function createPaperHandlers(): NodeHandlerRegistry;
//# sourceMappingURL=paperHandlers.d.ts.map