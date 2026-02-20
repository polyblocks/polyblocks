/**
 * LibraryPage — personal strategy library.
 * Lists all saved strategies with open / delete / rename actions.
 * Shows a LIVE badge for strategies currently running on the server.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEditorStore, type SavedStrategy } from "../stores/editorStore";
import { Workflow, Trash2, FolderOpen, Clock, Layers, Pencil, Check, X, Radio, Square, FileText } from "lucide-react";
import { Button } from "@polyblocks/ui";
import { timeAgoEt } from "../lib/time";

interface RunningStrategy {
  strategyId: string;
  strategyName: string;
  mode: "paper" | "live";
  startedAt: string;
  iteration: number;
  intervalMs: number;
  lastError?: string;
}

function StrategyCard({ entry, onOpen, onDelete, onRename, runningInfo, onStop }: {
  entry: SavedStrategy;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  runningInfo?: RunningStrategy;
  onStop: (strategyId: string) => void;
}) {
  const nodeCount = entry.graph.nodes.length;
  const edgeCount = entry.graph.edges.length;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.name);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== entry.name) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(entry.name);
    setEditing(false);
  };

  return (
    <div className={`library-card ${runningInfo ? "library-card-running" : ""}`}>
      <div className="library-card-header">
        <div className="library-card-icon">
          <Workflow size={20} />
        </div>
        <div className="library-card-meta">
          {editing ? (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                className="library-rename-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
                autoFocus
              />
              <button className="library-rename-btn save" onClick={handleSave} title="Save">
                <Check size={14} />
              </button>
              <button className="library-rename-btn cancel" onClick={handleCancel} title="Cancel">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <h3 className="library-card-name">{entry.name}</h3>
              <button
                className="library-rename-btn"
                onClick={() => { setDraft(entry.name); setEditing(true); }}
                title="Rename"
              >
                <Pencil size={12} />
              </button>
              {runningInfo && (
                <span className={`live-badge ${runningInfo.mode === "live" ? "live-badge-live" : "live-badge-paper"}`}>
                  {runningInfo.mode === "live" ? (
                    <Radio size={10} className="live-pulse" />
                  ) : (
                    <FileText size={10} className="live-pulse" />
                  )}
                  {runningInfo.mode === "live" ? "LIVE" : "PAPER"}
                </span>
              )}
            </div>
          )}
          {entry.description && !editing && (
            <p className="library-card-desc">{entry.description}</p>
          )}
        </div>
      </div>

      <div className="library-card-stats">
        <span className="library-stat">
          <Layers size={12} />
          {nodeCount} block{nodeCount !== 1 ? "s" : ""}
        </span>
        <span className="library-stat">
          {edgeCount} edge{edgeCount !== 1 ? "s" : ""}
        </span>
        <span className="library-stat">
          <Clock size={12} />
          {timeAgoEt(entry.updatedAt)}
        </span>
        {runningInfo && (
          <span className="library-stat" style={{ color: "var(--pb-accent)" }}>
            Iteration #{runningInfo.iteration}
          </span>
        )}
      </div>

      <div className="library-card-actions">
        <Button size="sm" variant="primary" onClick={onOpen}>
          <FolderOpen size={14} />
          Open
        </Button>
        {runningInfo && (
          <Button
            size="sm"
            onClick={() => onStop(entry.id)}
            title="Stop running"
            style={{ color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <Square size={12} />
            Stop
          </Button>
        )}
        <Button
          size="sm"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            if (confirm(`Delete "${entry.name}"?`)) onDelete();
          }}
          title="Delete"
          style={{ color: "var(--pb-risk)" }}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const savedStrategies = useEditorStore((s) => s.savedStrategies);
  const loadSavedStrategies = useEditorStore((s) => s.loadSavedStrategies);
  const deleteSavedStrategy = useEditorStore((s) => s.deleteSavedStrategy);
  const renameSavedStrategy = useEditorStore((s) => s.renameSavedStrategy);
  const loadFromLibrary = useEditorStore((s) => s.loadFromLibrary);
  const editorIsRunning = useEditorStore((s) => s.isRunning);
  const editorRunMode = useEditorStore((s) => s.runMode);
  const editorStrategyId = useEditorStore((s) => s.strategyId);
  const editorIteration = useEditorStore((s) => s.runIteration);
  const [loading, setLoading] = useState(true);
  const [runningMap, setRunningMap] = useState<Map<string, RunningStrategy>>(new Map());

  const fetchRunning = async () => {
    try {
      const res = await fetch("/api/execution/schedule/running");
      if (!res.ok) return;
      const data = await res.json() as { strategies: RunningStrategy[] };
      const map = new Map<string, RunningStrategy>();
      for (const s of data.strategies) {
        map.set(s.strategyId, s);
      }
      setRunningMap(map);
    } catch {
      // Non-critical
    }
  };

  useEffect(() => {
    loadSavedStrategies().finally(() => setLoading(false));
    fetchRunning();
    // Poll running status every 10s
    const interval = setInterval(fetchRunning, 10_000);
    return () => clearInterval(interval);
  }, [loadSavedStrategies]);

  // Merge server-scheduled running strategies with in-browser paper run
  const combinedMap = new Map(runningMap);
  if (editorIsRunning && !combinedMap.has(editorStrategyId)) {
    combinedMap.set(editorStrategyId, {
      strategyId: editorStrategyId,
      strategyName: "",
      mode: editorRunMode,
      startedAt: new Date().toISOString(),
      iteration: editorIteration,
      intervalMs: 0,
    });
  }

  const totalRunning = combinedMap.size;

  const handleOpen = (id: string) => {
    loadFromLibrary(id);
    navigate("/editor");
  };

  const handleStop = async (strategyId: string) => {
    try {
      await fetch("/api/execution/schedule/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId }),
      });
      fetchRunning();
    } catch {
      // Best effort
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>My Strategies</h1>
          <Button variant="primary" onClick={() => navigate("/editor")}>
            New Strategy
          </Button>
        </div>
        <p>Your saved strategies. Open any to continue editing or run it.</p>
        {totalRunning > 0 && (
          <div className="running-summary">
            <Radio size={12} className="live-pulse" />
            <span>{totalRunning} strateg{totalRunning === 1 ? "y" : "ies"} running</span>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "var(--pb-text-muted)" }}>
          <div style={{ animation: "spin 1s linear infinite", marginBottom: 16 }}>
            <Layers size={40} strokeWidth={1.5} />
          </div>
          <p style={{ fontSize: 14 }}>Loading your strategies...</p>
        </div>
      ) : savedStrategies.length === 0 ? (
        <div className="library-empty">
          <Workflow size={48} strokeWidth={1} style={{ color: "var(--pb-text-muted)", marginBottom: 16 }} />
          <p style={{ color: "var(--pb-text-muted)", fontSize: 14 }}>
            No saved strategies yet.
          </p>
          <p style={{ color: "var(--pb-text-muted)", fontSize: 13 }}>
            Open the editor, build a strategy, and click <strong>Save</strong> to add it here.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate("/editor")}
            style={{ marginTop: 16 }}
          >
            Open Editor
          </Button>
        </div>
      ) : (
        <div className="library-grid">
          {savedStrategies.map((entry) => (
            <StrategyCard
              key={entry.id}
              entry={entry}
              onOpen={() => handleOpen(entry.id)}
              onDelete={() => deleteSavedStrategy(entry.id)}
              onRename={(name) => renameSavedStrategy(entry.id, name)}
              runningInfo={combinedMap.get(entry.id)}
              onStop={handleStop}
            />
          ))}
        </div>
      )}
    </div>
  );
}
