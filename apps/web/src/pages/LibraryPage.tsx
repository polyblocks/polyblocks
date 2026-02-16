/**
 * LibraryPage — personal strategy library.
 * Lists all saved strategies with open / delete / rename actions.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEditorStore, type SavedStrategy } from "../stores/editorStore";
import { Workflow, Trash2, FolderOpen, Clock, Layers, Pencil, Check, X } from "lucide-react";
import { Button } from "@polyblocks/ui";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function StrategyCard({ entry, onOpen, onDelete, onRename }: {
  entry: SavedStrategy;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
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
    <div className="library-card">
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
          {timeAgo(entry.updatedAt)}
        </span>
      </div>

      <div className="library-card-actions">
        <Button size="sm" variant="primary" onClick={onOpen}>
          <FolderOpen size={14} />
          Open
        </Button>
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

  useEffect(() => {
    loadSavedStrategies();
  }, [loadSavedStrategies]);

  const handleOpen = (id: string) => {
    loadFromLibrary(id);
    navigate("/editor");
  };

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <h1>My Strategies</h1>
        <p>Your saved strategies. Open any to continue editing or run it.</p>
      </div>

      {savedStrategies.length === 0 ? (
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
