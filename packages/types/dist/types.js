// ─── Port Data Types ─────────────────────────────────────────────────────────
// Every handle (input/output port) on a node has one of these types.
// Connection validation ensures only matching types can be linked.
export var PortType;
(function (PortType) {
    PortType["Number"] = "number";
    PortType["Boolean"] = "boolean";
    PortType["String"] = "string";
    PortType["Market"] = "market";
    PortType["OrderBook"] = "orderbook";
    PortType["Order"] = "order";
    PortType["Signal"] = "signal";
    PortType["Any"] = "any";
})(PortType || (PortType = {}));
// ─── Node Categories ─────────────────────────────────────────────────────────
export var NodeCategory;
(function (NodeCategory) {
    NodeCategory["Trigger"] = "trigger";
    NodeCategory["Market"] = "market";
    NodeCategory["Data"] = "data";
    NodeCategory["Logic"] = "logic";
    NodeCategory["Risk"] = "risk";
    NodeCategory["Action"] = "action";
    NodeCategory["Utility"] = "utility";
})(NodeCategory || (NodeCategory = {}));
// ─── Block Types ─────────────────────────────────────────────────────────────
// Each concrete block the user can drag onto the canvas.
export var BlockType;
(function (BlockType) {
    // Triggers
    BlockType["IntervalTrigger"] = "interval_trigger";
    BlockType["PriceCrossTrigger"] = "price_cross_trigger";
    BlockType["ManualTrigger"] = "manual_trigger";
    BlockType["EventResolutionTrigger"] = "event_resolution_trigger";
    // Market
    BlockType["MarketSelector"] = "market_selector";
    // Data
    BlockType["PriceData"] = "price_data";
    BlockType["SpreadData"] = "spread_data";
    BlockType["OrderBookData"] = "orderbook_data";
    BlockType["PriceHistory"] = "price_history";
    BlockType["MultiMarketCompare"] = "multi_market_compare";
    // Logic
    BlockType["AndGate"] = "and_gate";
    BlockType["OrGate"] = "or_gate";
    BlockType["NotGate"] = "not_gate";
    BlockType["IfElse"] = "if_else";
    BlockType["ThresholdCompare"] = "threshold_compare";
    BlockType["Cooldown"] = "cooldown";
    BlockType["MathOp"] = "math_op";
    BlockType["PositionSizer"] = "position_sizer";
    // Risk
    BlockType["MaxExposure"] = "max_exposure";
    BlockType["DailyLossLimit"] = "daily_loss_limit";
    BlockType["KillSwitch"] = "kill_switch";
    // Actions
    BlockType["PlaceOrder"] = "place_order";
    BlockType["CancelOrder"] = "cancel_order";
    BlockType["ClosePosition"] = "close_position";
    BlockType["Notification"] = "notification";
    // Utility
    BlockType["DebugLog"] = "debug_log";
    BlockType["Delay"] = "delay";
    BlockType["Note"] = "note";
})(BlockType || (BlockType = {}));
// ─── Strategy Graph (the top-level document) ────────────────────────────────
export var StrategyStatus;
(function (StrategyStatus) {
    StrategyStatus["Draft"] = "draft";
    StrategyStatus["PaperActive"] = "paper_active";
    StrategyStatus["PaperPaused"] = "paper_paused";
    StrategyStatus["LiveActive"] = "live_active";
    StrategyStatus["LivePaused"] = "live_paused";
    StrategyStatus["Stopped"] = "stopped";
})(StrategyStatus || (StrategyStatus = {}));
// ─── Validation ─────────────────────────────────────────────────────────────
export var ValidationSeverity;
(function (ValidationSeverity) {
    ValidationSeverity["Error"] = "error";
    ValidationSeverity["Warning"] = "warning";
    ValidationSeverity["Info"] = "info";
})(ValidationSeverity || (ValidationSeverity = {}));
// ─── Execution / Logging ────────────────────────────────────────────────────
export var ExecutionStatus;
(function (ExecutionStatus) {
    ExecutionStatus["Running"] = "running";
    ExecutionStatus["Completed"] = "completed";
    ExecutionStatus["Failed"] = "failed";
    ExecutionStatus["Skipped"] = "skipped";
})(ExecutionStatus || (ExecutionStatus = {}));
// ─── User / Billing ────────────────────────────────────────────────────────
export var UserTier;
(function (UserTier) {
    UserTier["Free"] = "free";
    UserTier["Pro"] = "pro";
})(UserTier || (UserTier = {}));
//# sourceMappingURL=types.js.map