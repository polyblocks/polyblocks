/**
 * TutorialsPanel — right-sidebar tab that explains every block with
 * visual diagrams showing inputs, outputs, and what each port does.
 */

import { useState } from "react";
import {
  BlockType,
  NodeCategory,
  BLOCK_REGISTRY,
  PortType,
  type BlockDefinition,
  type PortDefinition,
} from "@polyblocks/types";
import * as Icons from "lucide-react";
import { ChevronDown, ChevronRight, ArrowRight, ArrowLeft } from "lucide-react";

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

const PORT_TYPE_LABELS: Record<PortType, string> = {
  [PortType.Number]: "Number",
  [PortType.Boolean]: "True/False",
  [PortType.String]: "Text",
  [PortType.Market]: "Market Reference",
  [PortType.OrderBook]: "Order Book Data",
  [PortType.Order]: "Order Object",
  [PortType.Signal]: "Signal (trigger)",
  [PortType.Any]: "Any Data",
};

const CATEGORY_ORDER: NodeCategory[] = [
  NodeCategory.Trigger,
  NodeCategory.Market,
  NodeCategory.Data,
  NodeCategory.Logic,
  NodeCategory.Risk,
  NodeCategory.Action,
  NodeCategory.Utility,
];

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  [NodeCategory.Trigger]: "⚡ Triggers",
  [NodeCategory.Market]: "📊 Market",
  [NodeCategory.Data]: "📈 Data",
  [NodeCategory.Logic]: "🧠 Logic",
  [NodeCategory.Risk]: "🛡️ Risk",
  [NodeCategory.Action]: "🚀 Actions",
  [NodeCategory.Utility]: "🔧 Utility",
};

