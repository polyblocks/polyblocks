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
  [BlockType.PriceHistory]: {
    purpose: "Get historical price data over time. Useful for moving average and trend-following strategies.",
    howItWorks: "Fetches timestamped price history from the CLOB API at your chosen interval (1h, 6h, 1d, 1w).",
    inputExplanations: {
      market: "Which market's history to fetch. Connect from a Market Selector.",
      trigger: "When to fetch. Connect from a trigger block.",
    },
    outputExplanations: {
      prices: "Array of {t: timestamp, p: price} objects representing the price history.",
    },
    tips: [
      "Use 1h interval for short-term strategies, 1d for longer-term trends",
      "Combine with Math blocks to calculate moving averages",
    ],
  },
  [BlockType.AndGate]: {
    purpose: "Only pass through if BOTH conditions are true. Essential for multi-condition strategies.",
    howItWorks: "Takes two boolean inputs. Outputs true only when both A AND B are true. Otherwise outputs false.",
    inputExplanations: {
      a: "First condition (true/false). Connect from a Threshold or another logic block.",
      b: "Second condition (true/false). Connect from a Threshold or another logic block.",
    },
    outputExplanations: {
      result: "True only when both A and B are true. False otherwise.",
    },
    tips: [
      "Chain multiple AND gates for 3+ conditions",
      "Example: price above 0.6 AND spread below 0.03 → place order",
    ],
  },
  [BlockType.OrGate]: {
    purpose: "Pass through if EITHER condition is true. For strategies that should trigger on multiple conditions.",
    howItWorks: "Takes two boolean inputs. Outputs true when either A OR B (or both) are true.",
    inputExplanations: {
      a: "First condition (true/false). Connect from a Threshold or logic block.",
      b: "Second condition (true/false). Connect from a Threshold or logic block.",
    },
    outputExplanations: {
      result: "True when at least one of A or B is true.",
    },
    tips: [
      "Use for fallback conditions: buy if price < 0.4 OR spread < 0.01",
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
    },
    outputExplanations: {
      order: "The order object with details (ID, price, size, status). Connect to Cancel Order if needed.",
      filled: "Signal emitted when the order is filled (executed).",
    },
    tips: [
      "GTC = Good-Till-Cancelled (limit order, waits for fill)",
      "FOK = Fill-Or-Kill (market order, fills immediately or cancels)",
      "Always place risk blocks (Max Exposure, Cooldown) before this block",
    ],
  },
  [BlockType.CancelOrder]: {
    purpose: "Cancel a specific open order.",
    howItWorks: "When triggered, cancels the order connected to the input.",
    inputExplanations: {
      order: "The order to cancel. Connect from Place Order's order output.",
      signal: "When to cancel. Connect from a trigger or condition.",
    },
    outputExplanations: {
      cancelled: "Signal emitted when the cancellation is confirmed.",
    },
    tips: [
      "Use with a timeout: place order → delay → cancel if not filled",
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
