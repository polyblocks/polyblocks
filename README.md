# Polyblocks

**No-code Polymarket strategy builder.** Drag blocks onto a canvas, connect them, and build automated prediction market trading strategies — visually.

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![React Flow](https://img.shields.io/badge/React_Flow-12-ff0072)

## Architecture

```
polyblocks/
├── apps/
│   ├── web/          → Vite + React + React Flow (strategy editor UI)
│   └── api/          → Fastify + BullMQ (execution engine + API)
├── packages/
│   ├── types/        → Shared TypeScript types (nodes, edges, strategy schema)
│   ├── engine-core/  → Graph evaluator, topological sort, validation (pure logic)
│   └── ui/           → Shared React components + design tokens
├── turbo.json        → Turborepo build pipeline
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)

### Install & Run

```bash
# Install all dependencies
pnpm install

# Start both frontend and API in dev mode
pnpm dev
```

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3001

## Block Types

| Category | Blocks | Description |
|----------|--------|-------------|
| 🟡 **Trigger** | Interval, Price Cross, Manual | Start your strategy flow |
| 🟣 **Market** | Market Selector | Pick a Polymarket prediction market |
| 🔵 **Data** | Price, Spread, Order Book, Price History | Read live market data |
| 🟢 **Logic** | AND, OR, Threshold, Cooldown, Math | Conditional decision-making |
| 🔴 **Risk** | Max Exposure, Daily Loss Limit, Kill Switch | Safety guardrails |
| 🟠 **Action** | Place Order, Cancel, Close Position, Notify | Execute trades (paper/live) |
| ⚫ **Utility** | Debug Log, Delay, Note | Development helpers |

## Core Features

- **Visual strategy builder** — drag-and-drop blocks with typed input/output ports
- **Connection validation** — only compatible port types can be linked
- **Graph validation** — checks for cycles, disconnected nodes, missing config
- **Paper trading** — simulated order execution against real Polymarket CLOB data
- **Execution logs** — per-node debug trace with timing information
- **Templates** — pre-built strategies (Price Alert, Spread Scalper, Momentum)
- **Export/Import** — save strategies as JSON files
- **Scheduled execution** — run strategies on configurable intervals

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/strategies` | List saved strategies |
| POST | `/api/strategies` | Save a strategy |
| GET | `/api/strategies/:id` | Get a strategy |
| DELETE | `/api/strategies/:id` | Delete a strategy |
| POST | `/api/execution/run` | Run a strategy once (paper) |
| GET | `/api/execution/logs/:id` | Get execution logs |
| GET | `/api/markets/search` | Search Polymarket markets |
| GET | `/api/markets/book?token_id=` | Get order book |
| GET | `/api/markets/midpoint?token_id=` | Get mid price |
| GET | `/api/markets/spread?token_id=` | Get bid-ask spread |

## Roadmap

- [ ] Persistent storage (PostgreSQL + Drizzle ORM)
- [ ] User authentication (wallet connect)
- [ ] Live trading with encrypted API key storage
- [ ] WebSocket push for real-time strategy status
- [ ] Backtesting engine with historical data
- [ ] Paid tier with cloud runner (Stripe USDC payments)
- [ ] Advanced analytics dashboard (P&L curves, drawdown, Sharpe)

## License

MIT