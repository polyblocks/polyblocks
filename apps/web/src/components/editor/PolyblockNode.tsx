/**
 * PolyblockNode — the custom React Flow node that renders every block type.
 * Shows visible input/output port labels with type-colored dots.
 */

import { memo, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  BlockType,
  BLOCK_REGISTRY,
  type PortDefinition,
  PortType,
} from "@polyblocks/types";
import * as Icons from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";

interface PolyblockData {
  blockType: BlockType;
  config: Record<string, unknown>;
  label?: string;
  [key: string]: unknown;
}

function getIcon(iconName: string, size = 16) {
  const name = iconName
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ size: number }>>)[name];
  return IconComponent ? <IconComponent size={size} /> : null;
}

const PORT_TYPE_COLORS: Record<PortType, string> = {
  [PortType.Number]: "#3b82f6",
  [PortType.Boolean]: "#10b981",
  [PortType.String]: "#f59e0b",
  [PortType.Market]: "#8b5cf6",
  [PortType.OrderBook]: "#06b6d4",
  [PortType.Order]: "#f97316",
  [PortType.Signal]: "#ef4444",
  [PortType.Any]: "#9ca3af",
};

const PORT_TYPE_SHORT: Record<PortType, string> = {
  [PortType.Number]: "NUM",
  [PortType.Boolean]: "BOOL",
  [PortType.String]: "STR",
  [PortType.Market]: "MKT",
  [PortType.OrderBook]: "BOOK",
  [PortType.Order]: "ORD",
  [PortType.Signal]: "SIG",
  [PortType.Any]: "ANY",
};

/** Compact config preview text */
function getConfigPreview(blockType: BlockType, config: Record<string, unknown>): string | null {
  switch (blockType) {
    case BlockType.IntervalTrigger:
      return `every ${Number(config.intervalMs) / 1000}s`;
    case BlockType.ThresholdCompare:
      return `${config.operator} ${config.threshold}`;
    case BlockType.PlaceOrder:
      return `${config.side} ${config.outcome} · $${config.sizeUsd}`;
    case BlockType.LimitOrder:
      return `${config.side} ${config.outcome} @ $${config.limitPrice} · $${config.sizeUsd}`;
    case BlockType.MaxExposure:
      return `max $${config.maxExposureUsd}`;
    case BlockType.DailyLossLimit:
      return `max -$${config.maxDailyLossUsd}`;
    case BlockType.Cooldown:
      return `${Number(config.cooldownMs) / 1000}s cooldown`;
    case BlockType.PriceCrossTrigger:
      return `${config.direction} ${config.threshold}`;
    case BlockType.MarketSelector: {
      const q = config.question as string | undefined;
      if (q) return q.length > 30 ? q.slice(0, 28) + "…" : q;
      return config.conditionId ? "Market set" : "No market";
    }
    case BlockType.RecentCryptoMarket: {
      const symbol = String(config.cryptoSymbol || "BTC");
      const tf = String(config.timeframe || "1h");
      return `${symbol} · ${tf}`;
    }
    case BlockType.NotGate:
      return "¬ invert";
    case BlockType.IfElse:
      return "IF → THEN / ELSE";
    case BlockType.MultiMarketCompare:
      return `Δ price (${config.side || "YES"})`;
    case BlockType.PositionSizer:
      return `${config.mode || "kelly"} · $${config.bankroll || 1000}`;
    case BlockType.EventResolutionTrigger:
      return "on resolve";
    case BlockType.UserActivity:
      return config.targetAddress
        ? `${(config.targetAddress as string).slice(0, 6)}…`
        : "No target";
    case BlockType.ProbabilityCalc:
      return "price → prob%";
    case BlockType.ExpectedValue:
      return "EV calc";
    case BlockType.EdgeCalc:
      return `min edge ${config.minEdge || 0.05}`;
    case BlockType.CustomApiData: {
      const u = config.url as string | undefined;
      if (u) {
        try { return new URL(u).hostname; } catch { return u.length > 25 ? u.slice(0, 23) + "…" : u; }
      }
      return "No URL set";
    }
    default:
      return null;
  }
}

