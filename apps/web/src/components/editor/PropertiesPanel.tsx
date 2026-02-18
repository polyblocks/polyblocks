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
import { X, Trash2, Settings, BookOpen, Sparkles } from "lucide-react";
import MarketPicker from "./MarketPicker";
import CryptoMarketPicker from "./CryptoMarketPicker";
import TutorialsPanel from "./TutorialsPanel";
import AiBuilderPanel from "./AiBuilderPanel";

type RightTab = "properties" | "tutorials" | "ai";

export default function PropertiesPanel() {
  const [activeTab, setActiveTab] = useState<RightTab>("properties");
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
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
        <button
          className={`right-panel-tab ai-tab ${activeTab === "ai" ? "active" : ""}`}
          onClick={() => setActiveTab("ai")}
        >
          <Sparkles size={14} />
          AI
        </button>
      </div>

      {activeTab === "tutorials" ? (
        <TutorialsPanel />
      ) : activeTab === "ai" ? (
        <AiBuilderPanel />
      ) : (
        <PropertiesContent
          selectedNodeId={selectedNodeId}
          nodes={nodes}
          edges={edges}
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
  edges,
  updateNodeConfig,
  updateNodeLabel,
  removeNode,
  selectNode,
}: {
  selectedNodeId: string | null;
  nodes: ReturnType<typeof useEditorStore.getState>["nodes"];
  edges: ReturnType<typeof useEditorStore.getState>["edges"];
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

  // Check if a specific input port has a connected wire
  const isPortWired = (portId: string) =>
    edges.some((e) => e.target === selectedNodeId && e.targetHandle === portId);

  const sizeWired = isPortWired("sizeUsd");
  const outcomeWired = isPortWired("outcome");
  const sideWired = isPortWired("side");
  const limitPriceWired = isPortWired("limitPrice");

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
        {blockType === BlockType.RecentCryptoMarket && (
          <div className="property-group">
            <label>Crypto Market</label>
            <CryptoMarketPicker config={config} onConfigChange={handleConfigChange} />
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
              <label>Order Type</label>
              <Select
                value={String(config.orderType || "FOK")}
                onChange={(e) => handleConfigChange("orderType", e.target.value)}
              >
                <option value="FOK">FOK — Fill or Kill</option>
                <option value="FAK">FAK — Fill and Kill</option>
              </Select>
              <p style={{ color: "var(--pb-text-muted)", fontSize: 11, margin: "4px 0 0 0" }}>
                {String(config.orderType || "FOK") === "FOK"
                  ? "Market order — fill entire amount or cancel. Best price found automatically."
                  : "Market order — fill what's available now, cancel the rest. Best price found automatically."}
              </p>
            </div>
            <div className="property-group">
              <label>Side</label>
              <Select
                value={String(config.side)}
                onChange={(e) => handleConfigChange("side", e.target.value)}
                disabled={sideWired}
                style={sideWired ? { opacity: 0.4, pointerEvents: "none" } : {}}
              >
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </Select>
              {sideWired && <p style={{ color: "var(--pb-accent)", fontSize: 11, margin: "4px 0 0 0" }}>⚡ Controlled by connected wire</p>}
            </div>
            <div className="property-group">
              <label>Outcome</label>
              <Select
                value={String(config.outcome)}
                onChange={(e) => handleConfigChange("outcome", e.target.value)}
                disabled={outcomeWired}
                style={outcomeWired ? { opacity: 0.4, pointerEvents: "none" } : {}}
              >
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </Select>
              {outcomeWired && <p style={{ color: "var(--pb-accent)", fontSize: 11, margin: "4px 0 0 0" }}>⚡ Controlled by connected wire</p>}
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
                disabled={sizeWired}
                style={sizeWired ? { opacity: 0.4, pointerEvents: "none" } : {}}
              />
              {sizeWired && <p style={{ color: "var(--pb-accent)", fontSize: 11, margin: "4px 0 0 0" }}>⚡ Size controlled by connected wire</p>}
            </div>
            <div className="property-group">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={Boolean(config.preventDuplicate)}
                  onChange={(e) => handleConfigChange("preventDuplicate", e.target.checked)}
                  style={{ accentColor: "var(--pb-accent)" }}
                />
                Prevent duplicate trades
              </label>
              <p style={{ color: "var(--pb-text-muted)", fontSize: 11, margin: "4px 0 0 0" }}>
                Skip if the same market/side/outcome was already traded this run
              </p>
            </div>
          </>
        )}

        {blockType === BlockType.LimitOrder && (
          <>
            <div className="property-group">
              <label>Side</label>
              <Select
                value={String(config.side)}
                onChange={(e) => handleConfigChange("side", e.target.value)}
                disabled={sideWired}
                style={sideWired ? { opacity: 0.4, pointerEvents: "none" } : {}}
              >
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </Select>
              {sideWired && <p style={{ color: "var(--pb-accent)", fontSize: 11, margin: "4px 0 0 0" }}>⚡ Controlled by connected wire</p>}
            </div>
            <div className="property-group">
              <label>Outcome</label>
              <Select
                value={String(config.outcome)}
                onChange={(e) => handleConfigChange("outcome", e.target.value)}
                disabled={outcomeWired}
                style={outcomeWired ? { opacity: 0.4, pointerEvents: "none" } : {}}
              >
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </Select>
              {outcomeWired && <p style={{ color: "var(--pb-accent)", fontSize: 11, margin: "4px 0 0 0" }}>⚡ Controlled by connected wire</p>}
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
                disabled={sizeWired}
                style={sizeWired ? { opacity: 0.4, pointerEvents: "none" } : {}}
              />
              {sizeWired && <p style={{ color: "var(--pb-accent)", fontSize: 11, margin: "4px 0 0 0" }}>⚡ Size controlled by connected wire</p>}
            </div>
            <div className="property-group">
              <label>Limit Price</label>
              <Input
                type="number"
                min={0.01}
                max={0.99}
                step={0.01}
                value={Number(config.limitPrice)}
                onChange={(e) =>
                  handleConfigChange("limitPrice", Number(e.target.value))
                }
                disabled={limitPriceWired}
                style={limitPriceWired ? { opacity: 0.4, pointerEvents: "none" } : {}}
              />
              {limitPriceWired
                ? <p style={{ color: "var(--pb-accent)", fontSize: 11, margin: "4px 0 0 0" }}>⚡ Limit price controlled by connected wire</p>
                : <p style={{ color: "var(--pb-text-muted)", fontSize: 11, margin: "4px 0 0 0" }}>Order only fills when market price reaches this level</p>
              }
            </div>
            <div className="property-group">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={Boolean(config.preventDuplicate)}
                  onChange={(e) => handleConfigChange("preventDuplicate", e.target.checked)}
                  style={{ accentColor: "var(--pb-accent)" }}
                />
                Prevent duplicate trades
              </label>
              <p style={{ color: "var(--pb-text-muted)", fontSize: 11, margin: "4px 0 0 0" }}>
                Skip if the same market/side/outcome was already traded this run
              </p>
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
          <>
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
            <div className="property-group">
              <label>Number of Inputs</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Input
                  type="number"
                  min={2}
                  max={10}
                  value={Number(config.inputCount || 2)}
                  onChange={(e) => handleConfigChange("inputCount", Math.max(2, Math.min(10, Number(e.target.value))))}
                  style={{ width: 70 }}
                />
                <Button
                  size="sm"
                  onClick={() => handleConfigChange("inputCount", Math.min(10, Number(config.inputCount || 2) + 1))}
                >
                  + Add Input
                </Button>
              </div>
              <p style={{ color: "var(--pb-text-muted)", fontSize: 11, margin: "4px 0 0 0" }}>
                Inputs are labeled a, b, c, d… (up to 10)
              </p>
            </div>
          </>
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

        {blockType === BlockType.ProbabilityCalc && (
          <>
            <div className="property-group">
              <p style={{ color: "var(--pb-text-muted)", fontSize: 12, margin: 0 }}>
                Converts a market price (0–1) to implied probability, complement (1 − prob),
                and decimal odds.
              </p>
            </div>
            <div className="property-group">
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(config.vigAdjust)}
                  onChange={(e) => handleConfigChange("vigAdjust", e.target.checked)}
                />
                Remove vig (juice)
              </label>
            </div>
            {Boolean(config.vigAdjust) && (
              <div className="property-group">
                <label>Vig / Juice (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={0.2}
                  step={0.005}
                  value={Number(config.vig)}
                  onChange={(e) => handleConfigChange("vig", Number(e.target.value))}
                />
              </div>
            )}
          </>
        )}

        {blockType === BlockType.ExpectedValue && (
          <>
            <div className="property-group">
              <p style={{ color: "var(--pb-text-muted)", fontSize: 12, margin: 0 }}>
                Calculates Expected Value (EV) = your estimated probability − market price.
                Fires a signal when EV ≥ minimum.
              </p>
            </div>
            <div className="property-group">
              <label>Min EV to signal</label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={Number(config.minEv)}
                onChange={(e) => handleConfigChange("minEv", Number(e.target.value))}
              />
            </div>
          </>
        )}

        {blockType === BlockType.EdgeCalc && (
          <>
            <div className="property-group">
              <p style={{ color: "var(--pb-text-muted)", fontSize: 12, margin: 0 }}>
                Edge = estimated true probability − market implied probability.
                Fires a signal when edge ≥ minimum.
                Connect the edge output to a Position Sizer for Kelly sizing.
              </p>
            </div>
            <div className="property-group">
              <label>Min Edge to signal</label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.005}
                value={Number(config.minEdge)}
                onChange={(e) => handleConfigChange("minEdge", Number(e.target.value))}
              />
            </div>
          </>
        )}

        {blockType === BlockType.UserActivity && (
          <>
            <div className="property-group">
              <label>Target Wallet Address</label>
              <Input
                value={String(config.targetAddress || "")}
                placeholder="0x..."
                onChange={(e) => handleConfigChange("targetAddress", e.target.value)}
              />
            </div>
            <div className="property-group">
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(config.ignoreFirstFetch)}
                  onChange={(e) => handleConfigChange("ignoreFirstFetch", e.target.checked)}
                />
                Ignore first fetch
              </label>
              <p style={{ color: "var(--pb-text-muted)", fontSize: 11, margin: "4px 0 0 0" }}>
                Skip the first poll so it doesn't trade old positions
              </p>
            </div>
            <div className="property-group">
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(config.ignoreDuplicates)}
                  onChange={(e) => handleConfigChange("ignoreDuplicates", e.target.checked)}
                />
                Ignore already-fetched trades
              </label>
              <p style={{ color: "var(--pb-text-muted)", fontSize: 11, margin: "4px 0 0 0" }}>
                Dedup — only process trades not seen in previous polls
              </p>
            </div>
          </>
        )}

        {blockType === BlockType.CustomApiData && (
          <>
            <div className="property-group">
              <label>API URL</label>
              <Input
                value={String(config.url || "")}
                placeholder="https://api.openweathermap.org/data/2.5/weather?q=London&appid=YOUR_KEY"
                onChange={(e) => handleConfigChange("url", e.target.value)}
              />
              <p style={{ color: "var(--pb-text-muted)", fontSize: 11, margin: "4px 0 0 0" }}>
                Full URL including query parameters and API key
              </p>
            </div>
            <div className="property-group">
              <label>Method</label>
              <Select
                value={String(config.method || "GET")}
                onChange={(e) => handleConfigChange("method", e.target.value)}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </Select>
            </div>
            <div className="property-group">
              <label>Headers (JSON)</label>
              <Input
                value={String(config.headers || "{}")}
                placeholder='{"Authorization": "Bearer ..."}'
                onChange={(e) => handleConfigChange("headers", e.target.value)}
              />
            </div>
            <div className="property-group">
              <label>JSON Path</label>
              <Input
                value={String(config.jsonPath || "")}
                placeholder="main.temp  or  data.0.price"
                onChange={(e) => handleConfigChange("jsonPath", e.target.value)}
              />
              <p style={{ color: "var(--pb-text-muted)", fontSize: 11, margin: "4px 0 0 0" }}>
                Dot-separated path to extract a value from the response. E.g. "main.temp" for weather data.
              </p>
            </div>
            {String(config.method || "GET") !== "GET" && (
              <div className="property-group">
                <label>Request Body (JSON)</label>
                <Input
                  value={String(config.body || "")}
                  placeholder='{"query": "..."}'
                  onChange={(e) => handleConfigChange("body", e.target.value)}
                />
              </div>
            )}
          </>
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

        {blockType === BlockType.Notification && (
          <>
            <div className="property-group">
              <label>Channel</label>
              <Select
                value={String(config.channel)}
                onChange={(e) => handleConfigChange("channel", e.target.value)}
              >
                <option value="log">Log only</option>
                <option value="email">Email</option>
                <option value="telegram">Telegram</option>
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
