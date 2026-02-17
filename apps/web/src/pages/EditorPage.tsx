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
} from "@xyflow/react";
import { BlockType } from "@polyblocks/types";
import { useEditorStore } from "../stores/editorStore";
import PolyblockNode from "../components/editor/PolyblockNode";
import BlockPalette from "../components/editor/BlockPalette";
import PropertiesPanel from "../components/editor/PropertiesPanel";
import EditorToolbar from "../components/editor/EditorToolbar";
import BottomPanel from "../components/editor/BottomPanel";

const nodeTypes = { polyblock: PolyblockNode };

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

  const reactFlowRef = useRef<ReactFlowInstance | null>(null);

  // Edge context menu state
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null);

  // ── Sync running state from server on mount ─────────────────────────────
  // If the strategy was running before a page refresh, restore polling
  useEffect(() => {
    if (isRunning) return; // Already running client-side
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/execution/schedule/status/${strategyId}`);
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

      const flow = reactFlowRef.current;
      if (!flow) return;

      const position = flow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(blockType, position);
    },
    [addNode],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id);
      setEdgeMenu(null);
    },
    [selectNode],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
    setEdgeMenu(null);
  }, [selectNode, selectEdge]);

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
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            deleteKeyCode={null}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { cursor: "pointer" },
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