function ManualFireButton() {
  const fireManualTrigger = useEditorStore((s) => s.fireManualTrigger);
  const isRunning = useEditorStore((s) => s.isRunning);
  const [firing, setFiring] = useState(false);

  const handleFire = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // don't select the node
    if (firing) return;
    setFiring(true);
    try {
      await fireManualTrigger();
    } finally {
      setFiring(false);
    }
  }, [fireManualTrigger, firing]);

  return (
    <button
      className={`pb-manual-fire-btn ${firing ? "firing" : ""}`}
      onClick={handleFire}
      disabled={isRunning}
      title={isRunning ? "Stop continuous run first" : "Fire this trigger once"}
    >
      <Icons.Zap size={13} />
      {firing ? "Firing…" : "Fire"}
    </button>
  );
}

function PolyblockNode({ id, data, selected }: NodeProps) {
  const blockData = data as unknown as PolyblockData;
  const def = BLOCK_REGISTRY[blockData.blockType];
  const selectNode = useEditorStore((s) => s.selectNode);

  if (!def) return <div className="pb-node">Unknown block</div>;

  const displayLabel = blockData.label || def.label;
  const preview = getConfigPreview(blockData.blockType, blockData.config);

  return (
    <div
      className={`pb-node ${selected ? "selected" : ""}`}
      style={{ borderColor: selected ? def.color : undefined }}
      onClick={() => {
        // Direct DOM click handler — fires on every click regardless of React Flow
        // No stopPropagation so React Flow's onNodeClick also fires
        selectNode(id);
      }}
    >
      {/* Category accent bar */}
      <div className="pb-node-accent" style={{ background: def.color }} />

      {/* Header */}
      <div className="pb-node-header">
        <div className="icon-box" style={{ color: def.color }}>
          {getIcon(def.icon)}
        </div>
        <span className="title">{displayLabel}</span>
      </div>

      {/* Config preview */}
      {preview && (
        <div className="pb-node-preview">{preview}</div>
      )}

      {/* Manual Trigger fire button */}
      {blockData.blockType === BlockType.ManualTrigger && (
        <div className="pb-node-fire-row">
          <ManualFireButton />
        </div>
      )}

      {/* Port rows: inputs on left, outputs on right */}
      {(def.inputs.length > 0 || def.outputs.length > 0) && (
        <div className="pb-node-ports">
          <div className="pb-node-ports-col pb-node-ports-in">
            {(() => {
              // MathOp: generate dynamic input ports based on inputCount
              let inputPorts: PortDefinition[] = def.inputs;
              if (blockData.blockType === BlockType.MathOp) {
                const count = Number(blockData.config.inputCount || 2);
                const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                inputPorts = [];
                for (let i = 0; i < count; i++) {
                  inputPorts.push({
                    id: letters[i].toLowerCase(),
                    label: letters[i],
                    type: PortType.Number,
                  });
                }
              }
              return inputPorts.map((port: PortDefinition) => (
              <div key={port.id} className="pb-port-row pb-port-in" id={`port-in-${port.id}`}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={port.id}
                  data-port-type={port.type}
                  className="pb-handle-inline"
                />
                <span
                  className="pb-port-dot"
                  style={{ background: PORT_TYPE_COLORS[port.type] }}
                />
                <span className="pb-port-label">{port.label}</span>
                <span className="pb-port-type" style={{ color: PORT_TYPE_COLORS[port.type] }}>
                  {PORT_TYPE_SHORT[port.type]}
                </span>
              </div>
            ));
            })()}
          </div>
          <div className="pb-node-ports-col pb-node-ports-out">
            {def.outputs.map((port: PortDefinition) => (
              <div key={port.id} className="pb-port-row pb-port-out" id={`port-out-${port.id}`}>
                <span className="pb-port-type" style={{ color: PORT_TYPE_COLORS[port.type] }}>
                  {PORT_TYPE_SHORT[port.type]}
                </span>
                <span className="pb-port-label">{port.label}</span>
                <span
                  className="pb-port-dot"
                  style={{ background: PORT_TYPE_COLORS[port.type] }}
                />
                <Handle
                  type="source"
                  position={Position.Right}
                  id={port.id}
                  data-port-type={port.type}
                  className="pb-handle-inline"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(PolyblockNode);