/** Detailed human-readable explanations for each block */
const BLOCK_TUTORIALS: Record<BlockType, {
  purpose: string;
  howItWorks: string;
  inputExplanations: Record<string, string>;
  outputExplanations: Record<string, string>;
  tips: string[];
}> = {
  [BlockType.IntervalTrigger]: {
    purpose: "Fires a signal at a regular time interval. This is the heartbeat of your strategy — it decides how often your strategy checks market conditions.",
    howItWorks: "Every N seconds (configurable), it emits a Signal that flows downstream to connected blocks. Think of it as a recurring alarm clock.",
    inputExplanations: {},
    outputExplanations: {
      signal: "Emitted every interval. Connect this to data blocks or logic blocks to trigger them periodically.",
    },
    tips: [
      "Start with 60s interval for testing, lower for faster strategies",
      "Too frequent triggers can hit API rate limits",
      "Combine with Cooldown block to prevent over-trading",
      "📋 Example: Interval (30s) → Price Data → Threshold ≤ 0.35 → Place Order BUY YES",
    ],
  },
  [BlockType.PriceCrossTrigger]: {
    purpose: "Fires when a market's price crosses above or below a threshold. Great for breakout or support/resistance strategies.",
    howItWorks: "Monitors the market price continuously. When the price crosses your threshold in the specified direction, it emits a signal.",
    inputExplanations: {
      market: "Connect a Market Selector here so the trigger knows which market to watch.",
    },
    outputExplanations: {
      signal: "Emitted once when the price crosses the threshold. Resets after crossing back.",
      price: "The exact price at the moment of crossing, so you can use it downstream.",
    },
    tips: [
      "Set direction to 'above' for breakout strategies, 'below' for support breaks",
      "Threshold is 0-1 (e.g., 0.65 = 65¢)",
      "📋 Example: Price Cross > 0.7 → Cooldown (5 min) → Place Order SELL YES",
    ],
  },
  [BlockType.ManualTrigger]: {
    purpose: "A button you press manually to fire a signal. Useful for testing or one-time manual strategy execution.",
    howItWorks: "When you click the trigger in the dashboard or paper run, it emits a single signal downstream.",
    inputExplanations: {},
    outputExplanations: {
      signal: "Emitted once when you manually activate it.",
    },
    tips: [
      "Great for testing your strategy flow before automating",
      "Combine with Interval Trigger — manual for testing, interval for production",
    ],
  },
  [BlockType.MarketSelector]: {
    purpose: "Select a specific Polymarket prediction market. This is the starting point for any market-related strategy.",
    howItWorks: "Search for a market visually using the Gamma API. The selected market's token ID is stored and passed to downstream blocks that need market data.",
    inputExplanations: {},
    outputExplanations: {
      market: "A Market reference containing the condition ID, token IDs, question, and prices. Connect to Price, Spread, Order Book, or action blocks.",
    },
    tips: [
      "The token_id (not condition_id) is used for all price queries",
      "Each market has YES and NO tokens — the YES token is selected by default",
      "Check volume and liquidity before trading — low-liquidity markets have wide spreads",
      "📋 Example: Market Selector → Price Data → Threshold → AND Gate → Place Order",
    ],
  },
  [BlockType.RecentCryptoMarket]: {
    purpose: "Always select the most recent live crypto market for a specific timeframe.",
    howItWorks: "Filters live Gamma markets by crypto symbol and timeframe, then outputs the most recent match whenever triggered.",
    inputExplanations: {
      trigger: "When to refresh the most recent crypto market. Connect from an Interval Trigger or Manual Trigger.",
    },
    outputExplanations: {
      market: "A Market reference for the latest matching crypto market.",
    },
    tips: [
      "Use 5m or 15m for faster signals, 1h for slower momentum checks",
      "Combine with Price Data and Threshold to trade on new crypto events",
    ],
  },
  [BlockType.PriceData]: {
    purpose: "Fetch the current mid-price and spread for a market. This is the most commonly used data block.",
    howItWorks: "When triggered, it calls the Polymarket CLOB API to get the midpoint price and bid-ask spread for the selected token.",
    inputExplanations: {
      market: "Which market to fetch prices for. Connect from a Market Selector.",
      trigger: "When to fetch. Connect from an Interval Trigger or other signal source.",
    },
    outputExplanations: {
      midpoint: "The mid-price between best bid and best ask (0-1 scale). E.g., 0.65 means 65¢.",
      spread: "The difference between best ask and best bid. Smaller = more liquid.",
    },
    tips: [
      "Mid Price is the average of best bid and best ask",
      "Wide spreads (>0.05) mean the market is illiquid — be careful with market orders",
    ],
  },
  [BlockType.SpreadData]: {
    purpose: "Get just the bid-ask spread for a market. Useful for liquidity-aware strategies.",
    howItWorks: "Calls the CLOB spread endpoint to get the current spread value.",
    inputExplanations: {
      market: "Which market to check. Connect from a Market Selector.",
      trigger: "When to check. Connect from a trigger block.",
    },
    outputExplanations: {
      spread: "The bid-ask spread as a decimal (e.g., 0.02 = 2¢ spread).",
    },
    tips: [
      "Use with a Threshold block to only trade when spread is narrow enough",
    ],
  },
  [BlockType.OrderBookData]: {
    purpose: "Get the full order book snapshot — all bids and asks with sizes.",
    howItWorks: "Fetches the complete order book from the CLOB API, giving you access to all bid/ask levels and their sizes.",
    inputExplanations: {
      market: "Which market's order book to fetch. Connect from a Market Selector.",
      trigger: "When to fetch. Connect from a trigger block.",
    },
    outputExplanations: {
      orderbook: "The full order book object with bids and asks arrays. Each entry has price and size.",
    },
    tips: [
      "Order book data is more detailed than just price — use for advanced strategies",
      "Large orders at specific price levels can indicate support/resistance",
    ],
  },
  [BlockType.AndGate]: {
    purpose: "Only pass through if BOTH conditions are true. Acts as a signal gate — blocks or allows signals based on conditions.",
    howItWorks: "Takes two boolean inputs and a signal input. Outputs the boolean result AND passes the signal through ONLY when both A AND B are true. When the gate is 'closed' (result is false), the signal is blocked.",
    inputExplanations: {
      a: "First condition (true/false). Connect from a Threshold result or another logic block.",
      b: "Second condition (true/false). Connect from a Threshold result or another logic block.",
      signal: "Signal to pass through when the gate is open (both conditions true). Connect from a Threshold signal or trigger.",
    },
    outputExplanations: {
      result: "True only when both A and B are true. False otherwise.",
      signal: "Passes the incoming signal through ONLY when result is true. Use this to gate downstream actions like Place Order.",
    },
    tips: [
      "Chain multiple AND gates for 3+ conditions",
      "Connect Threshold results → A/B inputs, Threshold signal → Signal In, AND Signal Out → Place Order",
      "📋 Example: (Threshold: price ≤ 0.40) + (Threshold: spread ≤ 0.03) → AND Gate → Place Order",
    ],
  },
  [BlockType.OrGate]: {
    purpose: "Pass through if EITHER condition is true. Acts as a signal gate — allows signals when any condition is met.",
    howItWorks: "Takes two boolean inputs and a signal input. Outputs the boolean result AND passes the signal through when either A OR B (or both) are true. When both conditions are false, the signal is blocked.",
    inputExplanations: {
      a: "First condition (true/false). Connect from a Threshold or logic block.",
      b: "Second condition (true/false). Connect from a Threshold or logic block.",
      signal: "Signal to pass through when the gate is open (any condition true). Connect from a trigger or upstream signal.",
    },
    outputExplanations: {
      result: "True when at least one of A or B is true.",
      signal: "Passes the incoming signal through ONLY when result is true. Use this to gate downstream actions.",
    },
    tips: [
      "Use for fallback conditions: buy if price < 0.4 OR spread < 0.01",
      "Connect signal through the OR gate to only trigger actions when at least one condition passes",
    ],
  },
  [BlockType.ThresholdCompare]: {
    purpose: "Compare a number against a threshold value. The core decision-making block.",
    howItWorks: "Takes a number input and compares it against your configured threshold using the chosen operator (>, >=, <, <=, ==, !=).",
    inputExplanations: {
      value: "The number to compare. Connect from Price, Spread, or Math output.",
    },
    outputExplanations: {
      result: "True/false based on the comparison. E.g., if price (0.65) >= threshold (0.60), result is true.",
      signal: "A signal that fires ONLY when the comparison is true. Use this to gate downstream actions.",
    },
    tips: [
      "Prices are 0-1 scale: 0.65 means 65¢",
      "Use >= 0.50 for 'likely yes', < 0.50 for 'likely no'",
      "Connect the Signal output to action blocks, Result to logic gates",
      "📋 Example: Price Data → Threshold ≤ 0.4 → AND Gate (with Spread ≤ 0.03) → Place Order",
    ],
  },
  [BlockType.Cooldown]: {
    purpose: "Rate-limit signals to prevent over-trading. Blocks repeated signals for a set duration.",
    howItWorks: "Passes through the first signal, then blocks all subsequent signals until the cooldown period expires.",
    inputExplanations: {
      signal: "The signal to rate-limit. Connect from any signal-producing block.",
    },
    outputExplanations: {
      signal: "The rate-limited signal. Only passes through when cooldown has expired.",
    },
    tips: [
      "300s (5min) cooldown is a good starting point",
      "Place between Threshold and Place Order to avoid rapid-fire trades",
      "📋 Example: Threshold → Cooldown (300s) → Place Order — prevents re-buying within 5 minutes",
    ],
  },
  [BlockType.MathOp]: {
    purpose: "Perform arithmetic on two numbers. Build calculated indicators from raw data.",
    howItWorks: "Takes two number inputs (A and B) and applies the selected operation: add, subtract, multiply, or divide.",
    inputExplanations: {
      a: "First number (e.g., current price from Price block).",
      b: "Second number (e.g., historical price or a constant from another source).",
    },
    outputExplanations: {
      result: "The arithmetic result: A + B, A - B, A × B, or A ÷ B.",
    },
    tips: [
      "Calculate price change: (current - previous) using subtract",
      "Calculate percentage: divide result by base price",
      "📋 Example: Price Data (YES midpoint) + Price Data (NO midpoint) → Math (Add) → Debug Log",
    ],
  },
  [BlockType.MaxExposure]: {
    purpose: "Safety guard — blocks orders if your total position size would exceed a USD limit.",
    howItWorks: "Checks current total exposure across all positions. If placing a new order would exceed the limit, the signal is blocked.",
    inputExplanations: {
      signal: "The signal to gate. Only passes through if exposure is within limits.",
    },
    outputExplanations: {
      signal: "Passes through if exposure check passes. Blocked if limit would be exceeded.",
    },
    tips: [
      "Always use this before Place Order blocks in production strategies",
      "Start with a small limit ($50-100) for paper trading",
      "📋 Example: Threshold → Max Exposure ($100) → Place Order — stops trading after $100 total",
    ],
  },
  [BlockType.DailyLossLimit]: {
    purpose: "Emergency safety — halts all trading if daily losses exceed a threshold.",
    howItWorks: "Tracks cumulative daily P&L. If losses exceed your configured limit, all downstream signals are blocked for the rest of the day.",
    inputExplanations: {
      signal: "The signal to gate. Blocked if daily loss limit has been hit.",
    },
    outputExplanations: {
      signal: "Passes through if daily losses are within the limit.",
    },
    tips: [
      "Set to an amount you're comfortable losing in a single day",
      "Resets at midnight UTC",
      "Stack with Max Exposure for double protection",
    ],
  },
  [BlockType.KillSwitch]: {
    purpose: "Emergency stop button — immediately cancels all orders and halts the strategy.",
    howItWorks: "When triggered, cancels all open orders and sets the strategy status to stopped.",
    inputExplanations: {
      trigger: "Connect from a critical condition (e.g., extreme price movement or daily loss limit breach).",
    },
    outputExplanations: {},
    tips: [
      "Connect to extreme conditions as a safety net",
      "Can also be triggered manually from the dashboard",
    ],
  },
  [BlockType.PlaceOrder]: {
    purpose: "Place a buy or sell order on a Polymarket market. This is the main action block.",
    howItWorks: "When the signal input fires, places an order on the specified market with the configured side (BUY/SELL), outcome (YES/NO), and size.",
    inputExplanations: {
      market: "Which market to trade. Connect from a Market Selector.",
      signal: "When to place the order. Only places when a signal arrives. Connect from risk blocks.",
      side: "Optional — override BUY/SELL from another block (e.g. UserActivity).",
      outcome: "Optional — override YES/NO outcome from another block.",
      sizeUsd: "Optional — override size from a Position Sizer.",
    },
    outputExplanations: {
      orderId: "The order ID string. Connect to Cancel Order if needed.",
      filled: "Signal emitted when the order is filled (executed).",
    },
    tips: [
      "Always place risk blocks (Max Exposure, Cooldown) before this block",
      "Connect a Position Sizer to dynamically calculate the right size",
      "Example strategy: Market Selector → Price Data → Threshold ≤ 0.4 → Place Order (BUY YES $10)",
    ],
  },
  [BlockType.LimitOrder]: {
    purpose: "Place a limit order at a specific price — the order sits on the book and only fills when the market reaches your price.",
    howItWorks: "Unlike Place Order (which fills at the current market price), a Limit Order lets you set a target price. Your order is posted to the order book and waits. BUY limits fill when the price drops to your level, SELL limits fill when the price rises.",
    inputExplanations: {
      market: "Which market to trade. Connect from a Market Selector.",
      signal: "When to place the limit order.",
      sizeUsd: "Optional — override size from a Position Sizer or other block.",
      limitPrice: "Optional — override the limit price dynamically from another block (e.g. a Math Op that calculates a target).",
      outcome: "Optional — override YES/NO from another block.",
      side: "Optional — override BUY/SELL from another block.",
    },
    outputExplanations: {
      orderId: "The order ID string. Connect to Cancel Order if you want to cancel after a timeout.",
      placed: "Signal emitted when the limit order is successfully posted to the book.",
    },
    tips: [
      "Use for better prices — set a BUY limit below current market price to buy cheaper",
      "Combine with Cancel Order + Delay to auto-cancel stale limits: Limit Order → Delay 60s → Cancel Order",
      "Connect a Price Data block's price output to a Math Op (subtract 0.05) → Limit Order's limitPrice input for 'buy 5¢ below market'",
      "Example strategy: Market Selector → Price Data → Math Op (price − 0.05) → Limit Order (BUY YES, limit from Math Op)",
    ],
  },
  [BlockType.CancelOrder]: {
    purpose: "Cancel a specific open order.",
    howItWorks: "When triggered, cancels the order with the given ID.",
    inputExplanations: {
      orderId: "The order ID string to cancel. Connect from Place Order's or Limit Order's orderId output.",
      signal: "When to cancel. Connect from a trigger or condition.",
    },
    outputExplanations: {
      cancelled: "Signal emitted when the cancellation is confirmed.",
    },
    tips: [
      "Use with a timeout: Place Order → Delay → Cancel if not filled",
      "Example strategy: Place Order → Delay 60s → Cancel Order",
    ],
  },
  [BlockType.ClosePosition]: {
    purpose: "Close an open position by placing an opposite marketable order.",
    howItWorks: "When triggered, places a market order to close your position in the specified market.",
    inputExplanations: {
      market: "Which market's position to close. Connect from Market Selector.",
      signal: "When to close. Connect from a trigger or condition.",
    },
    outputExplanations: {
      closed: "Signal emitted when the position is closed.",
    },
    tips: [
      "Use for take-profit or stop-loss exits",
      "Connect from a Threshold checking your P&L or price target",
    ],
  },
  [BlockType.Notification]: {
    purpose: "Send a notification when something happens. Log it or send to a webhook.",
    howItWorks: "When the signal fires, formats a message using the template and sends it to the configured channel.",
    inputExplanations: {
      signal: "When to notify. Connect from any signal source.",
      message: "Optional custom message text to include.",
    },
    outputExplanations: {},
    tips: [
      "Use {{message}} in the template to include the input message",
      "Set channel to 'webhook' and configure URL for Discord/Telegram alerts",
      "📋 Example: Place Order → Notification (email) — get notified every time a trade executes",
    ],
  },
  [BlockType.DebugLog]: {
    purpose: "Log any value to the execution trace for debugging. Doesn't affect strategy flow.",
    howItWorks: "Takes any input value and logs it to the execution trace so you can inspect it in the log drawer.",
    inputExplanations: {
      value: "Any data you want to inspect — prices, booleans, order objects, etc.",
    },
    outputExplanations: {},
    tips: [
      "Place after any block to see its output in the execution log",
      "Add a descriptive label in the config to identify logs easily",
    ],
  },
  [BlockType.Delay]: {
    purpose: "Wait a specified duration before passing a signal through.",
    howItWorks: "Receives a signal, waits for the configured number of seconds, then re-emits the signal.",
    inputExplanations: {
      signal: "The signal to delay.",
    },
    outputExplanations: {
      signal: "The same signal, emitted after the delay period.",
    },
    tips: [
      "Use between Place Order and Cancel Order for timeout patterns",
      "5-10 seconds is typical for order fill timeouts",
    ],
  },
  [BlockType.Note]: {
    purpose: "A sticky note for documenting your strategy. Not executed — purely for your reference.",
    howItWorks: "Does nothing at runtime. Write notes to yourself about what a section of your strategy does.",
    inputExplanations: {},
    outputExplanations: {},
    tips: [
      "Place near complex sections to explain your reasoning",
      "Good for sharing strategies with others",
    ],
  },
  [BlockType.NotGate]: {
    purpose: "Inverts a boolean value — true becomes false, false becomes true. The missing logic piece for complex conditions.",
    howItWorks: "Takes a boolean input and outputs the opposite value. Also emits a signal when the result is true (i.e., when the input was false).",
    inputExplanations: {
      value: "A boolean (true/false) to invert. Connect from a Threshold result or another logic block.",
    },
    outputExplanations: {
      result: "The inverted boolean — true if input was false, false if input was true.",
      signal: "Fires only when the result is true (input was false). Use this to trigger actions on the negative condition.",
    },
    tips: [
      "Example: Threshold(price >= 0.7) → NOT → \"price is below 0.7\"",
      "Chain with AND/OR gates for complex conditions like NAND, NOR, XOR",
      "Useful for building 'do NOT trade when...' conditions",
    ],
  },
  [BlockType.IfElse]: {
    purpose: "The conditional branch — routes your strategy flow into two separate paths based on a condition. Essential for strategies that should do different things in different situations.",
    howItWorks: "Takes a boolean condition and a signal. When the signal fires, it routes to the THEN output if the condition is true, or to the ELSE output if false. Only one branch fires per execution.",
    inputExplanations: {
      condition: "A boolean that decides the branch. Connect from a Threshold result, AND/OR gate, or NOT gate.",
      signal: "The signal to route. Connect from a trigger, cooldown, or risk block.",
    },
    outputExplanations: {
      then: "Signal emitted when condition is TRUE. Connect to blocks that should run in the 'yes' case.",
      else: "Signal emitted when condition is FALSE. Connect to blocks that should run in the 'no' case.",
    },
    tips: [
      "Classic pattern: IF price > 0.6 → BUY YES, ELSE → BUY NO",
      "You can chain IF/ELSE blocks for multi-branch logic (if/else if/else)",
      "The inactive branch's downstream blocks are automatically skipped",
    ],
  },
  [BlockType.MultiMarketCompare]: {
    purpose: "Compare prices between two different markets. Essential for cross-market arbitrage and relative-value strategies.",
    howItWorks: "Fetches the mid-price for both Market A and Market B, then outputs the price delta (A - B), ratio (A / B), and absolute spread between them.",
    inputExplanations: {
      marketA: "First market to compare. Connect from a Market Selector.",
      marketB: "Second market to compare. Connect from another Market Selector.",
      trigger: "When to fetch and compare. Connect from a trigger block.",
    },
    outputExplanations: {
      delta: "Price difference: Market A price minus Market B price. Positive = A is more expensive.",
      ratio: "Price ratio: Market A / Market B. Values > 1 mean A is more expensive.",
      spreadAB: "Absolute spread between the two prices (always positive).",
    },
    tips: [
      "Great for finding arbitrage: if two related markets have different implied probabilities",
      "Use Threshold on the delta/spread to trigger trades when divergence is large enough",
      "Compare YES vs YES tokens (default) or NO vs NO by changing the side config",
    ],
  },
  [BlockType.PositionSizer]: {
    purpose: "Calculate optimal bet size using the Kelly Criterion or fixed-fraction sizing. Professional bankroll management for your strategies.",
    howItWorks: "Takes the current market price and your estimated edge (how much you think the true probability differs from the market price). Uses the Kelly formula to calculate the optimal fraction of your bankroll to bet.",
    inputExplanations: {
      price: "Current market price (0–1). Connect from a Price block's midpoint output.",
      edge: "Your estimated edge: (your true probability estimate) minus (market price). Can be calculated with a Math block.",
    },
    outputExplanations: {
      sizeUsd: "The recommended position size in USD. Connect this to a Place Order block's size.",
      kellyFraction: "The Kelly fraction (0–1). Represents the optimal percentage of bankroll to bet.",
    },
    tips: [
      "Edge = your_probability - market_price. E.g., you think 70% but market says 60% → edge = 0.10",
      "Half Kelly is safer — uses half the Kelly-recommended size to reduce variance",
      "Always set a max fraction (e.g., 0.25) to prevent over-betting on uncertain edges",
      "If edge ≤ 0, the Kelly fraction will be 0 (don't bet) — which is correct!",
    ],
  },
  [BlockType.EventResolutionTrigger]: {
    purpose: "Fires when a market resolves — perfect for auto-reinvest, rebalance, or portfolio management strategies.",
    howItWorks: "Checks the Polymarket Gamma API to see if the market has been resolved (closed, no longer active). When it detects resolution, it fires a signal and provides the outcome.",
    inputExplanations: {
      market: "Which market to monitor for resolution. Connect from a Market Selector.",
    },
    outputExplanations: {
      signal: "Fires once when the market resolves. Use to trigger downstream actions like reinvesting.",
      resolved: "Boolean — true if the market has been resolved, false if still active.",
      outcome: "The resolution outcome as text (e.g., 'Yes' or 'No'). Available after resolution.",
    },
    tips: [
      "Use with a Notification block to get alerts when your markets resolve",
      "Chain with Place Order to auto-reinvest winnings into new markets",
      "The trigger checks on each iteration — it doesn't fire until resolution actually happens",
    ],
  },

  // ── Copy-Trading / Activity ───────────────────────────────────────────
  [BlockType.UserActivity]: {
    purpose: "Fetches the latest trade for any Polymarket wallet address — the building block for copy-trading strategies.",
    howItWorks: "Polls the Polymarket Activity API for the single most recent trade of the target address. Outputs a proper Market object (not just a string) so it can connect directly to Place Order. You can skip the first fetch so old positions aren't traded, and de-duplicate so the same trade is never acted on twice.",
    inputExplanations: {
      trigger: "A trigger signal that tells the block when to poll. Connect from an Interval Trigger or Manual Trigger.",
    },
    outputExplanations: {
      market: "The full market object of the latest trade. Connect directly to Place Order's Market input.",
      side: "BUY or SELL — the direction the target trader took.",
      size: "The USDC size of the target's trade.",
      price: "The price the target traded at.",
      outcome: "YES or NO — which outcome the trader bought/sold. Connect to Place Order's Outcome input.",
      title: "The market question/title as text.",
      signal: "Fires whenever a new (unseen) trade is detected.",
    },
    tips: [
      "Enable 'Skip first fetch' to avoid immediately copying old positions on startup — the trade will still appear in logs as SKIPPED",
      "Enable 'Ignore already fetched' to prevent the same trade from triggering multiple orders",
      "Connect the Market output directly to Place Order — it's a full market object, not just text",
      "Connect the Outcome output to Place Order's Outcome input to automatically match YES/NO",
      "📋 Example: Interval → User Activity (whale address) → Place Order — mirror whale trades",
    ],
  },

  // ── Probability / Math ────────────────────────────────────────────────
  [BlockType.ProbabilityCalc]: {
    purpose: "Converts a raw market price (0–1) into a human-readable implied probability percentage and calculates basic probability metrics.",
    howItWorks: "Takes the YES price from a Price Data block and outputs the implied probability, complement (NO probability), and log-odds. Useful for display, logging, or feeding into Expected Value / Edge calculations.",
    inputExplanations: {
      price: "The YES price (0–1) from a Price Data block.",
    },
    outputExplanations: {
      probability: "Implied probability as a percentage (0–100).",
      complement: "The NO probability (100 − probability).",
      logOdds: "Log-odds: ln(p / (1−p)). Useful for advanced models.",
    },
    tips: [
      "A price of 0.65 → probability = 65%, complement = 35%",
      "Log-odds are used in logistic regression and some Kelly models",
      "Chain into an Expected Value block to evaluate potential trades",
    ],
  },
  [BlockType.ExpectedValue]: {
    purpose: "Calculates the expected value (EV) of a bet given your estimated probability and the market price.",
    howItWorks: "EV = (yourProb × payout) − ((1 − yourProb) × cost). A positive EV means the bet is profitable in the long run. The payout for a YES bet at price p is (1/p − 1) × stake.",
    inputExplanations: {
      marketPrice: "The current market price (0–1) from Price Data.",
      yourProbability: "Your estimated probability (0–1) that the event occurs. Can be manual or from a model.",
    },
    outputExplanations: {
      ev: "Expected value per dollar risked. Positive = +EV (profitable). Negative = −EV (avoid).",
      isPositive: "Boolean — true if EV > 0, i.e., the trade is profitable in expectation.",
    },
    tips: [
      "Only take trades with positive EV for long-term profitability",
      "Combine with Edge Calc to get a cleaner edge signal",
      "Feed the isPositive output into an AND gate with other conditions before trading",
    ],
  },
  [BlockType.EdgeCalc]: {
    purpose: "Calculates the edge you have over the market: how much your probability estimate differs from the market's implied probability.",
    howItWorks: "Edge = yourProbability − marketPrice. A positive edge means you think the event is more likely than the market does. The block also outputs a boolean signal when edge exceeds a configurable threshold.",
    inputExplanations: {
      marketPrice: "The current market price (0–1) from Price Data.",
      yourProbability: "Your estimated probability (0–1). Can come from a model, manual input, or Probability Calc.",
    },
    outputExplanations: {
      edge: "Raw edge value: yourProbability − marketPrice. Positive = you have an edge.",
      hasEdge: "Boolean — true when edge > minEdge threshold (configurable, default 0.05).",
    },
    tips: [
      "A typical minimum edge threshold is 0.05 (5%). Below that, trading costs may eat your profits.",
      "Feed the edge output into a Position Sizer to auto-calculate Kelly bet sizing",
      "Combine hasEdge with other signals using an AND gate before placing orders",
      "If edge is negative, you're worse than the market — don't trade!",
    ],
  },
  [BlockType.CustomApiData]: {
    purpose: "Fetch data from any external API — weather, crypto prices, news sentiment, sports scores, or any REST endpoint. Brings your own data into the strategy.",
    howItWorks: "Makes an HTTP request to the configured URL when triggered. Extracts a value using a JSON path expression (e.g. 'main.temp' for weather temperature). Outputs the value as both a number and text, plus the raw JSON response.",
    inputExplanations: {
      trigger: "A signal that causes the API to be fetched. Connect from an Interval Trigger or other signal source.",
    },
    outputExplanations: {
      value: "Numeric value extracted from the JSON path. If the value isn't a number, outputs 0.",
      text: "Text/string value extracted from the JSON path.",
      json: "The full raw JSON response as a string for debugging.",
      signal: "Fires when data is successfully fetched. Null on error.",
    },
    tips: [
      "Use with weather APIs: set URL to OpenWeatherMap, JSON path to 'main.temp'",
      "Combine with Threshold Compare to make decisions based on external data",
      "Add API keys in the URL query params or in the Headers field",
      "JSON path uses dot notation: 'data.0.price' gets the first item's price",
      "📋 Example: Custom API (weather) → Threshold (temp > 30°C) → AND Gate → Place Order",
    ],
  },
};

