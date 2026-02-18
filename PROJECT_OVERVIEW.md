# PROJECT_OVERVIEW.md

## Polyblocks: Detailed Codebase & Context Overview (as of Feb 2026)

### Project Purpose
Polyblocks is a modular, block-based trading automation platform for prediction markets (Polymarket). Users build strategies visually on a canvas by connecting typed blocks, then run them in paper or live mode with logs and analytics.

### Repository Layout
- **Monorepo**: pnpm workspaces + TurboRepo + TypeScript
- **Apps**
  - `apps/api`: Fastify backend for auth, strategy CRUD, market data, execution, and scheduling. MongoDB persistence.
  - `apps/web`: Vite + React frontend with the block editor, dashboards, and account flows.
- **Packages**
  - `packages/engine-core`: Pure execution engine (graph utilities, evaluator, validator)
  - `packages/types`: Shared strategy schema, block registry, port types, execution logs
  - `packages/ui`: Shared UI components and styles

### Core Architecture
- **Frontend**
  - React + React Router for routing
  - Zustand stores for auth, editor state, copy trading state
  - React Flow-based editor (canvas, nodes, edges, properties panel, logs drawer)
- **Backend**
  - Fastify server with route modules
  - MongoDB for users, sessions, strategies, credentials, logs
  - Strategy scheduler for persistent background runs
  - Polymarket integrations via Gamma and CLOB endpoints

### Execution Model (Engine-Core)
- **Graph Representation**
  - Nodes are `StrategyNode` objects with type, position, and config
  - Edges connect output ports to input ports
  - `StrategyGraph` is the serialized document shared by API and Web
- **Validation**
  - Must be DAG (no cycles)
  - At least one trigger block
  - Port type compatibility enforced (signal/boolean/market/number/etc.)
  - Disconnected nodes reported as warnings or info
- **Evaluation**
  - Topologically sorted nodes are executed in order
  - Each node uses a handler registered by type
  - Signal ports gate downstream execution
  - Execution produces per-node results and a summarized log

### Backend: Major Routes
- **Auth** (`/api/auth`)
  - Google OAuth (redirect-based)
  - Email/password login + registration
  - Sessions stored in MongoDB with TTL
  - Pro tier gating with expiration checks
- **Strategies** (`/api/strategies`)
  - CRUD for strategy graphs (MongoDB)
  - Stored per userId, returns summaries for library
- **Execution** (`/api/execution`)
  - `/run` executes once (paper or live)
  - `/schedule/*` starts/stops background schedules
  - `/logs` returns execution logs per strategy
- **Markets** (`/api/markets`)
  - Gamma API search and event lookup
  - CLOB endpoints for book, midpoint, spread
  - Normalized market shape returned to frontend
- **Credentials** (`/api/credentials`)
  - Encrypted Polymarket API keys (AES-256-GCM)
  - Save/test/clear credentials per user

### Paper vs Live Trading
- **Paper Mode**
  - Simulated order execution using real market data
  - Handlers fetch CLOB data and log node outputs
- **Live Mode**
  - Uses Polymarket CLOB SDK with real wallet signing
  - Signature type and funder address auto-corrected
  - Credentials loaded and decrypted at runtime

### Frontend: Major Screens and Flows
- **App routing**
  - `/landing` public landing page
  - `/auth/callback` OAuth redirect handler
  - Protected routes under `Layout` (dashboard, editor, templates, library, settings, pricing, copy trading, backtesting, positions)
- **Editor**
  - Central Zustand store is the single source of truth
  - Nodes/edges are serialized to StrategyGraph
  - Validation runs before execution or schedule start
  - Logs, paper trades, and positions are fetched from API
- **Auth**
  - Local storage caches user + token
  - `/api/auth/me` verifies session on startup

### Data Model Summary
- **StrategyGraph**
  - id, name, status, nodes, edges, metadata
- **Node/Edge**
  - Nodes define config and position
  - Edges define source/target ports
- **Execution Logs**
  - Per-node status, output, duration
  - Strategy summary and timestamps
- **Paper Trades/Positions**
  - Trade history and derived positions for paper mode

### Development Workflow
- `pnpm install`
- `pnpm dev` (Turbo) runs API and Web
- API default: http://localhost:3001
- Web default: http://localhost:5173
- Build and lint via Turbo (`pnpm build`, `pnpm lint`)

### Notable Notes
- Backend is Fastify (not Express)
- Project overview previously mentioned removal of notifications, but block registry still includes `Notification` and paper handlers contain email/Telegram helpers. This is a current mismatch to reconcile if desired.

---
_Last updated: Feb 18, 2026_
