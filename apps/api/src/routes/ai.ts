/**
 * AI Strategy Builder route — uses Google Vertex AI Global Endpoint (Gemini 2.5 Flash) to generate strategy
 */

import type { FastifyInstance } from "fastify";
import { sessionsCol, usersCol, type DbUser } from "../db.js";

// ── Auth helper (mirrors auth.ts pattern) ────────────────────────────────

async function resolveSession(token: string): Promise<string | null> {
  if (!token) return null;
  const session = await sessionsCol().findOne({ _id: token });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await sessionsCol().deleteOne({ _id: token });
    return null;
  }
  return session.userId;
}

// ── System prompt ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert strategy builder for Polyblocks, a visual node-based strategy builder for Polymarket prediction markets.

Your job is to convert a user's natural language description into a valid strategy graph (JSON) that can be loaded onto the canvas.

## Block Types Available
CRITICAL: The "type" field must use the EXACT snake_case values shown below. Do NOT use PascalCase.

### Trigger Blocks (start execution flow)
- type: "interval_trigger" — Fires on a timer. Config: { intervalMs: number }. Outputs: signal.
- type: "price_cross_trigger" — Fires when price crosses a threshold. Config: { threshold: number, direction: "above"|"below", side: "YES"|"NO" }. Inputs: market. Outputs: signal.
- type: "manual_trigger" — User clicks to fire. Outputs: signal.
- type: "event_resolution_trigger" — Fires when a market resolves. Inputs: market. Outputs: signal, outcome(string).

### Market Blocks
- type: "market_selector" — Select a Polymarket market. Config: { conditionId: "", question: "" }. Outputs: market.
- type: "recent_crypto_market" — Get the currently LIVE crypto market, auto-updates at each interval boundary. Config: { cryptoSymbol: "BTC", timeframe: "5m"|"15m"|"1h" }. Inputs: trigger(signal). Outputs: market.

### Data Blocks (fetch live data)
- type: "price_data" — Get current price. Config: { side: "YES"|"NO" }. Inputs: market, trigger(signal). Outputs: midpoint(number), bestBid(number), bestAsk(number).
- type: "spread_data" — Get bid-ask spread. Inputs: market, trigger(signal). Outputs: spread(number), bidSize(number), askSize(number).
- type: "orderbook_data" — Get full order book. Inputs: market, trigger(signal). Outputs: orderbook, depth(number).
- type: "price_history" — Get historical prices. Config: { periods: number, intervalMs: number }. Inputs: market, trigger(signal). Outputs: prices(number), avgPrice(number), minPrice(number), maxPrice(number).
- type: "multi_market_compare" — Compare prices across markets. Config: { count: number }. Inputs: marketA(market), marketB(market), trigger(signal). Outputs: diff(number), ratio(number).
- type: "user_activity" — Fetch a user's latest Polymarket trade (copy-trading / monitoring). Config: { targetAddress: string (wallet address), ignoreFirstFetch: boolean (skip first poll to avoid trading old positions, shows as SKIPPED in logs), ignoreDuplicates: boolean (only process new trades) }. Inputs: trigger(signal). Outputs: market(market — full market object, connect directly to place_order), side(string), size(number), price(number), outcome(string — YES or NO), title(string), signal.
- type: "custom_api_data" — Fetch data from any external REST API (weather, crypto, news, etc.). Config: { url: string (full URL with query params/API key), method: "GET"|"POST", headers: string (JSON object), body: string (JSON for POST), jsonPath: string (dot-separated path to extract value, e.g. "main.temp" or "data.0.price") }. Inputs: trigger(signal). Outputs: value(number — extracted numeric value), text(string — extracted text), json(string — full response), signal.

