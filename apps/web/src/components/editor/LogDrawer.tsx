/**
 * LogDrawer — bottom panel showing execution logs and debug trace.
 */

import { useEditorStore } from "../../stores/editorStore";
import { Button } from "@polyblocks/ui";
import { Trash2, ChevronDown, CheckCircle, XCircle, SkipForward, Clock } from "lucide-react";
import { BLOCK_REGISTRY, BlockType } from "@polyblocks/types";

function getNodeLabel(nodeId: string): string {
  const nodes = useEditorStore.getState().nodes;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return nodeId;
  const blockType = node.data.blockType as BlockType;
  const def = BLOCK_REGISTRY[blockType];
  return (node.data.label as string) || def?.label || nodeId;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed": return <CheckCircle size={12} style={{ color: "var(--pb-logic)" }} />;
    case "failed": return <XCircle size={12} style={{ color: "var(--pb-risk)" }} />;
    case "skipped": return <SkipForward size={12} style={{ color: "var(--pb-text-muted)" }} />;
    default: return <Clock size={12} style={{ color: "var(--pb-trigger)" }} />;
  }
}

export default function LogDrawer() {
  const logs = useEditorStore((s) => s.logs);
  const clearLogs = useEditorStore((s) => s.clearLogs);
  const toggleLogDrawer = useEditorStore((s) => s.toggleLogDrawer);

  return (
    <div className="log-drawer">
      <div className="log-drawer-header">
        <span>Execution Logs ({logs.length} run{logs.length !== 1 ? "s" : ""})</span>
        <div style={{ display: "flex", gap: 4 }}>
          <Button variant="icon" size="sm" onClick={clearLogs} title="Clear logs">
            <Trash2 size={14} />
          </Button>
          <Button variant="icon" size="sm" onClick={toggleLogDrawer} title="Close">
            <ChevronDown size={14} />
          </Button>
        </div>
      </div>
      <div className="log-list">
        {logs.length === 0 && (
          <div
            style={{
              padding: 24,
              color: "var(--pb-text-muted)",
              textAlign: "center",
              fontSize: 13,
            }}
          >
            No logs yet. Click <strong>Paper Run</strong> to execute your strategy.
          </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="log-run-group">
            <div className="log-run-header">
              <span style={{ color: "var(--pb-text-muted)", fontSize: 11 }}>
                {new Date(log.startedAt).toLocaleTimeString()}
              </span>
              <span style={{
                color: log.status === "completed" ? "var(--pb-logic)" : "var(--pb-risk)",
                fontWeight: 600,
                fontSize: 12,
              }}>
                {log.status.toUpperCase()}
              </span>
              {log.summary && (
                <span style={{ color: "var(--pb-text-muted)", fontSize: 11, marginLeft: "auto" }}>
                  {log.summary}
                </span>
              )}
            </div>
            {log.nodeResults.map((nr) => (
              <div
                key={`${log.id}-${nr.nodeId}`}
                className={`log-entry ${nr.status === "failed" ? "error" : nr.status === "skipped" ? "skipped" : ""}`}
              >
                <StatusIcon status={nr.status} />
                <span className="node-name">{getNodeLabel(nr.nodeId)}</span>
                <span className="message">
                  {nr.error
                    ? `❌ ${nr.error}`
                    : nr.status === "skipped"
                    ? "skipped"
                    : nr.output
                    ? Object.entries(nr.output)
                        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v)}`)
                        .join(" · ")
                    : "done"}
                </span>
                <span className="duration">{nr.durationMs}ms</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
