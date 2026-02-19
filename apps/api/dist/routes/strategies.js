/**
 * Strategy CRUD routes — save, load, list, delete strategies.
 * Persisted to MongoDB (strategies collection).  Each strategy belongs to a userId.
 */
import { nanoid } from "nanoid";
import { sessionsCol, strategiesCol } from "../db.js";
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
export async function registerStrategyRoutes(app) {
    // ── List all strategies (optionally filter by userId query param) ────────
    app.get("/", async (req, reply) => {
        const token = getSessionToken(req.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const docs = await strategiesCol().find({ userId }).sort({ updatedAt: -1 }).toArray();
        return {
            strategies: docs.map((s) => ({
                id: s._id,
                name: s.name,
                description: s.description,
                status: s.status,
                nodeCount: Array.isArray(s.nodes) ? s.nodes.length : 0,
                edgeCount: Array.isArray(s.edges) ? s.edges.length : 0,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
            })),
        };
    });
    // ── Get a single strategy ────────────────────────────────────────────────
    app.get("/:id", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const { id } = request.params;
        const doc = await strategiesCol().findOne({ _id: id, userId });
        if (!doc)
            return reply.status(404).send({ error: "Strategy not found" });
        // Return in StrategyGraph-compatible shape
        return { ...doc, id: doc._id };
    });
    // ── Create / save a strategy ─────────────────────────────────────────────
    app.post("/", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const body = request.body;
        const id = body.id || nanoid();
        const now = new Date().toISOString();
        const doc = {
            _id: id,
            userId,
            name: body.name || "Untitled Strategy",
            description: body.description || "",
            nodes: body.nodes || [],
            edges: body.edges || [],
            status: body.status || "draft",
            version: body.version || 1,
            createdAt: body.createdAt || now,
            updatedAt: now,
        };
        await strategiesCol().updateOne({ _id: id }, { $set: doc }, { upsert: true });
        return { id, saved: true };
    });
    // ── Update a strategy ────────────────────────────────────────────────────
    app.put("/:id", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const { id } = request.params;
        const existing = await strategiesCol().findOne({ _id: id, userId });
        if (!existing)
            return reply.status(404).send({ error: "Strategy not found" });
        const body = request.body;
        const { id: _stripId, ...updates } = body;
        await strategiesCol().updateOne({ _id: id, userId }, { $set: { ...updates, updatedAt: new Date().toISOString() } });
        return { id, updated: true };
    });
    // ── Delete a strategy ────────────────────────────────────────────────────
    app.delete("/:id", async (request, reply) => {
        const token = getSessionToken(request.headers);
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const { id } = request.params;
        const result = await strategiesCol().deleteOne({ _id: id, userId });
        if (result.deletedCount === 0) {
            return reply.status(404).send({ error: "Strategy not found" });
        }
        return { id, deleted: true };
    });
}
//# sourceMappingURL=strategies.js.map