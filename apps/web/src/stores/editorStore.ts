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
  NodeCategory,
  PortType,
} from "@polyblocks/types";
import { validateStrategy } from "@polyblocks/engine-core";
import { useAuthStore } from "./authStore";

// ─── Saved Strategy Library ─────────────────────────────────────────────────

export interface SavedStrategy {
  id: string;
  name: string;
  description: string;
  graph: StrategyGraph;
  savedAt: string;
  updatedAt: string;
}

// ─── API helpers (userId from auth store) ───────────────────────────────────

function getUserId(): string {
  return useAuthStore.getState().user?.id || "anonymous";
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["x-session-token"] = token;
  return h;
}

// Persistent abort controller for continuous run
let runAbortController: AbortController | null = null;

// ─── PnL Helpers ────────────────────────────────────────────────────────────

const CLOB_HOST = "https://clob.polymarket.com";

/**
 * Fetch current midpoint prices for all open positions and compute unrealized PnL.
 * PnL for a long (BUY) position: (currentPrice - avgEntryPrice) × size
 * Uses the CLOB midpoint API.
 */
async function updatePositionPrices(positions: PaperPosition[]): Promise<void> {
  // Deduplicate token IDs to avoid redundant fetches
  const uniqueTokenIds = [...new Set(positions.map((p) => p.tokenId).filter(Boolean))];
  const priceMap = new Map<string, number>();

  await Promise.all(
    uniqueTokenIds.map(async (tokenId) => {
      try {
        const res = await fetch(`${CLOB_HOST}/midpoint?token_id=${tokenId}`);
        if (res.ok) {
          const data = (await res.json()) as { mid: string };
          priceMap.set(tokenId, parseFloat(data.mid));
        }
      } catch {
        // Keep existing price on failure
      }
    }),
  );

  for (const pos of positions) {
    const currentPrice = priceMap.get(pos.tokenId);
    if (currentPrice !== undefined) {
      pos.currentPrice = currentPrice;
      // PnL = (currentPrice - avgEntry) × shares
      pos.unrealizedPnl = (currentPrice - pos.avgEntryPrice) * pos.size;
    }
  }
}

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
    type: "custom",
  };
}

const MIN_EDGE_ANIMATION_MS = 150;
const DEFAULT_EDGE_ANIMATION_MS = 1000;

function hasSignalInput(def?: { inputs: Array<{ id: string; type: string }> }) {
  if (!def) return false;
  return def.inputs.some(
    (p) => p.type === PortType.Signal || p.id === "signal" || p.id === "trigger",
  );
}

function isContinuousDataSource(def?: { category?: NodeCategory; inputs: Array<{ id: string; type: string }> }) {
  if (!def) return false;
  const isDataLike =
    def.category === NodeCategory.Data || def.category === NodeCategory.Market;
  return isDataLike && !hasSignalInput(def);
}

function getIntervalDurationMs(node?: Node) {
  if (!node) return DEFAULT_EDGE_ANIMATION_MS;
  const raw = Number((node.data as { config?: Record<string, unknown> })?.config?.intervalMs);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_EDGE_ANIMATION_MS;
  return Math.max(MIN_EDGE_ANIMATION_MS, raw);
}