function BlockTutorial({ def }: { def: BlockDefinition }) {
  const [expanded, setExpanded] = useState(false);
  const tutorial = BLOCK_TUTORIALS[def.type];

  return (
    <div className="tutorial-block">
      <div
        className="tutorial-block-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="tutorial-block-icon" style={{ color: def.color }}>
          {getIcon(def.icon, 18)}
        </div>
        <div className="tutorial-block-title">
          <span className="tutorial-block-name">{def.label}</span>
          <span className="tutorial-block-desc">{def.description}</span>
        </div>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </div>

      {expanded && (
        <div className="tutorial-block-body">
          {/* Visual block diagram */}
          <div className="tutorial-diagram">
            {/* Inputs side */}
            <div className="tutorial-diagram-inputs">
              {def.inputs.length > 0 ? (
                def.inputs.map((port) => (
                  <div key={port.id} className="tutorial-port-item">
                    <span className="tutorial-port-name">{port.label}</span>
                    <ArrowRight
                      size={14}
                      style={{ color: PORT_TYPE_COLORS[port.type] }}
                    />
                  </div>
                ))
              ) : (
                <div className="tutorial-no-ports">No inputs</div>
              )}
            </div>

            {/* Block visual */}
            <div
              className="tutorial-diagram-block"
              style={{ borderColor: def.color }}
            >
              <div
                className="tutorial-diagram-accent"
                style={{ background: def.color }}
              />
              <div style={{ color: def.color }}>{getIcon(def.icon, 20)}</div>
              <span>{def.label}</span>
            </div>

            {/* Outputs side */}
            <div className="tutorial-diagram-outputs">
              {def.outputs.length > 0 ? (
                def.outputs.map((port) => (
                  <div key={port.id} className="tutorial-port-item">
                    <ArrowLeft
                      size={14}
                      style={{ color: PORT_TYPE_COLORS[port.type] }}
                    />
                    <span className="tutorial-port-name">{port.label}</span>
                  </div>
                ))
              ) : (
                <div className="tutorial-no-ports">No outputs</div>
              )}
            </div>
          </div>

          {/* Purpose */}
          <div className="tutorial-section">
            <div className="tutorial-section-title">Purpose</div>
            <p>{tutorial.purpose}</p>
          </div>

          {/* How it works */}
          <div className="tutorial-section">
            <div className="tutorial-section-title">How It Works</div>
            <p>{tutorial.howItWorks}</p>
          </div>

          {/* Input explanations */}
          {def.inputs.length > 0 && (
            <div className="tutorial-section">
              <div className="tutorial-section-title">Inputs</div>
              {def.inputs.map((port) => (
                <PortExplanation
                  key={port.id}
                  port={port}
                  explanation={tutorial.inputExplanations[port.id] || ""}
                  direction="input"
                />
              ))}
            </div>
          )}

          {/* Output explanations */}
          {def.outputs.length > 0 && (
            <div className="tutorial-section">
              <div className="tutorial-section-title">Outputs</div>
              {def.outputs.map((port) => (
                <PortExplanation
                  key={port.id}
                  port={port}
                  explanation={tutorial.outputExplanations[port.id] || ""}
                  direction="output"
                />
              ))}
            </div>
          )}

          {/* Tips */}
          {tutorial.tips.length > 0 && (
            <div className="tutorial-section">
              <div className="tutorial-section-title">💡 Tips</div>
              <ul className="tutorial-tips">
                {tutorial.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PortExplanation({
  port,
  explanation,
  direction,
}: {
  port: PortDefinition;
  explanation: string;
  direction: "input" | "output";
}) {
  return (
    <div className="tutorial-port-explain">
      <div className="tutorial-port-explain-header">
        {direction === "input" ? (
          <ArrowRight size={12} style={{ color: PORT_TYPE_COLORS[port.type] }} />
        ) : (
          <ArrowLeft size={12} style={{ color: PORT_TYPE_COLORS[port.type] }} />
        )}
        <span
          className="tutorial-port-dot"
          style={{ background: PORT_TYPE_COLORS[port.type] }}
        />
        <span className="tutorial-port-explain-name">{port.label}</span>
        <span
          className="tutorial-port-explain-type"
          style={{ color: PORT_TYPE_COLORS[port.type] }}
        >
          {PORT_TYPE_LABELS[port.type]}
        </span>
      </div>
      {explanation && <p className="tutorial-port-explain-text">{explanation}</p>}
    </div>
  );
}

export default function TutorialsPanel() {
  const [expandedCategory, setExpandedCategory] = useState<NodeCategory | null>(
    NodeCategory.Trigger,
  );

  const allBlocks = Object.values(BLOCK_REGISTRY);

  return (
    <div className="tutorials-panel">
      <div className="tutorials-panel-header">
        <h3>📖 Block Tutorials</h3>
        <p>Learn what each block does, its inputs & outputs, and how to use them.</p>
      </div>
      <div className="tutorials-panel-body">
        {CATEGORY_ORDER.map((cat) => {
          const blocks = allBlocks.filter((b) => b.category === cat);
          const isOpen = expandedCategory === cat;

          return (
            <div key={cat} className="tutorial-category">
              <div
                className="tutorial-category-header"
                onClick={() =>
                  setExpandedCategory(isOpen ? null : cat)
                }
              >
                <span>{CATEGORY_LABELS[cat]}</span>
                <span className="tutorial-category-count">
                  {blocks.length} blocks
                </span>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              {isOpen && (
                <div className="tutorial-category-body">
                  {blocks.map((def) => (
                    <BlockTutorial key={def.type} def={def} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Port type legend */}
        <div className="tutorial-legend">
          <div className="tutorial-section-title">Port Type Legend</div>
          <div className="tutorial-legend-grid">
            {Object.entries(PORT_TYPE_LABELS).map(([type, label]) => (
              <div key={type} className="tutorial-legend-item">
                <span
                  className="tutorial-port-dot"
                  style={{ background: PORT_TYPE_COLORS[type as PortType] }}
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="tutorial-legend-note">
            Ports can only connect to other ports of the same type (matching colors).
            The <strong>Any</strong> type can connect to anything.
            <strong> Signal</strong> can also connect to Boolean inputs.
          </p>
        </div>
      </div>
    </div>
  );
}
