import {
  BlockDefinition,
  BlockType,
  NodeCategory,
  PortType,
} from "./types.js";

// ─── Color Palette per Category ─────────────────────────────────────────────

const COLORS: Record<NodeCategory, string> = {
  [NodeCategory.Trigger]: "#f59e0b",  // amber
  [NodeCategory.Market]: "#8b5cf6",   // violet
  [NodeCategory.Data]: "#3b82f6",     // blue
  [NodeCategory.Logic]: "#10b981",    // emerald
  [NodeCategory.Risk]: "#ef4444",     // red
  [NodeCategory.Action]: "#f97316",   // orange
  [NodeCategory.Utility]: "#6b7280",  // gray
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const BLOCK_REGISTRY: Record<BlockType, BlockDefinition> = {
  // ── Triggers ──────────────────────────────────────────────────────────────

  [BlockType.IntervalTrigger]: {
    type: BlockType.IntervalTrigger,
    category: NodeCategory.Trigger,
    label: "Interval Trigger",
    description: "Fires a signal at a fixed time interval",
    inputs: [],
    outputs: [{ id: "signal", label: "Signal", type: PortType.Signal }],
    defaultConfig: { intervalMs: 60_000 },
    color: COLORS[NodeCategory.Trigger],
    icon: "timer",
  },

  [BlockType.PriceCrossTrigger]: {
    type: BlockType.PriceCrossTrigger,
    category: NodeCategory.Trigger,
    label: "Price Cross Trigger",
    description: "Fires when a market price crosses a threshold",
    inputs: [
      { id: "market", label: "Market", type: PortType.Market },
    ],
    outputs: [
      { id: "signal", label: "Signal", type: PortType.Signal },
      { id: "price", label: "Price", type: PortType.Number },
    ],
    defaultConfig: { threshold: 0.5, direction: "above" },
    color: COLORS[NodeCategory.Trigger],
    icon: "trending-up",
  },

  [BlockType.ManualTrigger]: {
    type: BlockType.ManualTrigger,
    category: NodeCategory.Trigger,
    label: "Manual Trigger",
    description: "Fires when manually activated by the user",
    inputs: [],
    outputs: [{ id: "signal", label: "Signal", type: PortType.Signal }],
    defaultConfig: {},
    color: COLORS[NodeCategory.Trigger],
    icon: "hand",
  },

  [BlockType.EventResolutionTrigger]: {
    type: BlockType.EventResolutionTrigger,
    category: NodeCategory.Trigger,
    label: "Event Resolution",
    description: "Fires when a market resolves — detects outcome",
    inputs: [
      { id: "market", label: "Market", type: PortType.Market },
    ],
    outputs: [
      { id: "signal", label: "Signal", type: PortType.Signal },
      { id: "resolved", label: "Resolved", type: PortType.Boolean },
      { id: "outcome", label: "Outcome", type: PortType.String },
    ],
    defaultConfig: {},
    color: COLORS[NodeCategory.Trigger],
    icon: "flag",
  },

  // ── Market ────────────────────────────────────────────────────────────────

  [BlockType.MarketSelector]: {
    type: BlockType.MarketSelector,
    category: NodeCategory.Market,
    label: "Market Selector",
    description: "Select a Polymarket prediction market",
    inputs: [],
    outputs: [{ id: "market", label: "Market", type: PortType.Market }],
    defaultConfig: {
      conditionId: "",
      tokenId: "",
      question: "",
      image: "",
      groupItemTitle: "",
      eventTitle: "",
      eventSlug: "",
      outcomePrices: [],
      outcomes: [],
      clobTokenIds: [],
    },
    color: COLORS[NodeCategory.Market],
    icon: "search",
  },

  // ── Data ──────────────────────────────────────────────────────────────────

  [BlockType.PriceData]: {
    type: BlockType.PriceData,
    category: NodeCategory.Data,
    label: "Price",
    description: "Get the current mid/best price for a market",
    inputs: [
      { id: "market", label: "Market", type: PortType.Market },
      { id: "trigger", label: "Trigger", type: PortType.Signal },
    ],
    outputs: [
      { id: "midpoint", label: "Mid Price", type: PortType.Number },
      { id: "spread", label: "Spread", type: PortType.Number },
    ],
    defaultConfig: { side: "YES" },
    color: COLORS[NodeCategory.Data],
    icon: "dollar-sign",
  },

  [BlockType.SpreadData]: {
    type: BlockType.SpreadData,
    category: NodeCategory.Data,
    label: "Spread",
    description: "Get the bid-ask spread for a market",
    inputs: [
      { id: "market", label: "Market", type: PortType.Market },
      { id: "trigger", label: "Trigger", type: PortType.Signal },
    ],
    outputs: [
      { id: "spread", label: "Spread", type: PortType.Number },
    ],
    defaultConfig: {},
    color: COLORS[NodeCategory.Data],
    icon: "arrow-left-right",
  },

  [BlockType.OrderBookData]: {
    type: BlockType.OrderBookData,
    category: NodeCategory.Data,
    label: "Order Book",
    description: "Get the full order book snapshot",
    inputs: [
      { id: "market", label: "Market", type: PortType.Market },
      { id: "trigger", label: "Trigger", type: PortType.Signal },
    ],
    outputs: [
      { id: "orderbook", label: "Book", type: PortType.OrderBook },
    ],
    defaultConfig: {},
    color: COLORS[NodeCategory.Data],
    icon: "book-open",
  },

  [BlockType.PriceHistory]: {
    type: BlockType.PriceHistory,
    category: NodeCategory.Data,
    label: "Price History",
    description: "Get historical OHLC price data",
    inputs: [
      { id: "market", label: "Market", type: PortType.Market },
      { id: "trigger", label: "Trigger", type: PortType.Signal },
    ],
    outputs: [
      { id: "prices", label: "History", type: PortType.Any },
    ],
    defaultConfig: { interval: "1h", fidelity: 60 },
    color: COLORS[NodeCategory.Data],
    icon: "line-chart",
  },

  [BlockType.MultiMarketCompare]: {
    type: BlockType.MultiMarketCompare,
    category: NodeCategory.Data,
    label: "Compare Markets",
    description: "Compare prices between two markets — delta, ratio, and spread",
    inputs: [
      { id: "marketA", label: "Market A", type: PortType.Market },
      { id: "marketB", label: "Market B", type: PortType.Market },
      { id: "trigger", label: "Trigger", type: PortType.Signal },
    ],
    outputs: [
      { id: "delta", label: "Delta", type: PortType.Number },
      { id: "ratio", label: "Ratio", type: PortType.Number },
      { id: "spreadAB", label: "Spread", type: PortType.Number },
    ],
    defaultConfig: { side: "YES" },
    color: COLORS[NodeCategory.Data],
    icon: "columns",
  },

  // ── Logic ─────────────────────────────────────────────────────────────

  [BlockType.AndGate]: {
    type: BlockType.AndGate,
    category: NodeCategory.Logic,
    label: "AND",
    description: "Outputs true only if ALL inputs are true",
    inputs: [
      { id: "a", label: "A", type: PortType.Boolean },
      { id: "b", label: "B", type: PortType.Boolean },
    ],
    outputs: [
      { id: "result", label: "Result", type: PortType.Boolean },
    ],
    defaultConfig: {},
    color: COLORS[NodeCategory.Logic],
    icon: "git-merge",
  },

  [BlockType.OrGate]: {
    type: BlockType.OrGate,
    category: NodeCategory.Logic,
    label: "OR",
    description: "Outputs true if ANY input is true",
    inputs: [
      { id: "a", label: "A", type: PortType.Boolean },
      { id: "b", label: "B", type: PortType.Boolean },
    ],
    outputs: [
      { id: "result", label: "Result", type: PortType.Boolean },
    ],
    defaultConfig: {},
    color: COLORS[NodeCategory.Logic],
    icon: "git-branch",
  },

  [BlockType.NotGate]: {
    type: BlockType.NotGate,
    category: NodeCategory.Logic,
    label: "NOT",
    description: "Inverts a boolean — true becomes false, false becomes true",
    inputs: [
      { id: "value", label: "Value", type: PortType.Boolean },
    ],
    outputs: [
      { id: "result", label: "Result", type: PortType.Boolean },
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    defaultConfig: {},
    color: COLORS[NodeCategory.Logic],
    icon: "toggle-left",
  },

  [BlockType.IfElse]: {
    type: BlockType.IfElse,
    category: NodeCategory.Logic,
    label: "IF / ELSE",
    description: "Routes signal to THEN or ELSE branch based on a condition",
    inputs: [
      { id: "condition", label: "Condition", type: PortType.Boolean },
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    outputs: [
      { id: "then", label: "Then", type: PortType.Signal },
      { id: "else", label: "Else", type: PortType.Signal },
    ],
    defaultConfig: {},
    color: COLORS[NodeCategory.Logic],
    icon: "git-pull-request",
  },

  [BlockType.ThresholdCompare]: {
    type: BlockType.ThresholdCompare,
    category: NodeCategory.Logic,
    label: "Threshold",
    description: "Compare a value against a threshold",
    inputs: [
      { id: "value", label: "Value", type: PortType.Number },
    ],
    outputs: [
      { id: "result", label: "Result", type: PortType.Boolean },
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    defaultConfig: { operator: ">=", threshold: 0.5 },
    color: COLORS[NodeCategory.Logic],
    icon: "scale",
  },

  [BlockType.Cooldown]: {
    type: BlockType.Cooldown,
    category: NodeCategory.Logic,
    label: "Cooldown",
    description: "Rate-limit signals — blocks re-fire for a duration",
    inputs: [
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    outputs: [
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    defaultConfig: { cooldownMs: 300_000 },
    color: COLORS[NodeCategory.Logic],
    icon: "clock",
  },

  [BlockType.MathOp]: {
    type: BlockType.MathOp,
    category: NodeCategory.Logic,
    label: "Math",
    description: "Perform arithmetic on two numbers",
    inputs: [
      { id: "a", label: "A", type: PortType.Number },
      { id: "b", label: "B", type: PortType.Number },
    ],
    outputs: [
      { id: "result", label: "Result", type: PortType.Number },
    ],
    defaultConfig: { operator: "+" },
    color: COLORS[NodeCategory.Logic],
    icon: "calculator",
  },

  [BlockType.PositionSizer]: {
    type: BlockType.PositionSizer,
    category: NodeCategory.Logic,
    label: "Position Sizer",
    description: "Calculate optimal bet size using Kelly Criterion or fixed fraction",
    inputs: [
      { id: "price", label: "Price", type: PortType.Number },
      { id: "edge", label: "Edge", type: PortType.Number },
    ],
    outputs: [
      { id: "sizeUsd", label: "Size $", type: PortType.Number },
      { id: "kellyFraction", label: "Kelly %", type: PortType.Number },
    ],
    defaultConfig: { bankroll: 1000, maxFraction: 0.25, mode: "kelly" },
    color: COLORS[NodeCategory.Logic],
    icon: "percent",
  },

  // ── Risk ──────────────────────────────────────────────────────────────

  [BlockType.MaxExposure]: {
    type: BlockType.MaxExposure,
    category: NodeCategory.Risk,
    label: "Max Exposure",
    description: "Block orders if total exposure exceeds limit",
    inputs: [
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    outputs: [
      { id: "signal", label: "Passed", type: PortType.Signal },
    ],
    defaultConfig: { maxExposureUsd: 100 },
    color: COLORS[NodeCategory.Risk],
    icon: "shield",
  },

  [BlockType.DailyLossLimit]: {
    type: BlockType.DailyLossLimit,
    category: NodeCategory.Risk,
    label: "Daily Loss Limit",
    description: "Kill strategy if daily loss exceeds limit",
    inputs: [
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    outputs: [
      { id: "signal", label: "Passed", type: PortType.Signal },
    ],
    defaultConfig: { maxDailyLossUsd: 50 },
    color: COLORS[NodeCategory.Risk],
    icon: "alert-triangle",
  },

  [BlockType.KillSwitch]: {
    type: BlockType.KillSwitch,
    category: NodeCategory.Risk,
    label: "Kill Switch",
    description: "Emergency stop — cancels all orders and halts strategy",
    inputs: [
      { id: "trigger", label: "Trigger", type: PortType.Signal },
    ],
    outputs: [],
    defaultConfig: { cancelAll: true },
    color: COLORS[NodeCategory.Risk],
    icon: "power-off",
  },

  // ── Actions ───────────────────────────────────────────────────────────────

  [BlockType.PlaceOrder]: {
    type: BlockType.PlaceOrder,
    category: NodeCategory.Action,
    label: "Place Order",
    description: "Place a limit or marketable-limit order",
    inputs: [
      { id: "market", label: "Market", type: PortType.Market },
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    outputs: [
      { id: "order", label: "Order", type: PortType.Order },
      { id: "filled", label: "Filled", type: PortType.Signal },
    ],
    defaultConfig: { side: "BUY", outcome: "YES", orderType: "GTC", sizeUsd: 10 },
    color: COLORS[NodeCategory.Action],
    icon: "send",
  },

  [BlockType.CancelOrder]: {
    type: BlockType.CancelOrder,
    category: NodeCategory.Action,
    label: "Cancel Order",
    description: "Cancel a specific open order",
    inputs: [
      { id: "order", label: "Order", type: PortType.Order },
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    outputs: [
      { id: "cancelled", label: "Cancelled", type: PortType.Signal },
    ],
    defaultConfig: {},
    color: COLORS[NodeCategory.Action],
    icon: "x-circle",
  },

  [BlockType.ClosePosition]: {
    type: BlockType.ClosePosition,
    category: NodeCategory.Action,
    label: "Close Position",
    description: "Close an open position (marketable limit order)",
    inputs: [
      { id: "market", label: "Market", type: PortType.Market },
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    outputs: [
      { id: "closed", label: "Closed", type: PortType.Signal },
    ],
    defaultConfig: {},
    color: COLORS[NodeCategory.Action],
    icon: "log-out",
  },

  [BlockType.Notification]: {
    type: BlockType.Notification,
    category: NodeCategory.Action,
    label: "Notify",
    description: "Send a notification (log, webhook, email)",
    inputs: [
      { id: "signal", label: "Signal", type: PortType.Signal },
      { id: "message", label: "Message", type: PortType.String },
    ],
    outputs: [],
    defaultConfig: { channel: "log", template: "Strategy event: {{message}}" },
    color: COLORS[NodeCategory.Action],
    icon: "bell",
  },

  // ── Utility ───────────────────────────────────────────────────────────────

  [BlockType.DebugLog]: {
    type: BlockType.DebugLog,
    category: NodeCategory.Utility,
    label: "Debug Log",
    description: "Log any value to the execution trace",
    inputs: [
      { id: "value", label: "Value", type: PortType.Any },
    ],
    outputs: [],
    defaultConfig: { label: "" },
    color: COLORS[NodeCategory.Utility],
    icon: "bug",
  },

  [BlockType.Delay]: {
    type: BlockType.Delay,
    category: NodeCategory.Utility,
    label: "Delay",
    description: "Wait before passing a signal through",
    inputs: [
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    outputs: [
      { id: "signal", label: "Signal", type: PortType.Signal },
    ],
    defaultConfig: { delayMs: 5_000 },
    color: COLORS[NodeCategory.Utility],
    icon: "hourglass",
  },

  [BlockType.Note]: {
    type: BlockType.Note,
    category: NodeCategory.Utility,
    label: "Note",
    description: "A sticky note for documentation — not executed",
    inputs: [],
    outputs: [],
    defaultConfig: { text: "" },
    color: COLORS[NodeCategory.Utility],
    icon: "sticky-note",
  },
};
