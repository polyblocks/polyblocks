/**
 * AiBuilderPanel — right-sidebar tab for AI-powered strategy generation.
 * Pro-only. Sends natural language prompt to Gemini API and loads the
 * returned strategy graph onto the canvas.
 */

import { useState, useRef } from "react";
import { Sparkles, Crown, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@polyblocks/ui";
import { useAuthStore } from "../../stores/authStore";
import { useEditorStore } from "../../stores/editorStore";
import { nanoid } from "nanoid";
import { StrategyStatus } from "@polyblocks/types";

const EXAMPLE_PROMPTS = [
  "Buy YES when price drops below 30 cents with a $50 max exposure",
  "Alert me when any market spread is wider than 5 cents",
  "Scalp the spread with a 30 second interval and $25 daily loss limit",
  "Buy YES above 60¢, sell below 40¢ with 5 minute cooldown",
];

export default function AiBuilderPanel() {
  const isPro = useAuthStore((s) => s.isPro);
  const upgradeToPro = useAuthStore((s) => s.upgradeToPro);
  const token = useAuthStore((s) => s.token);
  const loadStrategy = useEditorStore((s) => s.loadStrategy);

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<{ name: string; explanation: string; nodeCount: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setError(null);
    setAiResponse(null);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": token || "",
        },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json() as {
        strategy?: { name: string; explanation?: string; nodes: unknown[]; edges: unknown[] };
        error?: string;
      };

      if (!res.ok || !data.strategy) {
        setError(data.error || "Generation failed. Please try again.");
        setLoading(false);
        return;
      }

      // Convert AI response to a full StrategyGraph and load it
      const graph = {
        id: nanoid(),
        name: data.strategy.name,
        nodes: data.strategy.nodes as any[],
        edges: data.strategy.edges as any[],
        status: StrategyStatus.Draft,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: "",
        version: 1,
      };

      loadStrategy(graph);
      setAiResponse({
        name: data.strategy.name,
        explanation: data.strategy.explanation || "",
        nodeCount: data.strategy.nodes.length,
      });
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setPrompt(example);
    textareaRef.current?.focus();
  };

  // ── Pro gate ────────────────────────────────────────────────────────────
  if (!isPro()) {
    return (
      <div className="ai-builder-panel">
        <div className="ai-builder-gate">
          <div className="ai-builder-gate-icon">
            <Crown size={32} />
          </div>
          <h3>AI Strategy Builder</h3>
          <p>
            Describe your trading strategy in plain English and let AI build it
            for you instantly.
          </p>
          <p className="ai-builder-gate-sub">
            This feature is available exclusively for Pro subscribers.
          </p>
          <Button onClick={upgradeToPro} style={{ marginTop: 12 }}>
            <Crown size={14} />
            Upgrade to Pro — <span className="pb-price-old">$20</span> <span className="pb-price-new">$10</span>/mo
          </Button>
        </div>
      </div>
    );
  }

  // ── Pro user: AI prompt interface ───────────────────────────────────────
  return (
    <div className="ai-builder-panel">
      <div className="ai-builder-header">
        <Sparkles size={16} className="ai-builder-sparkle" />
        <h3>AI Strategy Builder</h3>
      </div>

      <div className="ai-builder-body">
        <p className="ai-builder-desc">
          Describe your strategy in plain English and AI will generate the blocks
          and connections for you.
        </p>

        <div className="ai-builder-input-group">
          <textarea
            ref={textareaRef}
            className="ai-builder-textarea"
            placeholder="e.g. Buy YES when the price goes above 65 cents, with a 5 minute cooldown and $50 max exposure..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleGenerate();
              }
            }}
            rows={4}
            maxLength={2000}
            disabled={loading}
          />
          <div className="ai-builder-char-count">
            {prompt.length}/2000
          </div>
        </div>

        <Button
          className="ai-builder-generate-btn"
          onClick={handleGenerate}
          disabled={loading || prompt.trim().length < 5}
        >
          {loading ? (
            <>
              <Loader2 size={14} className="ai-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={14} />
              Generate Strategy
            </>
          )}
        </Button>

        {error && (
          <div className="ai-builder-error">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {aiResponse && (
          <div className="ai-builder-response">
            <div className="ai-builder-response-header">
              <Sparkles size={14} />
              <strong>{aiResponse.name}</strong>
            </div>
            {aiResponse.explanation && (
              <p className="ai-builder-response-text">{aiResponse.explanation}</p>
            )}
            <span className="ai-builder-response-meta">
              {aiResponse.nodeCount} blocks generated — review and customize on the canvas
            </span>
          </div>
        )}

        <div className="ai-builder-examples">
          <p className="ai-builder-examples-title">Try an example:</p>
          {EXAMPLE_PROMPTS.map((ex, i) => (
            <button
              key={i}
              className="ai-builder-example"
              onClick={() => handleExampleClick(ex)}
              disabled={loading}
            >
              <ArrowRight size={12} />
              {ex}
            </button>
          ))}
        </div>

        <p className="ai-builder-hint">
          💡 Tip: Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to generate. You can
          always edit the blocks after generation.
        </p>
      </div>
    </div>
  );
}
