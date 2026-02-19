import test from "node:test";
import assert from "node:assert/strict";
import { StrategyStatus } from "@polyblocks/types";
import { useEditorStore } from "../apps/web/src/stores/editorStore";

test("onConnect creates custom, animated edges", () => {
  useEditorStore.setState({ nodes: [], edges: [] });

  useEditorStore.getState().onConnect({
    source: "a",
    target: "b",
    sourceHandle: "out",
    targetHandle: "in",
  } as never);

  const edges = useEditorStore.getState().edges;
  assert.equal(edges.length, 1);
  assert.equal(edges[0].type, "custom");
  assert.equal(edges[0].animated, true);
});

test("loadStrategy hydrates edges as custom, animated edges", () => {
  const graph = {
    id: "s1",
    name: "Test",
    status: StrategyStatus.Draft,
    nodes: [],
    edges: [
      {
        id: "e1",
        source: "a",
        sourceHandle: "out",
        target: "b",
        targetHandle: "in",
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: "",
    version: 1,
  };

  useEditorStore.getState().loadStrategy(graph as never);

  const edges = useEditorStore.getState().edges;
  assert.equal(edges.length, 1);
  assert.equal(edges[0].type, "custom");
  assert.equal(edges[0].animated, true);
});

