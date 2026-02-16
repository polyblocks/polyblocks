/**
 * Polyblocks API Server
 * Fastify + WebSocket + BullMQ scheduler
 */

import { resolve } from "path";
import { config } from "dotenv";

// Load .env from the monorepo root
config({ path: resolve(import.meta.dirname, "../../../.env"), override: true });

import Fastify from "fastify";
import cors from "@fastify/cors";
import { connectDb } from "./db";
import { registerStrategyRoutes } from "./routes/strategies";
import { registerMarketRoutes } from "./routes/markets";
import { registerExecutionRoutes } from "./routes/execution";
import { registerCredentialRoutes } from "./routes/credentials";
import { registerAuthRoutes } from "./routes/auth";

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

async function main() {
  const app = Fastify({
    logger: true,
  });

  // ── Plugins ─────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  });

  // ── Connect to MongoDB ──────────────────────────────────────────────────
  await connectDb();

  // ── Routes ──────────────────────────────────────────────────────────────
  await app.register(registerStrategyRoutes, { prefix: "/api/strategies" });
  await app.register(registerMarketRoutes, { prefix: "/api/markets" });
  await app.register(registerExecutionRoutes, { prefix: "/api/execution" });
  await app.register(registerCredentialRoutes, { prefix: "/api/credentials" });
  await app.register(registerAuthRoutes, { prefix: "/api/auth" });

  // ── Health ──────────────────────────────────────────────────────────────
  app.get("/api/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  // ── Start ───────────────────────────────────────────────────────────────
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Polyblocks API running at http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
