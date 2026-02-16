/**
 * PropertiesPanel — right sidebar with tabs: Properties (selected node config) + Tutorials.
 */

import { useState } from "react";
import {
  BlockType,
  BLOCK_REGISTRY,
} from "@polyblocks/types";
import { Input, Select, Button } from "@polyblocks/ui";
import { useEditorStore } from "../../stores/editorStore";
import { X, Trash2, Settings, BookOpen } from "lucide-react";
import MarketPicker from "./MarketPicker";
import TutorialsPanel from "./TutorialsPanel";

type RightTab = "properties" | "tutorials";

export default function PropertiesPanel() {
  const [activeTab, setActiveTab] = useState<RightTab>("properties");
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const nodes = useEditorStore((s) => s.nodes);
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const updateNodeLabel = useEditorStore((s) => s.updateNodeLabel);
  const removeNode = useEditorStore((s) => s.removeNode);
  const selectNode = useEditorStore((s) => s.selectNode);

  return (
    <aside className="properties-panel">
      {/* Tab bar */}
      <div className="right-panel-tabs">
        <button
          className={`right-panel-tab ${activeTab === "properties" ? "active" : ""}`}
          onClick={() => setActiveTab("properties")}
        >
          <Settings size={14} />
          Properties
        </button>
        <button
          className={`right-panel-tab ${activeTab === "tutorials" ? "active" : ""}`}
          onClick={() => setActiveTab("tutorials")}
        >
          <BookOpen size={14} />
          Tutorials
        </button>
      </div>

      {activeTab === "tutorials" ? (
        <TutorialsPanel />
      ) : (
        <PropertiesContent
          selectedNodeId={selectedNodeId}
          nodes={nodes}
          updateNodeConfig={updateNodeConfig}
          updateNodeLabel={updateNodeLabel}
          removeNode={removeNode}
          selectNode={selectNode}
        />
      )}
    </aside>
  );
}

