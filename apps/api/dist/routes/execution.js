/**
 * Execution routes — trigger paper runs, get logs, manage scheduled strategies.
 */
import { BlockType } from "@polyblocks/types";
import { evaluateGraph } from "@polyblocks/engine-core";
import { nanoid } from "nanoid";
import { createPaperHandlers } from "../engine/paperHandlers.js";
import { createLiveHandlers } from "../engine/liveHandlers.js";
import { getCredentials } from "./credentials.js";
import { scheduler } from "../engine/scheduler.js";
import { sessionsCol } from "../db.js";
function getSessionToken(headers) {
    const token = headers["x-session-token"];
    return typeof token === "string" ? token : "";
}
async function resolveSession(token) {
    if (!token)
        return null;
    const session = await sessionsCol().findOne({ _id: token });
    if (!session)
        return null;
    if (session.expiresAt < new Date()) {
        await sessionsCol().deleteOne({ _id: token });
        return null;
    }
    return session.userId;
}
// ── In-memory execution log store ────────────────────────────────────────────
const executionLogs = new Map();
function executionLogKey(userId, strategyId) {
    return `${userId}:${strategyId}`;
}
export async function registerExecutionRoutes(app) {
    // ── Run a strategy once (paper or live mode) ──────────────────────────────
    app.post("/run", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const body = request.body;
        const mode = body.mode === "live" ? "live" : "paper";
        const graph = { ...body, userId };
        const runId = nanoid();
        // ── Safety guard: prevent duplicate execution ─────────────────────────
        // If this strategy is already running on the server scheduler, reject
        // the manual /run request to prevent double order placement.
        if (scheduler.isScheduled(userId, graph.id)) {
            return {
                result: {
                    id: runId,
                    strategyId: graph.id,
                    startedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                    status: "failed",
                    nodeResults: [],
                    summary: "Strategy is already running on the server. Stop it first to run manually.",
                },
                logs: [],
            };
        }
        // Validate live mode has credentials
        if (mode === "live") {
            const creds = await getCredentials(userId);
            if (!creds.isConfigured) {
                return {
                    result: {
                        id: runId,
                        strategyId: graph.id,
                        startedAt: new Date().toISOString(),
                        completedAt: new Date().toISOString(),
                        status: "failed",
                        nodeResults: [],
                        summary: "No trading credentials configured. Go to Settings to set up your wallet.",
                    },
                    logs: [],
                };
            }
        }
        const logs = [];
        const ctx = {
            runId,
            strategyId: graph.id,
            mode,
            log: (nodeId, message, data) => {
                logs.push({ nodeId, message, data });
            },
            state: new Map(),
        };
        const handlers = mode === "live" ? createLiveHandlers(userId) : createPaperHandlers();
        const result = await evaluateGraph(graph, handlers, ctx);
        // Store logs
        const logKey = executionLogKey(userId, graph.id);
        if (!executionLogs.has(logKey)) {
            executionLogs.set(logKey, []);
        }
        executionLogs.get(logKey).unshift(result);
        // Keep max 50 logs per strategy
        const stratLogs = executionLogs.get(logKey);
        if (stratLogs.length > 50)
            stratLogs.length = 50;
        return { result, logs };
    });
    // ── Start a strategy as a background scheduled job ────────────────────────
    app.post("/schedule/start", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        try {
            const body = request.body;
            const mode = body.mode === "live" ? "live" : "paper";
            const graph = { ...body, userId };
            // Validate live mode has credentials
            if (mode === "live") {
                const creds = await getCredentials(userId);
                if (!creds.isConfigured) {
                    return { success: false, error: "No trading credentials configured. Please add your API keys in Settings." };
                }
            }
            // ── Enforce: only one strategy may run at a time ────────────────────
            const existingId = scheduler.getRunningStrategyId(userId);
            if (existingId && existingId !== graph.id) {
                return {
                    success: false,
                    error: `Another strategy is already running: "${existingId}". Stop it before starting a new one.`,
                };
            }
            // Determine interval from graph
            let intervalMs = body.intervalMs || 15_000;
            for (const node of graph.nodes) {
                if (node.type === BlockType.IntervalTrigger && node.config.intervalMs) {
                    intervalMs = Math.max(5000, Number(node.config.intervalMs));
                    break;
                }
            }
            scheduler.start(userId, graph, intervalMs, mode);
            return { success: true, strategyId: graph.id, mode, intervalMs };
        }
        catch (err) {
            request.log.error(err, "Failed to start strategy");
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, error: `Failed to start strategy: ${msg}` };
        }
    });
    // ── Stop a scheduled strategy ─────────────────────────────────────────────
    app.post("/schedule/stop", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const body = request.body;
        scheduler.stop(userId, body.strategyId);
        return { success: true };
    });
    // ── Get status of a scheduled strategy ────────────────────────────────────
    app.get("/schedule/status/:strategyId", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const { strategyId } = request.params;
        const status = scheduler.getStatus(userId, strategyId);
        return { running: !!status, ...status };
    });
    // ── Get recent logs for a scheduled strategy ──────────────────────────────
    app.get("/schedule/logs/:strategyId", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const { strategyId } = request.params;
        const logs = scheduler.getRecentLogs(userId, strategyId);
        return { logs };
    });
    // ── Get all running strategies ────────────────────────────────────────────
    app.get("/schedule/running", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        return { strategies: scheduler.getAllRunning(userId) };
    });
    // ── Get execution logs for a strategy ─────────────────────────────────────
    app.get("/logs/:strategyId", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const { strategyId } = request.params;
        const status = scheduler.getStatus(userId, strategyId);
        if (!status)
            return { logs: [] };
        const logKey = executionLogKey(userId, strategyId);
        return {
            logs: executionLogs.get(logKey) || [],
        };
    });
    // ── Clear logs ────────────────────────────────────────────────────────────
    app.delete("/logs/:strategyId", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const { strategyId } = request.params;
        const status = scheduler.getStatus(userId, strategyId);
        if (!status)
            return { cleared: true };
        executionLogs.delete(executionLogKey(userId, strategyId));
        return { cleared: true };
    });
}
//# sourceMappingURL=execution.js.map