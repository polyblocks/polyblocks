/**
 * Editor Zustand store — single source of truth for the canvas state.
 * React Flow nodes/edges, selected node, strategy metadata, logs.
 */

import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Node, Edge, OnNodesChange, OnEdgesChange, Connection } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges, addEdge } from "@xyflow/react";
import {
  type StrategyGraph,
  type StrategyNode,
  type StrategyEdge,
  type ExecutionLog,
  type PaperTrade,
  type PaperPosition,
  type ValidationIssue,
  StrategyStatus,
  BlockType,
  BLOCK_REGISTRY,
  PortType,
} from "@polyblocks/types";
import { validateStrategy } from "@polyblocks/engine-core";

// ─── Saved Strategy Library ─────────────────────────────────────────────────

export interface SavedStrategy {
  id: string;
  name: string;
  description: string;
  graph: StrategyGraph;
  savedAt: string;
  updatedAt: string;
}

const LIBRARY_KEY = "polyblocks_library";

function loadLibraryFromStorage(): SavedStrategy[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? (JSON.parse(raw) as SavedStrategy[]) : [];
  } catch {
    return [];
  }
}

function saveLibraryToStorage(lib: SavedStrategy[]) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
}

// Persistent abort controller for continuous run
let runAbortController: AbortController | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function strategyNodeToFlow(sn: StrategyNode): Node {
  return {
    id: sn.id,
    type: "polyblock",
    position: sn.position,
    data: {
      blockType: sn.type,
      config: sn.config,
      label: sn.label,
    },
  };
}

function flowToStrategyNode(fn: Node): StrategyNode {
  return {
    id: fn.id,
    type: fn.data.blockType as BlockType,
    position: fn.position,
    config: fn.data.config as Record<string, unknown>,
    label: fn.data.label as string | undefined,
  };
}

function strategyEdgeToFlow(se: StrategyEdge): Edge {
  return {
    id: se.id,
    source: se.source,
    sourceHandle: se.sourceHandle,
    target: se.target,
    targetHandle: se.targetHandle,
    type: "smoothstep",
    animated: true,
  };
}

function flowToStrategyEdge(fe: Edge): StrategyEdge {
  return {
    id: fe.id,
    source: fe.source,
    sourceHandle: fe.sourceHandle ?? "",
    target: fe.target,
    targetHandle: fe.targetHandle ?? "",
  };
}

// ─── Store Interface ────────────────────────────────────────────────────────

interface EditorState {
  // Strategy metadata
  strategyId: string;
  strategyName: string;
  strategyStatus: StrategyStatus;

  // React Flow state
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;

  // Validation
  validationIssues: ValidationIssue[];

  // Execution logs
  logs: ExecutionLog[];

  // Paper trading
  trades: PaperTrade[];
  positions: PaperPosition[];

  // UI state
  showLogDrawer: boolean;
  showPropertiesPanel: boolean;
  showTradesPanel: boolean;
  bottomTab: "logs" | "trades" | "positions";
  isRunning: boolean;
  runIteration: number;
  runError: string | null;
  runMode: "paper" | "live";

  // Strategy library
  savedStrategies: SavedStrategy[];