### Logic Blocks (decide / compute)
- type: "and_gate" — AND gate: passes signal through only when BOTH boolean conditions are true. Inputs: a(boolean), b(boolean), signal(signal). Outputs: result(boolean), signal(signal — only fires when result is true).
- type: "or_gate" — OR gate: passes signal through when ANY boolean condition is true. Inputs: a(boolean), b(boolean), signal(signal). Outputs: result(boolean), signal(signal — only fires when result is true).
- type: "not_gate" — Invert a signal. Inputs: signal. Outputs: signal.
- type: "if_else" — Route signal based on boolean. Inputs: condition(boolean), signal. Outputs: then(signal), else(signal).
- type: "threshold_compare" — Compare a number to a threshold. Config: { operator: ">"|">="|"<"|"<="|"=="|"!=", threshold: number }. Inputs: value(number). Outputs: result(boolean), signal.
- type: "cooldown" — Rate-limit signals. Config: { cooldownMs: number }. Inputs: signal. Outputs: signal.
- type: "math_op" — Arithmetic on multiple numbers. Config: { operator: "+"|"-"|"*"|"/", inputCount: number (2-10, default 2) }. Inputs: a(number), b(number), c(number)... up to inputCount. Outputs: result(number).
- type: "position_sizer" — Calculate optimal bet size (Kelly Criterion). Config: { bankroll: number, maxFraction: number, mode: "kelly"|"fixed" }. Inputs: price(number), edge(number). Outputs: sizeUsd(number), kellyFraction(number).
- type: "probability_calc" — Convert a market price to implied probability, complement, and decimal odds. Config: { vigAdjust: boolean, vig: number (default 0.02) }. Inputs: price(number). Outputs: impliedProb(number), complement(number), odds(number).
- type: "expected_value" — Calculate Expected Value: EV = estimatedProb − marketPrice. Fires signal when EV ≥ minEv. Config: { minEv: number (default 0) }. Inputs: estimatedProb(number), marketPrice(number). Outputs: ev(number), evPercent(number), signal.
- type: "edge_calc" — Calculate edge = estimatedProb − marketPrice. Fires signal when edge ≥ minEdge. Config: { minEdge: number (default 0.02) }. Inputs: estimatedProb(number), marketPrice(number). Outputs: edge(number), edgePercent(number), signal. TIP: connect edge output to position_sizer's edge input for Kelly sizing.

### Risk Blocks (gate signals with safety checks)
- type: "max_exposure" — Block if total exposure exceeds limit. Config: { maxExposureUsd: number }. Inputs: signal. Outputs: signal.
- type: "daily_loss_limit" — Kill if daily loss exceeds limit. Config: { maxDailyLossUsd: number }. Inputs: signal. Outputs: signal.
- type: "kill_switch" — Emergency stop — cancels all orders. Config: { cancelAll: true }. Inputs: trigger(signal). No outputs.

### Action Blocks (execute trades)
- type: "place_order" — Place an order. Config: { side: "BUY"|"SELL", outcome: "YES"|"NO", sizeUsd: number, preventDuplicate: boolean (skip if same market/side/outcome already traded this run) }. Inputs: market, signal, side(string, optional — overrides config side), sizeUsd(number, optional — overrides config sizeUsd if connected), outcome(string, optional — overrides config outcome if connected, e.g. from user_activity). Outputs: orderId(string), filled(signal). TIP: connect user_activity's outcome output → place_order's outcome input for copy-trading.
- type: "limit_order" — Place a limit order at a specific price (only fills when market reaches price). Config: { side: "BUY"|"SELL", outcome: "YES"|"NO", sizeUsd: number, limitPrice: number (0-1), preventDuplicate: boolean (skip if same market/side/outcome already traded this run) }. Inputs: market, signal, sizeUsd(number, optional), limitPrice(number, optional), outcome(string, optional), side(string, optional). Outputs: orderId(string), placed(signal).
- type: "cancel_order" — Cancel an order. Inputs: orderId(string), signal. Outputs: cancelled(signal).
- type: "close_position" — Close a position. Inputs: market, signal. Outputs: closed(signal).
- type: "notification" — Send a notification. Config: { channel: "log"|"email"|"telegram", template: string }. Inputs: signal, message(string). No outputs.

