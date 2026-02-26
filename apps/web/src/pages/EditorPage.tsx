/**
 * EditorPage — the main strategy builder canvas.
 * React Flow canvas + block palette + properties panel + log drawer.
 */

import { useCallback, useRef, useEffect, useState, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type ReactFlowInstance,
  type Node,
} from "@xyflow/react";
import { BlockType } from "@polyblocks/types";
import { useEditorStore } from "../stores/editorStore";
import PolyblockNode from "../components/editor/PolyblockNode";
import BlockPalette from "../components/editor/BlockPalette";
import PropertiesPanel from "../components/editor/PropertiesPanel";
import EditorToolbar from "../components/editor/EditorToolbar";
import BottomPanel from "../components/editor/BottomPanel";
import CustomEdge from "../components/editor/CustomEdge";
import { AlertCircle, X } from "lucide-react";
import { useAuthStore } from "../stores/authStore";

const nodeTypes = { polyblock: PolyblockNode };
const edgeTypes = { custom: CustomEdge };

export default function EditorPage() {
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const onNodesChange = useEditorStore((s) => s.onNodesChange);
  const onEdgesChange = useEditorStore((s) => s.onEdgesChange);
  const onConnect = useEditorStore((s) => s.onConnect);
  const addNode = useEditorStore((s) => s.addNode);
  const selectNode = useEditorStore((s) => s.selectNode);
  const selectEdge = useEditorStore((s) => s.selectEdge);
  const removeEdge = useEditorStore((s) => s.removeEdge);
  const selectedEdgeId = useEditorStore((s) => s.selectedEdgeId);
  const showLogDrawer = useEditorStore((s) => s.showLogDrawer);
  const showPropertiesPanel = useEditorStore((s) => s.showPropertiesPanel);
  const strategyId = useEditorStore((s) => s.strategyId);
  const isRunning = useEditorStore((s) => s.isRunning);
  const paperRun = useEditorStore((s) => s.paperRun);
  const runError = useEditorStore((s) => s.runError);
  const validationIssues = useEditorStore((s) => s.validationIssues);

  const reactFlowRef = useRef<ReactFlowInstance | null>(null);

  // Get validation errors
  const validationErrors = validationIssues.filter((i) => i.severity === "error");
  const hasVisibleError = !!runError || validationErrors.length > 0;

  // Edge context menu state
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null);

  // ── Sync running state from server on mount ─────────────────────────────
  // If the strategy was running before a page refresh, restore polling
  useEffect(() => {
    if (isRunning) return; // Already running client-side
    let cancelled = false;
    (async () => {
      try {
        const token = useAuthStore.getState().token;
        const headers: Record<string, string> = {};
        if (token) headers["x-session-token"] = token;
        const res = await fetch(`/api/execution/schedule/status/${strategyId}`, { headers });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { running: boolean; mode?: string; iteration?: number };
        if (data.running && !cancelled) {
          // Strategy is running on the server — restore client-side polling
          useEditorStore.setState({
            isRunning: true,
            runMode: (data.mode as "paper" | "live") || "paper",
            runIteration: data.iteration || 0,
            showLogDrawer: true,
          });
          paperRun(); // Start the polling loop
        }
      } catch { /* server not reachable — ignore */ }
    })();
    return () => { cancelled = true; };
  }, [strategyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const blockType = event.dataTransfer.getData(
        "application/polyblocks-block",
      ) as BlockType;

      if (!blockType) return;

      const position = reactFlowRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) || { x: event.clientX, y: event.clientY };

      addNode(blockType, position);
    },
    [addNode],
  );

  // onNodeClick: directly select the clicked node
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
      selectEdge(null);
      setEdgeMenu(null);
    },
    [selectNode, selectEdge],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: { id: string }) => {
      selectEdge(edge.id);
      selectNode(null);
      setEdgeMenu(null);
    },
    [selectEdge, selectNode],
  );

  // Right-click on edge → show delete menu
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: { id: string }) => {
      event.preventDefault();
      selectEdge(edge.id);
      selectNode(null);
      setEdgeMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
    },
    [selectEdge, selectNode],
  );

  // Keyboard: Delete/Backspace removes selected edge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEdgeId) {
        // Don't delete if user is typing in an input
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        removeEdge(selectedEdgeId);
        setEdgeMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEdgeId, removeEdge]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>
      <EditorToolbar />
      
      {/* Error Banner */}
      {hasVisibleError && (
        <div style={{
          background: "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)",
          borderBottom: "1px solid rgba(239, 68, 68, 0.3)",
          padding: "12px 20px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}>
          <AlertCircle size={20} color="#ef4444" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "#ef4444", marginBottom: 6 }}>
              {runError ? "Execution Error" : "Validation Errors"}
            </div>
            <div style={{ color: "var(--pb-text-secondary)", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {runError || validationErrors.map((e, i) => `${i + 1}. ${e.message}`).join("\n")}
            </div>
          </div>
          <button
            onClick={() => useEditorStore.setState({ runError: null })}
            style={{
              background: "rgba(239, 68, 68, 0.2)",
              border: "none",
              borderRadius: 4,
              padding: 4,
              cursor: "pointer",
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}
      
      <div className="editor-container">
        <BlockPalette />

        <div className="editor-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(instance) => {
              reactFlowRef.current = instance;
            }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onEdgeContextMenu={onEdgeContextMenu}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            deleteKeyCode={null}
            defaultEdgeOptions={{
              type: "custom",
              animated: true,
              style: { cursor: "pointer", stroke: "var(--pb-text-muted)", strokeWidth: 2 },
              interactionWidth: 20,
            }}
            edgesReconnectable
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} color="var(--pb-border)" />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              pannable
              zoomable
              style={{ background: "var(--pb-bg-secondary)" }}
            />
          </ReactFlow>

          {/* Edge right-click context menu */}
          {edgeMenu && (
            <div
              className="edge-context-menu"
              style={{ left: edgeMenu.x, top: edgeMenu.y }}
            >
              <button
                onClick={() => {
                  removeEdge(edgeMenu.edgeId);
                  setEdgeMenu(null);
                }}
              >
                🗑️ Delete Connection
              </button>
            </div>
          )}
        </div>

        {showPropertiesPanel && <PropertiesPanel />}
      </div>

      {showLogDrawer && <BottomPanel />}
    </div>
  );
}
