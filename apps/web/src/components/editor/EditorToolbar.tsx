/**
 * EditorToolbar — top bar with strategy name, validation, export, save, and run controls.
 */

import { useRef, useState } from "react";
import { Button, Badge } from "@polyblocks/ui";
import { useEditorStore } from "../../stores/editorStore";
import { useAuthStore } from "../../stores/authStore";
import {
  Play,
  Square,
  Download,
  Upload,
  CheckCircle,
  AlertTriangle,
  Terminal,
  Save,
  Pencil,
  Zap,
  Lock,
  Crown,
  Monitor,
} from "lucide-react";
import { ValidationSeverity } from "@polyblocks/types";

export default function EditorToolbar() {
  const strategyName = useEditorStore((s) => s.strategyName);
  const setStrategyName = useEditorStore((s) => s.setStrategyName);
  const validate = useEditorStore((s) => s.validate);
  const validationIssues = useEditorStore((s) => s.validationIssues);
  const exportJson = useEditorStore((s) => s.exportJson);
  const importJson = useEditorStore((s) => s.importJson);
  const toggleLogDrawer = useEditorStore((s) => s.toggleLogDrawer);
  const showLogDrawer = useEditorStore((s) => s.showLogDrawer);
  const stopRun = useEditorStore((s) => s.stopRun);
  const startBackground = useEditorStore((s) => s.startBackground);
  const stopBackground = useEditorStore((s) => s.stopBackground);
  const isRunning = useEditorStore((s) => s.isRunning);
  const runIteration = useEditorStore((s) => s.runIteration);
  const runError = useEditorStore((s) => s.runError);
  const saveStrategy = useEditorStore((s) => s.saveStrategy);
  const runMode = useEditorStore((s) => s.runMode);
  const setRunMode = useEditorStore((s) => s.setRunMode);
  const canLiveTrade = useAuthStore((s) => s.canLiveTrade);
  const upgradeToPro = useAuthStore((s) => s.upgradeToPro);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [showUpgradeHint, setShowUpgradeHint] = useState(false);

  const errors = validationIssues.filter(
    (i) => i.severity === ValidationSeverity.Error,
  );
  const warnings = validationIssues.filter(
    (i) => i.severity === ValidationSeverity.Warning,
  );

  const handleExport = () => {
    const json = exportJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${strategyName.replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") importJson(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSave = () => {
    saveStrategy();
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  return (
    <div className="editor-toolbar">
      <div className="strategy-name-wrapper">
        <input
          className="strategy-name"
          value={strategyName}
          onChange={(e) => setStrategyName(e.target.value)}
          spellCheck={false}
          placeholder="Name your strategy…"
        />
        <Pencil size={12} className="strategy-name-pencil" />
      </div>

      <div className="spacer" />

      {/* Running status indicator */}
      {isRunning && (
        <div className="running-indicator">
          <span className="running-dot" />
          <span className="running-label">{runMode === "live" ? "LIVE" : "PAPER"}</span>
          <span className="running-iter">Iteration #{runIteration}</span>
        </div>
      )}

      {/* Saved flash */}
      {showSaved && (
        <Badge variant="logic" style={{ animation: "fadeInOut 2s ease" }}>
          <CheckCircle size={12} style={{ marginRight: 4 }} />
          Saved!
        </Badge>
      )}

      {/* Run error */}
      {runError && (
        <Badge variant="risk">
          <AlertTriangle size={12} style={{ marginRight: 4 }} />
          {runError}
        </Badge>
      )}

      {/* Validation indicator */}
      {validationIssues.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {errors.length > 0 && (
            <Badge variant="risk">
              <AlertTriangle size={12} style={{ marginRight: 4 }} />
              {errors.length} error{errors.length > 1 ? "s" : ""}
            </Badge>
          )}
          {warnings.length > 0 && (
            <Badge variant="trigger">
              {warnings.length} warning{warnings.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      )}

      {/* Mode toggle */}
      <div className="mode-toggle" style={{ position: "relative" }}>
        <button
          className={`mode-toggle-btn ${runMode === "paper" ? "active" : ""}`}
          onClick={() => setRunMode("paper")}
          disabled={isRunning}
          title="Paper trading mode (simulated)"
        >
          Paper
        </button>
        <button
          className={`mode-toggle-btn mode-toggle-live ${runMode === "live" ? "active" : ""} ${!canLiveTrade() ? "locked" : ""}`}
          onClick={() => {
            if (!canLiveTrade()) {
              setShowUpgradeHint(true);
              setTimeout(() => setShowUpgradeHint(false), 3000);
              return;
            }
            setRunMode("live");
          }}
          disabled={isRunning}
          title={canLiveTrade() ? "Live trading mode (real orders)" : "Upgrade to Pro to use live trading"}
        >
          {canLiveTrade() ? <Zap size={12} /> : <Lock size={12} />}
          Live
        </button>
        {showUpgradeHint && (
          <div className="upgrade-tooltip">
            <Crown size={12} />
            <span>Pro required for live trading</span>
            <button onClick={() => { upgradeToPro(); setShowUpgradeHint(false); }}>Upgrade</button>
          </div>
        )}
      </div>

      <Button size="sm" onClick={() => validate()} title="Validate">
        <CheckCircle size={14} />
        Validate
      </Button>

      <Button size="sm" onClick={handleSave} title="Save to Library">
        <Save size={14} />
      </Button>

      <Button size="sm" onClick={handleExport} title="Export JSON">
        <Download size={14} />
      </Button>

      <Button size="sm" onClick={handleImport} title="Import JSON">
        <Upload size={14} />
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <Button
        size="sm"
        onClick={toggleLogDrawer}
        title="Toggle execution log"
        style={showLogDrawer ? { background: "var(--pb-accent-muted)", color: "var(--pb-accent)" } : {}}
      >
        <Terminal size={14} />
      </Button>

      {isRunning ? (
        <>
          <Button
            variant="primary"
            size="sm"
            title="Stop strategy"
            onClick={() => { stopRun(); stopBackground(); }}
            style={{ background: "var(--pb-risk)", borderColor: "var(--pb-risk)" }}
          >
            <Square size={14} />
            Stop
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="primary"
            size="sm"
            title={
              runMode === "live" && !canLiveTrade()
                ? "Upgrade to Pro for live trading"
                : runMode === "live"
                ? "Run strategy with real orders (keeps running even if you leave this page)"
                : "Run strategy continuously (keeps running even if you leave this page)"
            }
            onClick={() => {
              if (runMode === "live" && !canLiveTrade()) {
                setShowUpgradeHint(true);
                setTimeout(() => setShowUpgradeHint(false), 3000);
                return;
              }
              // Server-side execution only — never double-execute.
              // startBackground() handles scheduling on the server;
              // paperRun() handles client-side polling for log display.
              // IMPORTANT: only ONE of them should place orders.
              // We use server-side scheduling only and paperRun just polls.
              startBackground();
            }}
            style={runMode === "live" ? { background: "var(--pb-risk)", borderColor: "var(--pb-risk)" } : {}}
          >
            {runMode === "live" ? <Zap size={14} /> : <Play size={14} />}
            {runMode === "live" ? "Live Run" : "Paper Run"}
          </Button>
        </>
      )}

      {/* Running notice */}
      {isRunning && (
        <div
          style={{
            position: "absolute",
            bottom: -32,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "6px 16px",
            fontSize: 11,
            zIndex: 10,
            background: runMode === "live"
              ? "rgba(239,68,68,0.08)"
              : "rgba(245,158,11,0.06)",
            borderBottom: runMode === "live"
              ? "1px solid rgba(239,68,68,0.2)"
              : "1px solid rgba(245,158,11,0.15)",
            color: "var(--pb-text-muted)",
          }}
        >
          <Monitor size={12} color={runMode === "live" ? "#ef4444" : "#f59e0b"} />
          <span>
            <strong style={{ color: runMode === "live" ? "#ef4444" : "#f59e0b" }}>
              Running on server
            </strong>
            {" — "}
            Strategy continues running even if you navigate away. Stop it from here or the Library page.
          </span>
        </div>
      )}
    </div>
  );
}