function applyEdgeVisuals(edge: Edge, nodes: Node[]): Edge {
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const sourceType = sourceNode?.data?.blockType as BlockType | undefined;
  const sourceDef = sourceType ? BLOCK_REGISTRY[sourceType] : undefined;
  const continuous = isContinuousDataSource(sourceDef);
  const isInterval = sourceType === BlockType.IntervalTrigger;
  const isTrigger = sourceDef?.category === NodeCategory.Trigger;

  let animated = true;
  let className: string | undefined;
  let animationDurationMs = DEFAULT_EDGE_ANIMATION_MS;

  if (continuous) {
    animated = false;
    className = "edge-continuous";
  } else if (isTrigger) {
    animated = true;
    className = isInterval ? "edge-interval" : "edge-trigger";
    animationDurationMs = isInterval ? getIntervalDurationMs(sourceNode) : DEFAULT_EDGE_ANIMATION_MS;
  }

  return {
    ...edge,
    animated,
    className,
    data: {
      ...(edge.data as Record<string, unknown>),
      animationDurationMs,
    },
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
  selectedEdgeId: string | null;
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
  selectEdge: (edgeId: string | null) => void;
  removeEdge: (edgeId: string) => void;
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
  startBackground: () => Promise<void>;
  stopBackground: () => Promise<void>;

  // Strategy library
  saveStrategy: (description?: string) => Promise<void>;
  loadSavedStrategies: () => Promise<void>;
  deleteSavedStrategy: (id: string) => Promise<void>;
  renameSavedStrategy: (id: string, name: string) => Promise<void>;
  loadFromLibrary: (id: string) => Promise<void>;

  // Logs
  addLog: (log: ExecutionLog) => void;
  clearLogs: () => void;
  toggleLogDrawer: () => void;
  togglePropertiesPanel: () => void;
  toggleTradesPanel: () => void;
  setBottomTab: (tab: "logs" | "trades" | "positions") => void;
  clearTrades: () => Promise<void>;
}

// ─── Store ──────────────────────────────────────────────────────────────────

const _initialStrategyId = nanoid();

export const useEditorStore = create<EditorState>((set, get) => ({
  strategyId: _initialStrategyId,
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
  selectedEdgeId: null,
  isRunning: false,
  runIteration: 0,
  runError: null,
  runMode: "paper" as const,
  savedStrategies: [],

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

    const nextEdges = addEdge({ ...connection, type: "custom" }, get().edges);
    set({ edges: nextEdges.map((edge) => applyEdgeVisuals(edge, nodes)) });
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
    set({ selectedNodeId: nodeId, selectedEdgeId: null });
  },

  selectEdge: (edgeId) => {
    if (edgeId) {
      set({ selectedEdgeId: edgeId, selectedNodeId: null });
      return;
    }
    set({ selectedEdgeId: null });
  },

  removeEdge: (edgeId) => {
    set({
      edges: get().edges.filter((e) => e.id !== edgeId),
      selectedEdgeId: get().selectedEdgeId === edgeId ? null : get().selectedEdgeId,
    });
  },

  updateNodeConfig: (nodeId, config) => {
    set((state) => {
      const nextNodes = state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, config: { ...(n.data.config as Record<string, unknown>), ...config } } }
          : n,
      );
      return {
        nodes: nextNodes,
        edges: state.edges.map((edge) => applyEdgeVisuals(edge, nextNodes)),
      };
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
    // Stop local polling for the current strategy (server keeps running)
    if (runAbortController) {
      runAbortController.abort();
      runAbortController = null;
    }
    const nextNodes = graph.nodes.map(strategyNodeToFlow);
    const nextEdges = graph.edges.map(strategyEdgeToFlow).map((edge) => applyEdgeVisuals(edge, nextNodes));
    set({
      strategyId: graph.id,
      strategyName: graph.name,
      strategyStatus: graph.status,
      nodes: nextNodes,
      edges: nextEdges,
      selectedNodeId: null,
      validationIssues: [],
      // Reset — will be loaded from API
      logs: [],
      trades: [],
      positions: [],
      // Reset run state — EditorPage useEffect will check server status
      isRunning: false,
      runIteration: 0,
      runError: null,
    });

    // Load trades & logs from API (async, non-blocking)
    if (typeof window !== "undefined") {
      fetch(`/api/paper-trades/${graph.id}`, { headers: authHeaders() })
        .then((r) => {
          if (!r.ok) return { trades: [] };
          return r.json();
        })
        .then((data: { trades: PaperTrade[] }) => {
          if (get().strategyId === graph.id) {
            const trades = data.trades || [];
            const posMap = new Map<string, PaperPosition>();
            for (const t of [...trades].reverse()) {
              const key = `${t.marketConditionId}_${t.tokenId}`;
              const existing = posMap.get(key);
              const sizeChange = t.side === "BUY" ? t.size : -t.size;
              if (existing) {
                const newSize = existing.size + sizeChange;
                if (Math.abs(newSize) < 0.001) {
                  posMap.delete(key);
                } else {
                  if (sizeChange > 0) {
                    existing.avgEntryPrice =
                      (existing.avgEntryPrice * existing.size + t.price * sizeChange) /
                      (existing.size + sizeChange);
                  }
                  existing.size = newSize;
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
            const positionsArr = Array.from(posMap.values());
            updatePositionPrices(positionsArr).then(() => {
              if (get().strategyId === graph.id) {
                set({ trades, positions: positionsArr });
              }
            });
          }
        })
        .catch(() => { });

      fetch(`/api/paper-trades/${graph.id}/logs`, { headers: authHeaders() })
        .then((r) => {
          if (!r.ok) return { logs: [] };
          return r.json();
        })
        .then((data: { logs: ExecutionLog[] }) => {
          if (get().strategyId === graph.id) {
            set({ logs: (data.logs || []).slice(-100) });
          }
        })
        .catch(() => { });
    }
  },

  newStrategy: () => {
    // Stop local polling for the current strategy (server keeps running)
    if (runAbortController) {
      runAbortController.abort();
      runAbortController = null;
    }
    const newId = nanoid();
    set({
      strategyId: newId,
      strategyName: "Untitled Strategy",
      strategyStatus: StrategyStatus.Draft,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      validationIssues: [],
      // Fresh strategy — no data
      logs: [],
      trades: [],
      positions: [],
      isRunning: false,
      runIteration: 0,
      runError: null,
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
    // This is ONLY used as a polling loop — called internally by startBackground.
    // It should NOT set isRunning (startBackground does that).
    const graph = get().toStrategyGraph();
    const capturedStrategyId = graph.id;
    const userId = getUserId();

    // Create abort controller for this run
    runAbortController = new AbortController();
    const signal = runAbortController.signal;



    // ── Poll for server-side results instead of executing orders client-side.
    let lastIteration = -1;
    while (!signal.aborted) {
      // Check if we switched strategies
      if (get().strategyId !== capturedStrategyId) break;

      // Update prices for existing positions (live PnL)
      if (get().positions.length > 0) {
        const currentPositions = get().positions.map((p) => ({ ...p }));
        await updatePositionPrices(currentPositions);
        if (get().strategyId === capturedStrategyId) {
          set({ positions: currentPositions });
        }
      }

      try {
        const res = await fetch(`/api/execution/schedule/status/${capturedStrategyId}`, { signal });
        if (!res.ok) break;
        const data = await res.json() as {
          running: boolean;
          iteration?: number;
          lastResult?: ExecutionLog;
          lastError?: string;
        };

        if (!data.running) break;
        // Check strategy hasn't changed while we waited
        if (get().strategyId !== capturedStrategyId) break;

        if (data.iteration !== undefined && data.iteration !== lastIteration) {
          lastIteration = data.iteration;
          set({ runIteration: data.iteration });

          // Fetch recent logs from the scheduler
          const logsRes = await fetch(`/api/execution/schedule/logs/${capturedStrategyId}`, { signal });
          if (logsRes.ok && get().strategyId === capturedStrategyId) {
            const logsData = await logsRes.json() as { logs: ExecutionLog[] };
            if (logsData.logs.length > 0) {
              const existing = get().logs;
              const existingIds = new Set(existing.map((l) => l.id));
              const newLogs = logsData.logs.filter((l) => !existingIds.has(l.id));
              if (newLogs.length > 0) {
                for (const log of newLogs) {
                  get().addLog(log);
                }
                // Extract trades from new logs
                const newTrades: PaperTrade[] = [];
                for (const log of newLogs) {
                  for (const nr of log.nodeResults) {
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
                      strategyId: capturedStrategyId,
                      marketConditionId: String(order.conditionId || ""),
                      tokenId: String(order.tokenId || ""),
                      side: (order.side as "BUY" | "SELL") || "BUY",
                      price: order.price || 0,
                      size: order.size || 0,
                      executedAt: new Date().toISOString(),
                      originNodeId: nr.nodeId,
                    });
                  }
                }

                if (newTrades.length > 0 && get().strategyId === capturedStrategyId) {
                  const prevTrades = get().trades;
                  const allTrades = [...newTrades, ...prevTrades].slice(0, 500);

                  // Build positions from all trades with proper FIFO accounting
                  const posMap = new Map<string, {
                    strategyId: string;
                    marketConditionId: string;
                    tokenId: string;
                    side: "YES" | "NO";
                    size: number;
                    avgEntryPrice: number;
                    currentPrice: number;
                    unrealizedPnl: number;
                    openedAt: string;
                    totalCost: number;
                  }>();

                  for (const t of [...allTrades].sort((a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime())) {
                    const key = `${t.marketConditionId}_${t.tokenId}`;
                    const isBuy = t.side === "BUY";
                    const existing = posMap.get(key);

                    if (isBuy) {
                      if (!existing) {
                        posMap.set(key, {
                          strategyId: t.strategyId,
                          marketConditionId: t.marketConditionId,
                          tokenId: t.tokenId,
                          side: "YES",
                          size: t.size,
                          avgEntryPrice: t.price,
                          currentPrice: t.price,
                          unrealizedPnl: 0,
                          openedAt: t.executedAt,
                          totalCost: t.price * t.size,
                        });
                      } else {
                        const newTotalCost = existing.totalCost + (t.price * t.size);
                        const newSize = existing.size + t.size;
                        existing.avgEntryPrice = newSize > 0 ? newTotalCost / newSize : 0;
                        existing.size = newSize;
                        existing.totalCost = newTotalCost;
                        existing.openedAt = existing.openedAt;
                      }
                    } else {
                      if (existing) {
                        const costBasis = existing.avgEntryPrice * t.size;
                        
                        existing.size = Math.max(0, existing.size - t.size);
                        existing.totalCost = Math.max(0, existing.totalCost - costBasis);
                        
                        if (existing.size <= 0.001) {
                          posMap.delete(key);
                        }
                      }
                    }
                  }

                  const positionsArr = Array.from(posMap.values()).map(p => ({
                    strategyId: p.strategyId,
                    marketConditionId: p.marketConditionId,
                    tokenId: p.tokenId,
                    side: p.side,
                    size: p.size,
                    avgEntryPrice: p.avgEntryPrice,
                    currentPrice: p.currentPrice,
                    unrealizedPnl: p.unrealizedPnl,
                    openedAt: p.openedAt,
                  }));

                  await updatePositionPrices(positionsArr);
                  
                  if (get().strategyId === capturedStrategyId) {
                    set({
                      trades: allTrades,
                      positions: positionsArr,
                      showTradesPanel: true,
                      bottomTab: "trades",
                    });
                    fetch(`/api/paper-trades/${capturedStrategyId}`, {
                      method: "POST",
                      headers: authHeaders(),
                      body: JSON.stringify({ userId, trades: newTrades }),
                    }).catch(() => { });
                  }
                }
              }
            }
          }
        }

        if (data.lastError) {
          // Parse and format the error message nicely
          let formattedError = data.lastError;
          try {
            const parsed = JSON.parse(data.lastError);
            if (parsed.message) formattedError = parsed.message;
            if (parsed.details) formattedError += `: ${parsed.details}`;
          } catch {
            // Not JSON, use as-is
          }
          set({ runError: `Execution error: ${formattedError}` });
        }

        // Wait before next poll
        if (!signal.aborted) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 5000); // Poll every 5s for UI responsiveness
            signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
          });
        }
      } catch (err) {
        if (signal.aborted) break;
        set({ runError: err instanceof Error ? err.message : String(err) });
        break;
      }
    }

    // Only reset isRunning if we're still on the same strategy
    if (get().strategyId === capturedStrategyId) {
      set({ isRunning: false });
    }
    if (runAbortController?.signal === signal) {
      runAbortController = null;
    }
  },

  stopRun: () => {
    if (runAbortController) {
      runAbortController.abort();
      runAbortController = null;
    }
    set({ isRunning: false });
  },

  fireManualTrigger: async () => {
    // Prevent manual trigger while strategy is already running on the server
    if (get().isRunning) {
      set({ runError: "Strategy is already running. Stop it before firing manually." });
      return;
    }

    const graph = get().toStrategyGraph();
    const userId = getUserId();
    const issues = get().validate();
    const hasErrors = issues.some((i) => i.severity === "error");
    if (hasErrors) {
      // Show detailed validation errors
      const errorMessages = issues
        .filter((i) => i.severity === "error")
        .map((i, idx) => {
          const nodeName = i.nodeId ? (() => {
            const node = get().nodes.find(n => n.id === i.nodeId);
            return node?.data?.label || node?.data?.type || i.nodeId;
          })() : undefined;
          return `${idx + 1}. ${i.message}${nodeName ? ` (Block: ${nodeName})` : ""}`;
        })
        .join("\n");
      set({ runError: `Validation failed:\n\n${errorMessages}` });
      return;
    }

    set({ showLogDrawer: true, bottomTab: "logs" });

    try {
      const res = await fetch("/api/execution/run", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...graph, mode: get().runMode }),
      });

      if (!res.ok) {
        const text = await res.text();
        let errorMessage = `API error ${res.status}`;
        try {
          const json = JSON.parse(text);
          if (json.error) errorMessage = json.error;
        } catch {
          if (text) errorMessage += `: ${text}`;
        }
        throw new Error(errorMessage);
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
        // Persist to MongoDB
        fetch(`/api/paper-trades/${graph.id}`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ userId, trades: newTrades }),
        }).catch(() => { });
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

  // ── Background Server-Side Execution ──────────────────────────────────────

  startBackground: async () => {
    // Prevent double-start
    if (get().isRunning) return;

    const graph = get().toStrategyGraph();
    const issues = get().validate();
    const hasErrors = issues.some((i) => i.severity === "error");
    if (hasErrors) {
      // Show detailed validation errors
      const errorMessages = issues
        .filter((i) => i.severity === "error")
        .map((i, idx) => {
          const nodeName = i.nodeId ? (() => {
            const node = get().nodes.find(n => n.id === i.nodeId);
            return node?.data?.label || node?.data?.type || i.nodeId;
          })() : undefined;
          return `${idx + 1}. ${i.message}${nodeName ? ` (Block: ${nodeName})` : ""}`;
        })
        .join("\n");
      set({ runError: `Cannot start strategy:\n\n${errorMessages}` });
      return;
    }

    try {
      // Check if another strategy is already running on the server
      const runningRes = await fetch("/api/execution/schedule/running", { headers: authHeaders() });
      if (runningRes.ok) {
        const runningData = await runningRes.json() as { strategies: Array<{ strategyId: string; strategyName: string }> };
        const otherRunning = runningData.strategies.find((s) => s.strategyId !== graph.id);
        if (otherRunning) {
          set({ runError: `Another strategy is already running: "${otherRunning.strategyName}". Stop it first.` });
          return;
        }
      }

      const res = await fetch("/api/execution/schedule/start", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...graph, mode: get().runMode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error || "Failed to start");

      // Set running state BEFORE starting poll loop
      set({ isRunning: true, runIteration: 0, runError: null, showLogDrawer: true });

      // Start client-side polling loop (paperRun no longer sets isRunning)
      get().paperRun();
    } catch (err) {
      set({ runError: err instanceof Error ? err.message : String(err) });
    }
  },

  stopBackground: async () => {
    const strategyId = get().strategyId;
    // Stop client-side polling first
    if (runAbortController) {
      runAbortController.abort();
      runAbortController = null;
    }
    // Stop server-side scheduler
    try {
      await fetch("/api/execution/schedule/stop", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ strategyId }),
      });
    } catch {
      // Best effort
    }
    set({ isRunning: false });
  },

  // ── Strategy Library ──────────────────────────────────────────────────────

  saveStrategy: async (description?: string) => {
    const graph = get().toStrategyGraph();
    const userId = getUserId();
    try {
      await fetch("/api/strategies", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...graph, userId, description: description || "" }),
      });
      // Refresh library list
      await get().loadSavedStrategies();
    } catch (err) {
      console.error("Failed to save strategy:", err);
    }
  },

  loadSavedStrategies: async () => {
    const userId = getUserId();
    try {
      const res = await fetch(`/api/strategies?userId=${userId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json() as {
        strategies: Array<{
          id: string;
          name: string;
          description: string;
          status: string;
          nodeCount: number;
          edgeCount: number;
          createdAt: string;
          updatedAt: string;
        }>;
      };

      // For each strategy, fetch the full graph for the SavedStrategy shape
      const savedStrategies: SavedStrategy[] = [];
      for (const s of data.strategies) {
        try {
          const fullRes = await fetch(`/api/strategies/${s.id}`, { headers: authHeaders() });
          if (!fullRes.ok) continue;
          const full = await fullRes.json() as StrategyGraph & { description?: string; createdAt?: string; updatedAt?: string };
          savedStrategies.push({
            id: s.id,
            name: s.name,
            description: s.description || "",
            graph: {
              id: full.id,
              name: full.name,
              nodes: full.nodes || [],
              edges: full.edges || [],
              status: full.status,
              createdAt: full.createdAt || s.createdAt,
              updatedAt: full.updatedAt || s.updatedAt,
              userId: full.userId || userId,
              version: full.version || 1,
            },
            savedAt: s.createdAt,
            updatedAt: s.updatedAt,
          });
        } catch { /* skip */ }
      }

      set({ savedStrategies });
    } catch (err) {
      console.error("Failed to load strategies:", err);
    }
  },

  deleteSavedStrategy: async (id) => {
    try {
      await fetch(`/api/strategies/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      set({ savedStrategies: get().savedStrategies.filter((s) => s.id !== id) });
    } catch (err) {
      console.error("Failed to delete strategy:", err);
    }
  },

  renameSavedStrategy: async (id, name) => {
    try {
      await fetch(`/api/strategies/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      });
      set({
        savedStrategies: get().savedStrategies.map((s) =>
          s.id === id ? { ...s, name, graph: { ...s.graph, name }, updatedAt: new Date().toISOString() } : s
        ),
      });
    } catch (err) {
      console.error("Failed to rename strategy:", err);
    }
  },

  loadFromLibrary: async (id) => {
    try {
      const res = await fetch(`/api/strategies/${id}`, { headers: authHeaders() });
      if (!res.ok) return;
      const full = await res.json() as StrategyGraph;
      get().loadStrategy(full);
    } catch (err) {
      console.error("Failed to load strategy:", err);
    }
  },

  // ── Logs ──────────────────────────────────────────────────────────────────

  addLog: (log) => {
    const logs = [...get().logs, log].slice(-100);
    set({ logs });
    // Persist to MongoDB (async, non-blocking)
    const userId = getUserId();
    const strategyId = get().strategyId;
    fetch(`/api/paper-trades/${strategyId}/logs`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ userId, logs: [log] }),
    }).catch(() => { });
  },

  clearLogs: () => {
    set({ logs: [] });
    const strategyId = get().strategyId;
    fetch(`/api/paper-trades/${strategyId}/logs`, {
      method: "DELETE",
      headers: authHeaders(),
    }).catch(() => { });
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

  clearTrades: async () => {
    const sid = get().strategyId;
    set({ trades: [], positions: [] });
    try {
      await fetch(`/api/paper-trades/${sid}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch { /* best effort */ }
  },
}));