### Utility Blocks
- type: "debug_log" — Log any value. Config: { label: string }. Inputs: value(any). No outputs.
- type: "delay" — Wait before passing signal. Config: { delayMs: number }. Inputs: signal. Outputs: signal.
- type: "note" — Sticky note for documentation. Config: { text: string }. Not executed.

VALID TYPE VALUES (use ONLY these exact strings):
interval_trigger, price_cross_trigger, manual_trigger, event_resolution_trigger,
market_selector, recent_crypto_market, price_data, spread_data, orderbook_data, multi_market_compare, user_activity, custom_api_data,
and_gate, or_gate, not_gate, if_else, threshold_compare, cooldown, math_op, position_sizer,
probability_calc, expected_value, edge_calc,
max_exposure, daily_loss_limit, kill_switch,
place_order, limit_order, cancel_order, close_position, notification,
debug_log, delay, note

## Port Connection Rules
- Ports have types: number, boolean, string, market, orderbook, order, signal, any.
- You can only connect ports of matching types (or to "any" type ports).
- Signal ports gate execution flow — if a signal input is not satisfied, the node is skipped.
- Data flows through number/market/orderbook/order/string ports.
- Every strategy needs at least one Trigger block to start execution.
- Data blocks (price_data, spread_data, etc.) need both a market input AND a trigger (signal) input.

## Layout Guidelines
- Place nodes left-to-right in execution order.
- Start X around 50-100, increment by ~300 for each column.
- Y positions: keep related nodes close, spread different branches by ~150-200px.
- Typical flow: Trigger → Market → Data → Logic/Comparison → Risk → Action

## Output Format
Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{
  "name": "Strategy Name",
  "explanation": "A short 2-3 sentence description of how this strategy works and what it does.",
  "nodes": [
    {
      "id": "n1",
      "type": "snake_case block type from the list above",
      "position": { "x": 100, "y": 100 },
      "config": { ... },
      "label": "optional descriptive label"
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n1",
      "sourceHandle": "port id from source node outputs",
      "target": "n2",
      "targetHandle": "port id on target node inputs"
    }
  ]
}

