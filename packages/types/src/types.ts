// ─── Port Data Types ─────────────────────────────────────────────────────────
// Every handle (input/output port) on a node has one of these types.
// Connection validation ensures only matching types can be linked.

export enum PortType {
  Number = "number",
  Boolean = "boolean",
  String = "string",
  Market = "market",       // A Polymarket market reference (conditionId + tokenIds)
  OrderBook = "orderbook", // Snapshot of bids/asks
  Order = "order",         // A constructed order ready to execute
  Signal = "signal",       // A trigger/fire signal (carry-less)
  Any = "any",             // Accepts anything (for debugging nodes)
}

export interface PortDefinition {
  id: string;
  label: string;
  type: PortType;
  /** If true the port can accept multiple connections */
  multi?: boolean;
}

// ─── Node Categories ─────────────────────────────────────────────────────────

export enum NodeCategory {
  Trigger = "trigger",
  Market = "market",
  Data = "data",
  Logic = "logic",
  Risk = "risk",
  Action = "action",
  Utility = "utility",
}

// ─── Block Types ─────────────────────────────────────────────────────────────
// Each concrete block the user can drag onto the canvas.

export enum BlockType {
  // Triggers
  IntervalTrigger = "interval_trigger",
  PriceCrossTrigger = "price_cross_trigger",
  ManualTrigger = "manual_trigger",
  EventResolutionTrigger = "event_resolution_trigger",

  // Market
  MarketSelector = "market_selector",
  RecentCryptoMarket = "recent_crypto_market",

  // Data
  PriceData = "price_data",
  SpreadData = "spread_data",
  OrderBookData = "orderbook_data",
  MultiMarketCompare = "multi_market_compare",
  UserActivity = "user_activity",
  CustomApiData = "custom_api_data",

  // Logic
  AndGate = "and_gate",
  OrGate = "or_gate",
  NotGate = "not_gate",
  IfElse = "if_else",
  ThresholdCompare = "threshold_compare",
  Cooldown = "cooldown",
  MathOp = "math_op",
  PositionSizer = "position_sizer",
  ProbabilityCalc = "probability_calc",
  ExpectedValue = "expected_value",
  EdgeCalc = "edge_calc",

  // Risk
  MaxExposure = "max_exposure",
  DailyLossLimit = "daily_loss_limit",
  KillSwitch = "kill_switch",

  // Actions
  PlaceOrder = "place_order",
  LimitOrder = "limit_order",
  CancelOrder = "cancel_order",
  ClosePosition = "close_position",
  Notification = "notification",

  // Utility
  DebugLog = "debug_log",
  Delay = "delay",
  Note = "note",
}

// ─── Block Metadata (registry) ──────────────────────────────────────────────

export interface BlockDefinition {
  type: BlockType;
  category: NodeCategory;
  label: string;
  description: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  /** Default configuration values for this block type */
  defaultConfig: Record<string, unknown>;
  /** Color used in the canvas */
  color: string;
  /** Icon identifier (lucide icon name) */
  icon: string;
}

// ─── Canvas Node / Edge (serialisable) ──────────────────────────────────────

export interface StrategyNode {
  id: string;
  type: BlockType;
  position: { x: number; y: number };
  /** User-edited configuration for this instance */
  config: Record<string, unknown>;
  /** Optional user label override */
  label?: string;
}

export interface StrategyEdge {
  id: string;
  source: string;       // node id
  sourceHandle: string;  // port id
  target: string;       // node id
  targetHandle: string;  // port id
}

// ─── Strategy Graph (the top-level document) ────────────────────────────────

export enum StrategyStatus {
  Draft = "draft",
  PaperActive = "paper_active",
  PaperPaused = "paper_paused",
  LiveActive = "live_active",
  LivePaused = "live_paused",
  Stopped = "stopped",
}

export interface StrategyGraph {
  id: string;
  name: string;
  description?: string;
  nodes: StrategyNode[];
  edges: StrategyEdge[];
  status: StrategyStatus;
  /** Cron expression or interval‑ms for scheduled execution */
  schedule?: string;
  /** ISO timestamp */
  createdAt: string;
  updatedAt: string;
  userId: string;
  /** Schema version for migrations */
  version: number;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export enum ValidationSeverity {
  Error = "error",
  Warning = "warning",
  Info = "info",
}

export interface ValidationIssue {
  severity: ValidationSeverity;
  nodeId?: string;
  message: string;
}

// ─── Execution / Logging ────────────────────────────────────────────────────

export enum ExecutionStatus {
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Skipped = "skipped",
}

export interface NodeExecutionResult {
  nodeId: string;
  status: ExecutionStatus;
  /** Data produced by this node */
  output?: Record<string, unknown>;
  /** Duration in milliseconds */
  durationMs: number;
  error?: string;
}

export interface ExecutionLog {
  id: string;
  strategyId: string;
  /** ISO timestamp */
  startedAt: string;
  completedAt?: string;
  status: ExecutionStatus;
  nodeResults: NodeExecutionResult[];
  /** Summary for the dashboard */
  summary?: string;
}

// ─── Paper Trading ──────────────────────────────────────────────────────────

export interface PaperPosition {
  strategyId: string;
  marketConditionId: string;
  tokenId: string;
  side: "YES" | "NO";
  size: number;          // shares
  avgEntryPrice: number; // 0–1
  currentPrice: number;
  unrealizedPnl: number;
  /** ISO timestamp */
  openedAt: string;
}

export interface PaperTrade {
  id: string;
  strategyId: string;
  marketConditionId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  /** ISO timestamp */
  executedAt: string;
  /** The node that emitted this trade */
  originNodeId: string;
}

// ─── Polymarket API Types (subset) ──────────────────────────────────────────

export interface PolymarketMarket {
  conditionId: string;
  question: string;
  slug: string;
  outcomes: string[];
  outcomePrices: string[];
  clobTokenIds: string[];
  active: boolean;
  closed: boolean;
  volume: string;
  liquidity: string;
  bestBid: number;
  bestAsk: number;
  lastTradePrice: number;
  spread: number;
  endDate?: string;
  description?: string;
  tags?: string[];
  negRisk: boolean;
  /** Market image URL from Gamma API */
  image?: string;
  /** Market icon URL from Gamma API */
  icon?: string;
  /** Category from Gamma API (e.g. "Sports", "Politics") */
  category?: string;
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  tokenId: string;
}

// ─── User / Billing ────────────────────────────────────────────────────────

export enum UserTier {
  Free = "free",
  Pro = "pro",
}

export interface UserProfile {
  id: string;
  email?: string;
  walletAddress?: string;
  tier: UserTier;
  /** Max strategies allowed */
  maxStrategies: number;
  /** Whether live trading is enabled */
  liveEnabled: boolean;
  createdAt: string;
}

// ─── Templates ──────────────────────────────────────────────────────────────

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  graph: Omit<StrategyGraph, "id" | "userId" | "createdAt" | "updatedAt" | "status">;
  tags: string[];
}
