/**
 * TemplatesPage — gallery of pre-built strategy templates users can load.
 */

import { useNavigate } from "react-router-dom";
import { Badge } from "@polyblocks/ui";
import { BUILTIN_TEMPLATES, StrategyStatus } from "@polyblocks/types";
import { useEditorStore } from "../stores/editorStore";
import { nanoid } from "nanoid";

export default function TemplatesPage() {
  const navigate = useNavigate();
  const loadStrategy = useEditorStore((s) => s.loadStrategy);

  const handleUseTemplate = (templateId: string) => {
    const template = BUILTIN_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    loadStrategy({
      ...template.graph,
      id: nanoid(),
      status: StrategyStatus.Draft,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: "",
      version: 1,
    });
    navigate("/editor");
  };

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <h1>Strategy Templates</h1>
        <p>Start with a pre-built strategy and customize it for your needs.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, width: "100%", maxWidth: 1000 }}>
        {BUILTIN_TEMPLATES.map((template) => (
          <div key={template.id} className="pb-card" style={{ cursor: "pointer" }} onClick={() => handleUseTemplate(template.id)}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600 }}>{template.name}</div>
              <Badge
                variant={
                  template.difficulty === "beginner"
                    ? "logic"
                    : template.difficulty === "intermediate"
                    ? "trigger"
                    : "risk"
                }
              >
                {template.difficulty}
              </Badge>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--pb-text-secondary)",
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              {template.description}
            </p>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              {template.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: "var(--pb-radius-full)",
                    background: "var(--pb-bg-tertiary)",
                    color: "var(--pb-text-muted)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--pb-text-muted)" }}>
              {template.graph.nodes.length} blocks · {template.graph.edges.length} connections
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
