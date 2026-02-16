/**
 * Strategy CRUD routes — save, load, list, delete strategies.
 * Persisted to MongoDB (strategies collection).  Each strategy belongs to a userId.
 */

import type { FastifyInstance } from "fastify";
import type { StrategyGraph } from "@polyblocks/types";
import { nanoid } from "nanoid";
import { strategiesCol } from "../db.js";

export async function registerStrategyRoutes(app: FastifyInstance) {

  // ── List all strategies (optionally filter by userId query param) ────────
  app.get("/", async (req) => {
    const { userId } = req.query as { userId?: string };
    const filter = userId ? { userId } : {};
    const docs = await strategiesCol().find(filter).sort({ updatedAt: -1 }).toArray();

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
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const doc = await strategiesCol().findOne({ _id: id });
    if (!doc) return reply.status(404).send({ error: "Strategy not found" });

    // Return in StrategyGraph-compatible shape
    return { ...doc, id: doc._id };
  });

  // ── Create / save a strategy ─────────────────────────────────────────────
  app.post("/", async (request) => {
    const body = request.body as StrategyGraph & { userId?: string };
    const id = body.id || nanoid();
    const now = new Date().toISOString();

    const doc = {
      _id: id,
      userId: body.userId || "anonymous",
      name: body.name || "Untitled Strategy",
      description: (body as Record<string, unknown>).description as string || "",
      nodes: body.nodes || [],
      edges: body.edges || [],
      status: body.status || "draft",
      version: body.version || 1,
      createdAt: body.createdAt || now,
      updatedAt: now,
    };

    await strategiesCol().updateOne(
      { _id: id },
      { $set: doc },
      { upsert: true },
    );

    return { id, saved: true };
  });

  // ── Update a strategy ────────────────────────────────────────────────────
  app.put<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = await strategiesCol().findOne({ _id: id });
    if (!existing) return reply.status(404).send({ error: "Strategy not found" });

    const body = request.body as Partial<StrategyGraph>;
    const { id: _stripId, ...updates } = body as Record<string, unknown>;

    await strategiesCol().updateOne(
      { _id: id },
      { $set: { ...updates, updatedAt: new Date().toISOString() } },
    );

    return { id, updated: true };
  });

  // ── Delete a strategy ────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const result = await strategiesCol().deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return reply.status(404).send({ error: "Strategy not found" });
    }
    return { id, deleted: true };
  });
}
