import type { FastifyInstance } from "fastify";
export declare function findUsdcTransfer(logs: Array<{
    address: string;
    topics: string[];
    data: string;
}>, toAddress: string, amountUsdc: number): {
    payerAddress: string;
} | null;
export declare function registerMarketplaceRoutes(app: FastifyInstance): Promise<void>;
//# sourceMappingURL=marketplace.d.ts.map