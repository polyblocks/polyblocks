/**
 * Paper Trades & Execution Logs routes — per-user, per-strategy.
 * All data stored in MongoDB so it's isolated per account.
 */
import { randomUUID } from "crypto";
import { paperTradesCol, executionLogsCol } from "../db.js";
export async function registerPaperTradeRoutes(app) {
    // ── List ALL trades for a user (across all strategies) ────────────────────
    app.get("/all", async (request) => {
        const { userId } = request.query;
        if (!userId)
            return { trades: [] };
        const docs = await paperTradesCol()
            .find({ userId })
            .sort({ executedAt: -1 })
            .limit(1000)
            .toArray();
        return {
            trades: docs.map((d) => ({
                id: d._id,
                strategyId: d.strategyId,
                marketConditionId: d.marketConditionId,
                tokenId: d.tokenId,
                side: d.side,
                price: d.price,
                size: d.size,
                executedAt: d.executedAt,
                originNodeId: d.originNodeId,
            })),
        };
    });
    // ── Reset ALL paper data for a user ───────────────────────────────────────
    app.delete("/all", async (request) => {
        const { userId } = request.query;
        if (!userId)
            return { cleared: false };
        await Promise.all([
            paperTradesCol().deleteMany({ userId }),
            executionLogsCol().deleteMany({ userId })
        ]);
        return { cleared: true };
    });
    // ── List trades for a strategy ────────────────────────────────────────────
    app.get("/:strategyId", async (request) => {
        const { strategyId } = request.params;
        const { userId } = request.query;
        const filter = { strategyId };
        if (userId)
            filter.userId = userId;
        const docs = await paperTradesCol()
            .find(filter)
            .sort({ executedAt: -1 })
            .limit(500)
            .toArray();
        return {
            trades: docs.map((d) => ({
                id: d._id,
                strategyId: d.strategyId,
                marketConditionId: d.marketConditionId,
                tokenId: d.tokenId,
                side: d.side,
                price: d.price,
                size: d.size,
                executedAt: d.executedAt,
                originNodeId: d.originNodeId,
            })),
        };
    });
    // ── Add trades for a strategy ─────────────────────────────────────────────
    app.post("/:strategyId", async (request) => {
        const { strategyId } = request.params;
        const body = request.body;
        const docs = body.trades.map((t) => ({
            _id: t.id || `pt_${randomUUID().slice(0, 8)}`,
            userId: body.userId || "anonymous",
            strategyId,
            marketConditionId: t.marketConditionId,
            tokenId: t.tokenId,
            side: t.side,
            price: t.price,
            size: t.size,
            executedAt: t.executedAt,
            originNodeId: t.originNodeId,
        }));
        if (docs.length > 0) {
            await paperTradesCol().insertMany(docs, { ordered: false }).catch(() => {
                // Ignore duplicate key errors
            });
        }
        return { added: docs.length };
    });
    // ── Clear trades for a strategy ───────────────────────────────────────────
    app.delete("/:strategyId", async (request) => {
        const { strategyId } = request.params;
        const { userId } = request.query;
        const filter = { strategyId };
        if (userId)
            filter.userId = userId;
        await paperTradesCol().deleteMany(filter);
        return { cleared: true };
    });
    // ── Get execution logs for a strategy ─────────────────────────────────────
    app.get("/:strategyId/logs", async (request) => {
        const { strategyId } = request.params;
        const { userId } = request.query;
        const filter = { strategyId };
        if (userId)
            filter.userId = userId;
        const docs = await executionLogsCol()
            .find(filter)
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray();
        return {
            logs: docs.map((d) => d.log),
        };
    });
    // ── Add execution logs ────────────────────────────────────────────────────
    app.post("/:strategyId/logs", async (request) => {
        const { strategyId } = request.params;
        const body = request.body;
        const docs = body.logs.map((log) => ({
            _id: `el_${randomUUID().slice(0, 8)}`,
            userId: body.userId || "anonymous",
            strategyId,
            log,
            createdAt: new Date().toISOString(),
        }));
        if (docs.length > 0) {
            await executionLogsCol().insertMany(docs, { ordered: false }).catch(() => { });
        }
        return { added: docs.length };
    });
    // ── Clear execution logs ──────────────────────────────────────────────────
    app.delete("/:strategyId/logs", async (request) => {
        const { strategyId } = request.params;
        const { userId } = request.query;
        const filter = { strategyId };
        if (userId)
            filter.userId = userId;
        await executionLogsCol().deleteMany(filter);
        return { cleared: true };
    });
}
//# sourceMappingURL=paperTrades.js.map