## Example 1: Simple Price Alert
User: "Alert me when a market price goes above 70 cents"
{
  "name": "Price Alert > 70¢",
  "nodes": [
    { "id": "n1", "type": "market_selector", "position": { "x": 100, "y": 200 }, "config": { "conditionId": "", "question": "" } },
    { "id": "n2", "type": "interval_trigger", "position": { "x": 100, "y": 50 }, "config": { "intervalMs": 60000 } },
    { "id": "n3", "type": "price_data", "position": { "x": 400, "y": 150 }, "config": { "side": "YES" } },
    { "id": "n4", "type": "threshold_compare", "position": { "x": 700, "y": 150 }, "config": { "operator": ">=", "threshold": 0.7 } },
    { "id": "n5", "type": "notification", "position": { "x": 1000, "y": 150 }, "config": { "channel": "log", "template": "Price crossed 70¢: {{value}}" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "sourceHandle": "market", "target": "n3", "targetHandle": "market" },
    { "id": "e2", "source": "n2", "sourceHandle": "signal", "target": "n3", "targetHandle": "trigger" },
    { "id": "e3", "source": "n3", "sourceHandle": "midpoint", "target": "n4", "targetHandle": "value" },
    { "id": "e4", "source": "n4", "sourceHandle": "signal", "target": "n5", "targetHandle": "signal" }
  ]
}

## Example 2: Momentum Buyer with Risk
User: "Buy YES when price is above 55 cents with a 10 minute cooldown and $25 daily loss limit"
{
  "name": "Momentum Buyer",
  "nodes": [
    { "id": "n1", "type": "market_selector", "position": { "x": 50, "y": 200 }, "config": { "conditionId": "", "question": "" } },
    { "id": "n2", "type": "interval_trigger", "position": { "x": 50, "y": 50 }, "config": { "intervalMs": 120000 } },
    { "id": "n3", "type": "price_data", "position": { "x": 350, "y": 150 }, "config": { "side": "YES" } },
    { "id": "n4", "type": "threshold_compare", "position": { "x": 650, "y": 100 }, "config": { "operator": ">=", "threshold": 0.55 }, "label": "Price > 55¢?" },
    { "id": "n5", "type": "cooldown", "position": { "x": 950, "y": 100 }, "config": { "cooldownMs": 600000 } },
    { "id": "n6", "type": "daily_loss_limit", "position": { "x": 1200, "y": 100 }, "config": { "maxDailyLossUsd": 25 } },
    { "id": "n7", "type": "place_order", "position": { "x": 1500, "y": 100 }, "config": { "side": "BUY", "outcome": "YES", "sizeUsd": 10 } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "sourceHandle": "market", "target": "n3", "targetHandle": "market" },
    { "id": "e2", "source": "n2", "sourceHandle": "signal", "target": "n3", "targetHandle": "trigger" },
    { "id": "e3", "source": "n3", "sourceHandle": "midpoint", "target": "n4", "targetHandle": "value" },
    { "id": "e4", "source": "n4", "sourceHandle": "signal", "target": "n5", "targetHandle": "signal" },
    { "id": "e5", "source": "n5", "sourceHandle": "signal", "target": "n6", "targetHandle": "signal" },
    { "id": "e6", "source": "n6", "sourceHandle": "signal", "target": "n7", "targetHandle": "signal" },
    { "id": "e7", "source": "n1", "sourceHandle": "market", "target": "n7", "targetHandle": "market" }
  ]
}

IMPORTANT RULES:
1. Always include at least one Trigger block and a market_selector.
2. Data blocks MUST have both market AND trigger (signal) inputs connected.
3. place_order and close_position MUST have a market input connected.
4. Use proper port IDs that match the block definitions above.
5. Give nodes descriptive labels when it helps readability.
6. Always include at least one Risk block (max_exposure or daily_loss_limit) when the strategy involves trading.
7. CRITICAL: The "type" field MUST be one of the exact snake_case values listed above. Never use PascalCase.
8. Include a short "explanation" field (2-3 sentences) in the JSON root that describes how the strategy works in plain English.
`;

// ── Route registration ───────────────────────────────────────────────────

export async function registerAiRoutes(app: FastifyInstance) {
  const VERTEX_AI_KEY = process.env.VERTEX_AI_KEY || "";

  if (!VERTEX_AI_KEY) {
    app.log.warn("VERTEX_AI_KEY not set — AI builder will return errors");
  }

  /**
   * POST /api/ai/generate
   * Body: { prompt: string }
   * Headers: x-session-token
   * Returns: { strategy: { name, nodes, edges } }
   */
  app.post("/generate", async (req, reply) => {
    // ── Auth: require Pro ─────────────────────────────────────────────────
    const token = (req.headers["x-session-token"] as string) || "";
    const userId = await resolveSession(token);
    if (!userId) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    const user = await usersCol().findOne({ _id: userId });
    if (!user) {
      return reply.code(401).send({ error: "User not found" });
    }

    // Check pro status (with expiry check)
    if (user.tier !== "pro" || (user.expiresAt && new Date(user.expiresAt) < new Date())) {
      return reply.code(403).send({ error: "Pro subscription required for AI Strategy Builder" });
    }

    // ── Validate input ───────────────────────────────────────────────────
    const { prompt } = req.body as { prompt?: string };
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return reply.code(400).send({ error: "Please provide a strategy description (at least 5 characters)" });
    }

    if (prompt.length > 2000) {
      return reply.code(400).send({ error: "Prompt is too long (max 2000 characters)" });
    }

    if (!VERTEX_AI_KEY) {
      return reply.code(500).send({ error: "AI service not configured. Please contact support." });
    }

    // ── Call Google Vertex AI Global Endpoint (Gemini 2.5 Flash) ─────────────
    try {
      const globalEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
      
      const vertexRes = await fetch(`${globalEndpoint}?key=${VERTEX_AI_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${SYSTEM_PROMPT}\n\nUser request: ${prompt}`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_NONE"
            }
          ]
        }),
      });

      if (!vertexRes.ok) {
        const errBody = await vertexRes.text();
        app.log.error(`Google Vertex AI error ${vertexRes.status}: ${errBody}`);
        if (vertexRes.status === 429) {
          return reply.code(429).send({ error: "AI rate limit reached. Please wait a moment and try again." });
        }
        return reply.code(500).send({ error: "AI generation failed. Please try again." });
      }

      const vertexData = await vertexRes.json() as {
        candidates?: { content?: { parts?: [{ text?: string }] } }[];
      };
      const text = vertexData.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // Parse the JSON response
      let strategy: { name?: string; nodes?: unknown[]; edges?: unknown[] };
      try {
        strategy = JSON.parse(text);
      } catch {
        // Try to extract JSON from potential markdown code fences
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          strategy = JSON.parse(jsonMatch[0]);
        } else {
          return reply.code(500).send({ error: "AI returned invalid response. Please try again." });
        }
      }

      // Basic validation
      if (!strategy.nodes || !Array.isArray(strategy.nodes) || strategy.nodes.length === 0) {
        return reply.code(500).send({ error: "AI generated an empty strategy. Please try a more specific prompt." });
      }

      // ── Normalize block types (PascalCase → snake_case fallback) ────────
      const PASCAL_TO_SNAKE: Record<string, string> = {
        IntervalTrigger: "interval_trigger",
        PriceCrossTrigger: "price_cross_trigger",
        ManualTrigger: "manual_trigger",
        EventResolutionTrigger: "event_resolution_trigger",
        MarketSelector: "market_selector",
        RecentCryptoMarket: "recent_crypto_market",
        PriceData: "price_data",
        SpreadData: "spread_data",
        OrderBookData: "orderbook_data",
        MultiMarketCompare: "multi_market_compare",
        UserActivity: "user_activity",
        CustomApiData: "custom_api_data",
        AndGate: "and_gate",
        OrGate: "or_gate",
        NotGate: "not_gate",
        IfElse: "if_else",
        ThresholdCompare: "threshold_compare",
        Cooldown: "cooldown",
        MathOp: "math_op",
        PositionSizer: "position_sizer",
        ProbabilityCalc: "probability_calc",
        ExpectedValue: "expected_value",
        EdgeCalc: "edge_calc",
        MaxExposure: "max_exposure",
        DailyLossLimit: "daily_loss_limit",
        KillSwitch: "kill_switch",
        PlaceOrder: "place_order",
        LimitOrder: "limit_order",
        CancelOrder: "cancel_order",
        ClosePosition: "close_position",
        Notification: "notification",
        DebugLog: "debug_log",
        Delay: "delay",
        Note: "note",
      };

      const VALID_TYPES = new Set(Object.values(PASCAL_TO_SNAKE));

      for (const node of strategy.nodes as { type: string }[]) {
        if (node.type && !VALID_TYPES.has(node.type)) {
          // Try PascalCase mapping
          if (PASCAL_TO_SNAKE[node.type]) {
            node.type = PASCAL_TO_SNAKE[node.type];
          }
        }
      }

      if (!strategy.edges || !Array.isArray(strategy.edges)) {
        strategy.edges = [];
      }

      if (!strategy.name || typeof strategy.name !== "string") {
        strategy.name = "AI Generated Strategy";
      }

      return reply.send({
        strategy: {
          name: strategy.name,
          explanation: (strategy as any).explanation || "",
          nodes: strategy.nodes,
          edges: strategy.edges,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      app.log.error(`AI generation failed: ${message}`);

      if (message.includes("content_filter") || message.includes("content management")) {
        return reply.code(400).send({ error: "Your prompt was flagged by content filters. Please rephrase." });
      }

      if (message.includes("429") || message.includes("quota") || message.includes("Too Many Requests") || message.includes("RateLimitReached")) {
        return reply.code(429).send({ error: "AI rate limit reached. Please wait a moment and try again." });
      }

      return reply.code(500).send({ error: "AI generation failed. Please try again." });
    }
  });
}
