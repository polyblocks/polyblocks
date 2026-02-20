/**
 * Polyblocks API Server
 * Fastify + WebSocket + BullMQ scheduler
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { config } from "dotenv";
// Load .env in development (production sets env vars directly)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, "../../../.env");
if (existsSync(envPath)) {
    config({ path: envPath, override: true });
}
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifyRateLimit from "@fastify/rate-limit";
import { connectDb } from "./db.js";
import { registerStrategyRoutes } from "./routes/strategies.js";
import { registerMarketRoutes } from "./routes/markets.js";
import { registerExecutionRoutes } from "./routes/execution.js";
import { registerCredentialRoutes } from "./routes/credentials.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerContactRoutes } from "./routes/contact.js";
import { registerPositionRoutes } from "./routes/positions.js";
import { registerPaperTradeRoutes } from "./routes/paperTrades.js";
import { registerMarketplaceRoutes } from "./routes/marketplace.js";
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";
const IS_PROD = process.env.NODE_ENV === "production";
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
    await app.register(fastifyRateLimit, {
        max: 1000, // global limit
        timeWindow: '1 minute'
    });
    // ── Connect to MongoDB ──────────────────────────────────────────────────
    await connectDb();
    // ── Routes ──────────────────────────────────────────────────────────────
    await app.register(registerStrategyRoutes, { prefix: "/api/strategies" });
    await app.register(registerMarketRoutes, { prefix: "/api/markets" });
    await app.register(registerExecutionRoutes, { prefix: "/api/execution" });
    await app.register(registerCredentialRoutes, { prefix: "/api/credentials" });
    await app.register(registerAuthRoutes, { prefix: "/api/auth" });
    await app.register(registerAiRoutes, { prefix: "/api/ai" });
    await app.register(registerContactRoutes, { prefix: "/api/contact" });
    await app.register(registerPositionRoutes, { prefix: "/api/positions" });
    await app.register(registerPaperTradeRoutes, { prefix: "/api/paper-trades" });
    await app.register(registerMarketplaceRoutes, { prefix: "/api/marketplace" });
    // ── Health ──────────────────────────────────────────────────────────────
    app.get("/api/health", async () => ({
        status: "ok",
        timestamp: new Date().toISOString(),
    }));
    // ── Serve frontend in production ────────────────────────────────────────
    const webDist = resolve(__dirname, "../../web/dist");
    if (IS_PROD && existsSync(webDist)) {
        await app.register(fastifyStatic, {
            root: webDist,
            prefix: "/",
            wildcard: false,
        });
        // SPA fallback — serve index.html for all non-API routes
        app.setNotFoundHandler(async (req, reply) => {
            if (req.url.startsWith("/api/")) {
                return reply.code(404).send({ error: "Not found" });
            }
            return reply.sendFile("index.html");
        });
    }
    // ── Start ───────────────────────────────────────────────────────────────
    try {
        await app.listen({ port: PORT, host: HOST });
        app.log.info(`Polyblocks API running at http://${HOST}:${PORT}`);
    }
    catch (err) {
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
//# sourceMappingURL=server.js.map