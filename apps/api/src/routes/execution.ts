/**
 * Execution routes — trigger paper runs, get logs, manage scheduled strategies.
 */

import type { FastifyInstance } from "fastify";
import type {
  StrategyGraph,
  ExecutionLog,
} from "@polyblocks/types";
import { BlockType } from "@polyblocks/types";
import { evaluateGraph } from "@polyblocks/engine-core";
import type { ExecutionContext } from "@polyblocks/engine-core";
import { nanoid } from "nanoid";
import { createPaperHandlers } from "../engine/paperHandlers.js";
import { createLiveHandlers } from "../engine/liveHandlers.js";
import { getCredentials } from "./credentials.js";
import { scheduler } from "../engine/scheduler.js";

// ── In-memory execution log store ────────────────────────────────────────────
const executionLogs = new Map<string, ExecutionLog[]>();

export async function registerExecutionRoutes(app: FastifyInstance) {
  // ── Run a strategy once (paper or live mode) ──────────────────────────────
  app.post("/run", async (request) => {
    const body = request.body as { mode?: string } & StrategyGraph;
    const mode = (body as { mode?: string }).mode === "live" ? "live" : "paper";
    // Strip the mode field before using as graph
    const graph = body as StrategyGraph;
    const runId = nanoid();

    // Validate live mode has credentials
    if (mode === "live") {
      const creds = await getCredentials();
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

    const logs: Array<{ nodeId: string; message: string; data?: unknown }> = [];

    const ctx: ExecutionContext = {
      runId,
      strategyId: graph.id,
      mode,
      log: (nodeId, message, data) => {
        logs.push({ nodeId, message, data });
      },
      state: new Map(),
    };

    const handlers = mode === "live" ? createLiveHandlers() : createPaperHandlers();
    const result = await evaluateGraph(graph, handlers, ctx);

    // Store logs
    if (!executionLogs.has(graph.id)) {
      executionLogs.set(graph.id, []);
    }
    executionLogs.get(graph.id)!.unshift(result);
    // Keep max 50 logs per strategy
    const stratLogs = executionLogs.get(graph.id)!;
    if (stratLogs.length > 50) stratLogs.length = 50;

    return { result, logs };
  });

  // ── Start a strategy as a background scheduled job ────────────────────────
  app.post("/schedule/start", async (request) => {
    const body = request.body as { mode?: string; intervalMs?: number } & StrategyGraph;
    const mode = body.mode === "live" ? "live" : "paper";
    const graph = body as StrategyGraph;

    // Validate live mode has credentials
    if (mode === "live") {
      const creds = await getCredentials();
      if (!creds.isConfigured) {
        return { success: false, error: "No trading credentials configured." };
      }
    }

    // Determine interval from graph
    let intervalMs = body.intervalMs || 15_000;
    for (const node of graph.nodes) {
      if (node.type === BlockType.IntervalTrigger && node.config.intervalMs) {
        intervalMs = Math.max(5000, Number(node.config.intervalMs));
        break;
      }
    }

    scheduler.start(graph, intervalMs, mode as "paper" | "live");
    return { success: true, strategyId: graph.id, mode, intervalMs };
  });

  // ── Stop a scheduled strategy ─────────────────────────────────────────────
  app.post("/schedule/stop", async (request) => {
    const body = request.body as { strategyId: string };
    scheduler.stop(body.strategyId);
    return { success: true };
  });

  // ── Get status of a scheduled strategy ────────────────────────────────────
  app.get<{ Params: { strategyId: string } }>(
    "/schedule/status/:strategyId",
    async (request) => {
      const { strategyId } = request.params;
      const status = scheduler.getStatus(strategyId);
      return { running: !!status, ...status };
    },
  );

  // ── Get all running strategies ────────────────────────────────────────────
  app.get("/schedule/running", async () => {
    return { strategies: scheduler.getAllRunning() };
  });

  // ── Get execution logs for a strategy ─────────────────────────────────────
  app.get<{ Params: { strategyId: string } }>(
    "/logs/:strategyId",
    async (request) => {
      const { strategyId } = request.params;
      return {
        logs: executionLogs.get(strategyId) || [],
      };
    },
  );

  // ── Clear logs ────────────────────────────────────────────────────────────
  app.delete<{ Params: { strategyId: string } }>(
    "/logs/:strategyId",
    async (request) => {
      const { strategyId } = request.params;
      executionLogs.delete(strategyId);
      return { cleared: true };
    },
  );
}
