/**
 * EditorPage — the main strategy builder canvas.
 * React Flow canvas + block palette + properties panel + log drawer.
 */

import { useCallback, useRef, type DragEvent } from "react";
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
  const showLogDrawer = useEditorStore((s) => s.showLogDrawer);
  const showPropertiesPanel = useEditorStore((s) => s.showPropertiesPanel);

  const reactFlowRef = useRef<ReactFlowInstance | null>(null);

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
    },
    [selectNode],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

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
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
            }}
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
        </div>

        {showPropertiesPanel && <PropertiesPanel />}
      </div>

      {showLogDrawer && <BottomPanel />}
    </div>
  );
}
