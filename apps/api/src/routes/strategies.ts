/**
 * Strategy CRUD routes — save, load, list, delete strategies.
 * Persisted to MongoDB (strategies collection).  Each strategy belongs to a userId.
 */

import type { FastifyInstance } from "fastify";
import type { StrategyGraph } from "@polyblocks/types";
import { nanoid } from "nanoid";
import { ObjectId } from "mongodb";
import { sessionsCol, strategiesCol } from "../db.js";

function getSessionToken(headers: Record<string, unknown>): string {
  const token = headers["x-session-token"];
  return typeof token === "string" ? token : "";
}

async function resolveSession(token: string): Promise<string | null> {
  if (!token) return null;
  const session = await sessionsCol().findOne({ _id: token });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await sessionsCol().deleteOne({ _id: token });
    return null;
  }
  return session.userId;
}

function strategyIdFilter(id: string, userId: string): Record<string, unknown> {
  const clauses: Array<Record<string, unknown>> = [{ _id: id, userId }];
  if (ObjectId.isValid(id)) {
    clauses.push({ _id: new ObjectId(id), userId });
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

export async function registerStrategyRoutes(app: FastifyInstance) {

  // ── List all strategies (optionally filter by userId query param) ────────
  app.get("/", async (req, reply) => {
    const token = getSessionToken(req.headers as Record<string, unknown>);
    const userId = await resolveSession(token);
    if (!userId) return reply.code(401).send({ error: "Not authenticated" });
    const docs = await strategiesCol().find({ userId }).sort({ updatedAt: -1 }).toArray();

    return {
      strategies: docs.map((s) => ({
        id: String(s._id),
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
    const token = getSessionToken(request.headers as Record<string, unknown>);
    const userId = await resolveSession(token);
    if (!userId) return reply.code(401).send({ error: "Not authenticated" });
    const { id } = request.params;
    const doc = await strategiesCol().findOne(strategyIdFilter(id, userId) as any);
    if (!doc) return reply.status(404).send({ error: "Strategy not found" });

    // Return in StrategyGraph-compatible shape
    return { ...doc, id: doc._id };
  });

  // ── Create / save a strategy ─────────────────────────────────────────────
  app.post("/", async (request, reply) => {
    const token = getSessionToken(request.headers as Record<string, unknown>);
    const userId = await resolveSession(token);
    if (!userId) return reply.code(401).send({ error: "Not authenticated" });
    const body = request.body as StrategyGraph & { userId?: string };
    const id = body.id || nanoid();
    const now = new Date().toISOString();

    const doc = {
      _id: id,
      userId,
      name: body.name || "Untitled Strategy",
      description: (body as unknown as Record<string, unknown>).description as string || "",
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
    const token = getSessionToken(request.headers as Record<string, unknown>);
    const userId = await resolveSession(token);
    if (!userId) return reply.code(401).send({ error: "Not authenticated" });
    const { id } = request.params;
    const filter = strategyIdFilter(id, userId);
    const existing = await strategiesCol().findOne(filter as any);
    if (!existing) return reply.status(404).send({ error: "Strategy not found" });

    const body = request.body as Partial<StrategyGraph>;
    const { id: _stripId, ...updates } = body as Record<string, unknown>;

    await strategiesCol().updateOne(filter as any, { $set: { ...updates, updatedAt: new Date().toISOString() } });

    return { id, updated: true };
  });

  // ── Delete a strategy ────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const token = getSessionToken(request.headers as Record<string, unknown>);
    const userId = await resolveSession(token);
    if (!userId) return reply.code(401).send({ error: "Not authenticated" });
    const { id } = request.params;
    const result = await strategiesCol().deleteOne(strategyIdFilter(id, userId) as any);
    if (result.deletedCount === 0) {
      return reply.status(404).send({ error: "Strategy not found" });
    }
    return { id, deleted: true };
  });
}
