/**
 * Live Trading Node Handlers
 *
 * Identical to paper handlers for data/logic/risk blocks, but PlaceOrder,
 * CancelOrder, and ClosePosition use the real Polymarket CLOB client to
 * submit actual orders on Polygon mainnet.
 */
import type { NodeHandlerRegistry } from "@polyblocks/engine-core";
export declare function createLiveHandlers(userId: string): NodeHandlerRegistry;
//# sourceMappingURL=liveHandlers.d.ts.map