  // Actions
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  addNode: (blockType: BlockType, position: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  updateNodeLabel: (nodeId: string, label: string) => void;

  setStrategyName: (name: string) => void;

  validate: () => ValidationIssue[];

  // Serialization
  toStrategyGraph: () => StrategyGraph;
  loadStrategy: (graph: StrategyGraph) => void;
  newStrategy: () => void;

  // Export
  exportJson: () => string;
  importJson: (json: string) => void;

  // Execution
  paperRun: () => Promise<void>;
  stopRun: () => void;
  fireManualTrigger: () => Promise<void>;
  setRunMode: (mode: "paper" | "live") => void;

  // Strategy library
  saveStrategy: (description?: string) => void;
  loadSavedStrategies: () => void;
  deleteSavedStrategy: (id: string) => void;
  renameSavedStrategy: (id: string, name: string) => void;
  loadFromLibrary: (id: string) => void;

  // Logs
  addLog: (log: ExecutionLog) => void;
  clearLogs: () => void;
  toggleLogDrawer: () => void;
  togglePropertiesPanel: () => void;
  toggleTradesPanel: () => void;
  setBottomTab: (tab: "logs" | "trades" | "positions") => void;
  clearTrades: () => void;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>((set, get) => ({
  strategyId: nanoid(),
  strategyName: "Untitled Strategy",
  strategyStatus: StrategyStatus.Draft,

  nodes: [],
  edges: [],
  selectedNodeId: null,

  validationIssues: [],
  logs: [],
  trades: [],
  positions: [],
  showLogDrawer: false,
  showPropertiesPanel: true,
  showTradesPanel: false,
  bottomTab: "logs" as const,
  isRunning: false,
  runIteration: 0,
  runError: null,
  runMode: "paper" as const,
  savedStrategies: loadLibraryFromStorage(),

  // ── React Flow callbacks ──────────────────────────────────────────────────

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    // Validate port types before connecting
    const { nodes } = get();
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    if (sourceNode && targetNode) {
      const sourceDef = BLOCK_REGISTRY[sourceNode.data.blockType as BlockType];
      const targetDef = BLOCK_REGISTRY[targetNode.data.blockType as BlockType];

      if (sourceDef && targetDef) {
        const sourcePort = sourceDef.outputs.find(
          (p) => p.id === connection.sourceHandle,
        );
        const targetPort = targetDef.inputs.find(
          (p) => p.id === connection.targetHandle,
        );

        if (sourcePort && targetPort) {
          const compatible =
            sourcePort.type === targetPort.type ||
            sourcePort.type === PortType.Any ||
            targetPort.type === PortType.Any ||
            (sourcePort.type === PortType.Signal &&
              targetPort.type === PortType.Boolean);

          if (!compatible) return; // Reject incompatible connection
        }
      }
    }

    set({ edges: addEdge({ ...connection, type: "smoothstep", animated: true }, get().edges) });
  },

  // ── Node operations ───────────────────────────────────────────────────────

  addNode: (blockType, position) => {
    const def = BLOCK_REGISTRY[blockType];
    if (!def) return;

    const id = `node_${nanoid(8)}`;
    const newNode: Node = {
      id,
      type: "polyblock",
      position,
      data: {
        blockType,
        config: { ...def.defaultConfig },
        label: undefined,
      },
    };

    set({ nodes: [...get().nodes, newNode] });
  },

  removeNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId,
      ),
      selectedNodeId:
        get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    });
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  updateNodeConfig: (nodeId, config) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, config: { ...(n.data.config as Record<string, unknown>), ...config } } }
          : n,
      ),
    });
  },

  updateNodeLabel: (nodeId, label) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
      ),
    });
  },

  setStrategyName: (name) => {
    set({ strategyName: name });
  },

  // ── Validation ────────────────────────────────────────────────────────────

  validate: () => {
    const graph = get().toStrategyGraph();
    const issues = validateStrategy(graph);
    set({ validationIssues: issues });
    return issues;
  },

  // ── Serialization ─────────────────────────────────────────────────────────

  toStrategyGraph: () => {
    const { strategyId, strategyName, strategyStatus, nodes, edges } = get();
    return {
      id: strategyId,
      name: strategyName,
      nodes: nodes.map(flowToStrategyNode),
      edges: edges.map(flowToStrategyEdge),
      status: strategyStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: "",
      version: 1,
    };
  },

  loadStrategy: (graph) => {
    set({
      strategyId: graph.id,
      strategyName: graph.name,
      strategyStatus: graph.status,
      nodes: graph.nodes.map(strategyNodeToFlow),
      edges: graph.edges.map(strategyEdgeToFlow),
      selectedNodeId: null,
      validationIssues: [],
    });
  },

  newStrategy: () => {
    set({
      strategyId: nanoid(),
      strategyName: "Untitled Strategy",
      strategyStatus: StrategyStatus.Draft,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      validationIssues: [],
      logs: [],
      trades: [],
      positions: [],
    });
  },

  exportJson: () => {
    const graph = get().toStrategyGraph();
    return JSON.stringify(graph, null, 2);
  },

  importJson: (json) => {
    try {
      const graph = JSON.parse(json) as StrategyGraph;
      get().loadStrategy(graph);
    } catch (e) {
      console.error("Failed to import strategy JSON:", e);
    }
  },

  // ── Execution ────────────────────────────────────────────────────────────

  paperRun: async () => {
    // If already running, do nothing
    if (get().isRunning) return;

    const graph = get().toStrategyGraph();

    // Quick validate first
    const issues = get().validate();
    const hasErrors = issues.some((i) => i.severity === "error");
    if (hasErrors) {
      set({ runError: "Fix validation errors before running." });
      return;
    }

    // Create abort controller for this run
    runAbortController = new AbortController();
    const signal = runAbortController.signal;

    set({ isRunning: true, runIteration: 0, runError: null, showLogDrawer: true });

    // Determine interval from graph — look for IntervalTrigger config
    let intervalMs = 15_000; // default 15s
    for (const node of graph.nodes) {
      if (node.type === BlockType.IntervalTrigger && node.config.intervalMs) {
        intervalMs = Math.max(5000, Number(node.config.intervalMs));
        break;
      }
    }

    // Continuous loop
    while (!signal.aborted) {
      try {
        const currentGraph = get().toStrategyGraph();
        const res = await fetch("/api/execution/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...currentGraph, mode: get().runMode }),
          signal,
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API error ${res.status}: ${text}`);
        }

        const data = await res.json() as { result: ExecutionLog; logs: Array<{ nodeId: string; message: string; data?: unknown }> };
        get().addLog(data.result);
        set({ runIteration: get().runIteration + 1 });

        // Extract paper trades from PlaceOrder node results
        const newTrades: PaperTrade[] = [];
        for (const nr of data.result.nodeResults) {
          if (nr.status !== "completed" || !nr.output) continue;
          const order = nr.output.order as {
            id?: string;
            side?: string;
            price?: number;
            size?: number;
            tokenId?: string;
            conditionId?: string;
            filled?: boolean;
          } | undefined;
          if (!order) continue;

          newTrades.push({
            id: order.id || `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            strategyId: currentGraph.id,
            marketConditionId: String(order.conditionId || ""),
            tokenId: String(order.tokenId || ""),
            side: (order.side as "BUY" | "SELL") || "BUY",
            price: order.price || 0,
            size: order.size || 0,
            executedAt: new Date().toISOString(),
            originNodeId: nr.nodeId,
          });
        }

        if (newTrades.length > 0) {
          const prevTrades = get().trades;
          const allTrades = [...newTrades, ...prevTrades].slice(0, 500);

          // Build positions from all trades
          const posMap = new Map<string, PaperPosition>();
          for (const t of [...allTrades].reverse()) {
            const key = `${t.marketConditionId}_${t.tokenId}`;
            const existing = posMap.get(key);
            const sizeChange = t.side === "BUY" ? t.size : -t.size;

            if (existing) {
              const newSize = existing.size + sizeChange;
              if (Math.abs(newSize) < 0.001) {
                posMap.delete(key);
              } else {
                existing.size = newSize;
                existing.avgEntryPrice = (existing.avgEntryPrice + t.price) / 2;
              }
            } else if (sizeChange > 0) {
              posMap.set(key, {
                strategyId: t.strategyId,
                marketConditionId: t.marketConditionId,
                tokenId: t.tokenId,
                side: t.side === "BUY" ? "YES" : "NO",
                size: sizeChange,
                avgEntryPrice: t.price,
                currentPrice: t.price,
                unrealizedPnl: 0,
                openedAt: t.executedAt,
              });
            }
          }

          set({
            trades: allTrades,
            positions: Array.from(posMap.values()),
            showTradesPanel: true,
            bottomTab: "trades",
          });
        }

        // Wait for interval before next iteration
        if (!signal.aborted) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, intervalMs);
            signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
          });
        }
      } catch (err) {
        if (signal.aborted) break; // User stopped — not an error
        set({ runError: err instanceof Error ? err.message : String(err) });
        break;
      }
    }

    set({ isRunning: false });
    runAbortController = null;
  },

  stopRun: () => {
    if (runAbortController) {
      runAbortController.abort();
      runAbortController = null;
    }
    set({ isRunning: false });
  },

  fireManualTrigger: async () => {
    const graph = get().toStrategyGraph();
    const issues = get().validate();
    const hasErrors = issues.some((i) => i.severity === "error");
    if (hasErrors) {
      set({ runError: "Fix validation errors before firing." });
      return;
    }

    set({ showLogDrawer: true, bottomTab: "logs" });

    try {
      const res = await fetch("/api/execution/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...graph, mode: get().runMode }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error ${res.status}: ${text}`);
      }

      const data = await res.json() as { result: ExecutionLog; logs: Array<{ nodeId: string; message: string; data?: unknown }> };
      get().addLog(data.result);

      // Extract paper trades from PlaceOrder results
      const newTrades: PaperTrade[] = [];
      for (const nr of data.result.nodeResults) {
        if (nr.status !== "completed" || !nr.output) continue;
        const order = nr.output.order as {
          id?: string;
          side?: string;
          price?: number;
          size?: number;
          tokenId?: string;
          conditionId?: string;
          filled?: boolean;
        } | undefined;
        if (!order) continue;

        newTrades.push({
          id: order.id || `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          strategyId: graph.id,
          marketConditionId: String(order.conditionId || ""),
          tokenId: String(order.tokenId || ""),
          side: (order.side as "BUY" | "SELL") || "BUY",
          price: order.price || 0,
          size: order.size || 0,
          executedAt: new Date().toISOString(),
          originNodeId: nr.nodeId,
        });
      }

      if (newTrades.length > 0) {
        const allTrades = [...newTrades, ...get().trades].slice(0, 500);
        set({ trades: allTrades, bottomTab: "trades" });
      }
    } catch (err) {
      set({ runError: err instanceof Error ? err.message : String(err) });
    }
  },

  setRunMode: (mode) => {
    if (get().isRunning) return; // Can't change mode while running
    // Enforce tier restriction: free users cannot switch to live mode
    if (mode === "live") {
      // Lazy import to avoid circular dependency
      import("./authStore").then(({ useAuthStore }) => {
        if (useAuthStore.getState().canLiveTrade()) {
          set({ runMode: mode });
        }
      }).catch(() => {
        // Auth store not available — block live mode
      });
      return;
    }
    set({ runMode: mode });
  },

  // ── Strategy Library ──────────────────────────────────────────────────────

  saveStrategy: (description?: string) => {
    const graph = get().toStrategyGraph();
    const lib = loadLibraryFromStorage();
    const existing = lib.findIndex((s) => s.id === graph.id);
    const entry: SavedStrategy = {
      id: graph.id,
      name: graph.name,
      description: description || "",
      graph,
      savedAt: existing >= 0 ? lib[existing].savedAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (existing >= 0) {
      lib[existing] = entry;
    } else {
      lib.unshift(entry);
    }
    saveLibraryToStorage(lib);
    set({ savedStrategies: lib });
  },

  loadSavedStrategies: () => {
    set({ savedStrategies: loadLibraryFromStorage() });
  },

  deleteSavedStrategy: (id) => {
    const lib = loadLibraryFromStorage().filter((s) => s.id !== id);
    saveLibraryToStorage(lib);
    set({ savedStrategies: lib });
  },

  renameSavedStrategy: (id, name) => {
    const lib = loadLibraryFromStorage();
    const entry = lib.find((s) => s.id === id);
    if (entry) {
      entry.name = name;
      entry.graph.name = name;
      entry.updatedAt = new Date().toISOString();
      saveLibraryToStorage(lib);
      set({ savedStrategies: [...lib] });
    }
  },

  loadFromLibrary: (id) => {
    const lib = loadLibraryFromStorage();
    const entry = lib.find((s) => s.id === id);
    if (entry) {
      get().loadStrategy(entry.graph);
    }
  },

  // ── Logs ──────────────────────────────────────────────────────────────────

  addLog: (log) => {
    set({ logs: [...get().logs, log].slice(-100) });
  },

  clearLogs: () => {
    set({ logs: [] });
  },

  toggleLogDrawer: () => {
    set({ showLogDrawer: !get().showLogDrawer });
  },

  togglePropertiesPanel: () => {
    set({ showPropertiesPanel: !get().showPropertiesPanel });
  },

  toggleTradesPanel: () => {
    set({ showTradesPanel: !get().showTradesPanel });
  },

  setBottomTab: (tab) => {
    set({ bottomTab: tab });
  },

  clearTrades: () => {
    set({ trades: [], positions: [] });
  },
}));