function PropertiesContent({
  selectedNodeId,
  nodes,
  updateNodeConfig,
  updateNodeLabel,
  removeNode,
  selectNode,
}: {
  selectedNodeId: string | null;
  nodes: ReturnType<typeof useEditorStore.getState>["nodes"];
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  updateNodeLabel: (id: string, label: string) => void;
  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;
}) {
  if (!selectedNodeId) {
    return (
      <div
        className="properties-panel-body"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--pb-text-muted)",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        Select a block to view its properties
      </div>
    );
  }

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const blockType = node.data.blockType as BlockType;
  const def = BLOCK_REGISTRY[blockType];
  if (!def) return null;

  const config = node.data.config as Record<string, unknown>;

  const handleConfigChange = (key: string, value: unknown) => {
    updateNodeConfig(selectedNodeId, { [key]: value });
  };

  return (
    <>
      <div className="properties-panel-header">
        <h3>{def.label}</h3>
        <Button variant="icon" size="sm" onClick={() => selectNode(null)}>
          <X size={16} />
        </Button>
      </div>
      <div className="properties-panel-body">
        {/* Custom label */}
        <div className="property-group">
          <label>Label</label>
          <Input
            value={(node.data.label as string) || ""}
            placeholder={def.label}
            onChange={(e) => updateNodeLabel(selectedNodeId, e.target.value)}
          />
        </div>

        {/* Block-specific config */}
        {blockType === BlockType.IntervalTrigger && (
          <div className="property-group">
            <label>Interval (seconds)</label>
            <Input
              type="number"
              min={1}
              value={Number(config.intervalMs) / 1000}
              onChange={(e) =>
                handleConfigChange("intervalMs", Number(e.target.value) * 1000)
              }
            />
          </div>
        )}

        {blockType === BlockType.PriceCrossTrigger && (
          <>
            <div className="property-group">
              <label>Threshold</label>
              <Input
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={Number(config.threshold)}
                onChange={(e) =>
                  handleConfigChange("threshold", Number(e.target.value))
                }
              />
            </div>
            <div className="property-group">
              <label>Direction</label>
              <Select
                value={String(config.direction)}
                onChange={(e) =>
                  handleConfigChange("direction", e.target.value)
                }
              >
                <option value="above">Crosses Above</option>
                <option value="below">Crosses Below</option>
              </Select>
            </div>
          </>
        )}

        {blockType === BlockType.MarketSelector && (
          <div className="property-group">
            <label>Market</label>
            <MarketPicker config={config} onConfigChange={handleConfigChange} />
          </div>
        )}

        {blockType === BlockType.ThresholdCompare && (
          <>
            <div className="property-group">
              <label>Operator</label>
              <Select
                value={String(config.operator)}
                onChange={(e) =>
                  handleConfigChange("operator", e.target.value)
                }
              >
                <option value=">">&gt; Greater than</option>
                <option value=">=">&gt;= Greater or equal</option>
                <option value="<">&lt; Less than</option>
                <option value="<=">&lt;= Less or equal</option>
                <option value="==">== Equal</option>
                <option value="!=">!= Not equal</option>
              </Select>
            </div>
            <div className="property-group">
              <label>Threshold</label>
              <Input
                type="number"
                step={0.01}
                value={Number(config.threshold)}
                onChange={(e) =>
                  handleConfigChange("threshold", Number(e.target.value))
                }
              />
            </div>
          </>
        )}

        {blockType === BlockType.PlaceOrder && (
          <>
            <div className="property-group">
              <label>Side</label>
              <Select
                value={String(config.side)}
                onChange={(e) => handleConfigChange("side", e.target.value)}
              >
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </Select>
            </div>
            <div className="property-group">
              <label>Outcome</label>
              <Select
                value={String(config.outcome)}
                onChange={(e) => handleConfigChange("outcome", e.target.value)}
              >
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </Select>
            </div>
            <div className="property-group">
              <label>Order Type</label>
              <Select
                value={String(config.orderType)}
                onChange={(e) =>
                  handleConfigChange("orderType", e.target.value)
                }
              >
                <option value="GTC">GTC (Limit)</option>
                <option value="FOK">FOK (Market)</option>
                <option value="FAK">FAK (Partial Fill)</option>
              </Select>
            </div>
            <div className="property-group">
              <label>Size (USD)</label>
              <Input
                type="number"
                min={1}
                value={Number(config.sizeUsd)}
                onChange={(e) =>
                  handleConfigChange("sizeUsd", Number(e.target.value))
                }
              />
            </div>
          </>
        )}

        {blockType === BlockType.MaxExposure && (
          <div className="property-group">
            <label>Max Exposure (USD)</label>
            <Input
              type="number"
              min={1}
              value={Number(config.maxExposureUsd)}
              onChange={(e) =>
                handleConfigChange("maxExposureUsd", Number(e.target.value))
              }
            />
          </div>
        )}

        {blockType === BlockType.DailyLossLimit && (
          <div className="property-group">
            <label>Max Daily Loss (USD)</label>
            <Input
              type="number"
              min={1}
              value={Number(config.maxDailyLossUsd)}
              onChange={(e) =>
                handleConfigChange("maxDailyLossUsd", Number(e.target.value))
              }
            />
          </div>
        )}

        {blockType === BlockType.Cooldown && (
          <div className="property-group">
            <label>Cooldown (seconds)</label>
            <Input
              type="number"
              min={1}
              value={Number(config.cooldownMs) / 1000}
              onChange={(e) =>
                handleConfigChange("cooldownMs", Number(e.target.value) * 1000)
              }
            />
          </div>
        )}

        {blockType === BlockType.MathOp && (
          <div className="property-group">
            <label>Operator</label>
            <Select
              value={String(config.operator)}
              onChange={(e) => handleConfigChange("operator", e.target.value)}
            >
              <option value="+">+ Add</option>
              <option value="-">− Subtract</option>
              <option value="*">× Multiply</option>
              <option value="/">÷ Divide</option>
            </Select>
          </div>
        )}

        {blockType === BlockType.PositionSizer && (
          <>
            <div className="property-group">
              <label>Mode</label>
              <Select
                value={String(config.mode)}
                onChange={(e) => handleConfigChange("mode", e.target.value)}
              >
                <option value="kelly">Kelly Criterion</option>
                <option value="half_kelly">Half Kelly</option>
                <option value="fixed">Fixed Fraction</option>
                <option value="equal">Equal Weight</option>
              </Select>
            </div>
            <div className="property-group">
              <label>Bankroll (USD)</label>
              <Input
                type="number"
                min={1}
                value={Number(config.bankroll)}
                onChange={(e) =>
                  handleConfigChange("bankroll", Number(e.target.value))
                }
              />
            </div>
            <div className="property-group">
              <label>Max Fraction (0–1)</label>
              <Input
                type="number"
                min={0.01}
                max={1}
                step={0.01}
                value={Number(config.maxFraction)}
                onChange={(e) =>
                  handleConfigChange("maxFraction", Number(e.target.value))
                }
              />
            </div>
          </>
        )}

        {blockType === BlockType.MultiMarketCompare && (
          <div className="property-group">
            <label>Token Side</label>
            <Select
              value={String(config.side)}
              onChange={(e) => handleConfigChange("side", e.target.value)}
            >
              <option value="YES">YES token</option>
              <option value="NO">NO token</option>
            </Select>
          </div>
        )}

        {blockType === BlockType.IfElse && (
          <div className="property-group">
            <p style={{ color: "var(--pb-text-muted)", fontSize: 12, margin: 0 }}>
              Routes the signal to the <strong>Then</strong> output when the condition is true,
              or to the <strong>Else</strong> output when false. Connect a boolean (e.g. Threshold result)
              to the Condition input.
            </p>
          </div>
        )}

        {blockType === BlockType.Delay && (
          <div className="property-group">
            <label>Delay (seconds)</label>
            <Input
              type="number"
              min={0.1}
              step={0.1}
              value={Number(config.delayMs) / 1000}
              onChange={(e) =>
                handleConfigChange("delayMs", Number(e.target.value) * 1000)
              }
            />
          </div>
        )}

        {blockType === BlockType.PriceData && (
          <div className="property-group">
            <label>Token Side</label>
            <Select
              value={String(config.side)}
              onChange={(e) => handleConfigChange("side", e.target.value)}
            >
              <option value="YES">YES token</option>
              <option value="NO">NO token</option>
            </Select>
          </div>
        )}

        {blockType === BlockType.PriceHistory && (
          <>
            <div className="property-group">
              <label>Interval</label>
              <Select
                value={String(config.interval)}
                onChange={(e) =>
                  handleConfigChange("interval", e.target.value)
                }
              >
                <option value="1h">1 Hour</option>
                <option value="6h">6 Hours</option>
                <option value="1d">1 Day</option>
                <option value="1w">1 Week</option>
              </Select>
            </div>
          </>
        )}

        {blockType === BlockType.Notification && (
          <>
            <div className="property-group">
              <label>Channel</label>
              <Select
                value={String(config.channel)}
                onChange={(e) => handleConfigChange("channel", e.target.value)}
              >
                <option value="log">Log only</option>
                <option value="webhook">Webhook</option>
              </Select>
            </div>
            <div className="property-group">
              <label>Template</label>
              <Input
                value={String(config.template || "")}
                onChange={(e) =>
                  handleConfigChange("template", e.target.value)
                }
              />
            </div>
          </>
        )}

        {blockType === BlockType.DebugLog && (
          <div className="property-group">
            <label>Label</label>
            <Input
              value={String(config.label || "")}
              placeholder="Debug label"
              onChange={(e) => handleConfigChange("label", e.target.value)}
            />
          </div>
        )}

        {blockType === BlockType.Note && (
          <div className="property-group">
            <label>Note</label>
            <textarea
              className="pb-input"
              rows={4}
              value={String(config.text || "")}
              placeholder="Write a note…"
              onChange={(e) => handleConfigChange("text", e.target.value)}
              style={{ resize: "vertical" }}
            />
          </div>
        )}

        {/* Delete button */}
        <div style={{ marginTop: 24 }}>
          <Button
            variant="danger"
            onClick={() => {
              removeNode(selectedNodeId);
              selectNode(null);
            }}
          >
            <Trash2 size={14} />
            Delete Block
          </Button>
        </div>
      </div>
    </>
  );
}
