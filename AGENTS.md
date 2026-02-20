# AGENTS.md - Polyblocks Development Guide

Guidance for coding agents working in this codebase.

## Project Overview

Polyblocks is a no-code Polymarket strategy builder monorepo:
- **Runtime**: Node.js 22.x
- **Package Manager**: pnpm 9.15.0
- **Build**: Turbo
- **Languages**: TypeScript 5.7, React 19
- **Backend**: Fastify 5.x, MongoDB
- **Frontend**: React + Vite, Zustand, React Flow

## Directory Structure

```
polyblocks/
├── apps/api/           # Fastify backend
├── apps/web/           # React frontend
├── packages/types/     # Shared types, block registry
├── packages/engine-core/  # Strategy engine
├── packages/ui/        # Shared components
└── test/               # Root tests (node:test)
```

---

## Commands

### Root
```bash
pnpm dev          # Start all apps
pnpm build        # Build all
pnpm start        # Production API
pnpm test         # Root tests (node:test)
```

### API (`apps/api`)
```bash
pnpm dev          # Watch mode
pnpm build        # Compile TypeScript
pnpm test         # Run vitest
pnpm test -- marketplace           # Run tests matching "marketplace"
pnpm test -- --run marketplace.test.ts  # Run specific file
```

### Web (`apps/web`)
```bash
pnpm dev          # Vite dev server
pnpm build        # Type-check + build
pnpm test         # Run vitest
pnpm test -- ComponentName        # Run specific test
```

---

## Code Style

### TypeScript
- **Explicit types** for function parameters and return types
- Use `type` for unions/intersections, `interface` for object shapes
- Avoid `any` — use `unknown` when truly unknown
- Strict mode with `noUnusedLocals`, `noUnusedParameters`

### Naming
| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `marketplace.test.ts` |
| Functions | camelCase | `getUserId` |
| Types | PascalCase | `EditorState` |
| Constants | SCREAMING_SNAKE_CASE | `CLOB_HOST` |
| Components | PascalCase | `<EditorCanvas />` |

### Imports (ESM)
- Use `.js` extensions for relative imports
- Order: third-party → workspace → local (blank line between)

```typescript
import { create } from "zustand";
import type { FastifyInstance } from "fastify";

import { StrategyStatus } from "@polyblocks/types";

import { validateStrategy } from "./validator.js";
```

### Section Comments
```typescript
// ─── Helper Functions ────────────────────────────────────────
```

### Error Handling
```typescript
// Server errors
try {
  const result = await riskyOperation();
  return result;
} catch (err) {
  app.log.error(err, "Operation failed");
  return reply.code(500).send({ error: "Internal server error" });
}

// Non-critical (silent)
fetch(url).catch(() => { });

// Validation
if (!input) return reply.code(400).send({ error: "Missing field" });

// Auth
if (!user) return reply.code(401).send({ error: "Not authenticated" });
if (resource.userId !== user._id) return reply.code(403).send({ error: "Forbidden" });
```

---

## React Patterns

- **Zustand** for global state (`apps/web/src/stores/`)
- `create<StateInterface>` with explicit interface
- Use `useStore.getState()` outside React components

```typescript
interface EditorState {
  nodes: Node[];
  setNodes: (nodes: Node[]) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  nodes: [],
  setNodes: (nodes) => set({ nodes }),
}));
```

---

## Database (MongoDB)

Collection helpers in `apps/api/src/db.ts`:
```typescript
export function usersCol() { return getDb().collection<User>("users"); }
```

- Use parameterized queries (never string interpolation)
- Use `$set`, `$inc`, `$setOnInsert` for atomic updates

---

## Testing

### API (vitest)
```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri("polyblocks_test");
});

beforeEach(async () => {
  await usersCol().deleteMany({});
});

afterAll(async () => {
  await mongo.stop();
});
```

### Root (node:test)
```typescript
import { test } from "node:test";
import assert from "node:assert";

test("description", () => {
  assert.strictEqual(1 + 1, 2);
});
```

---

## Key Files

| Path | Purpose |
|------|---------|
| `apps/api/src/server.ts` | API entry |
| `apps/api/src/routes/*.ts` | API routes |
| `apps/api/src/engine/paperHandlers.ts` | Strategy block handlers |
| `apps/web/src/stores/editorStore.ts` | Canvas state |
| `packages/types/src/types.ts` | Core types |

---

## Time Handling

All times displayed in **ET (Eastern Time)** for consistency with Polymarket markets. Uses `America/New_York` IANA timezone for proper DST handling.

```typescript
const ET_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function getEtToday(): { month: number; day: number; year: number } {
  const parts = ET_DATE_FORMATTER.formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    year: parseInt(partMap.year, 10),
    month: parseInt(partMap.month, 10),
    day: parseInt(partMap.day, 10),
  };
}

function getEtNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
```

---

## Environment Variables

Required in `.env`:
- `MONGODB_URI` - MongoDB connection
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth
- `FRONTEND_URL` - Web app URL
- `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_KEY` - AI features
- `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` - Email

---

## Polymarket APIs

| API | Base URL | Auth | Purpose |
|-----|----------|------|---------|
| CLOB | `https://clob.polymarket.com` | L2 for trades | Orderbook, prices, orders |
| Gamma | `https://gamma-api.polymarket.com` | None | Events, markets, search |
| Data | `https://data-api.polymarket.com` | None | Trades, positions |
| WebSocket (Market) | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | None | Real-time orderbook |
| WebSocket (User) | `wss://ws-subscriptions-clob.polymarket.com/ws/user` | API creds | Trade/order updates |
| Bridge | `https://bridge.polymarket.com` | None | Deposits/withdrawals |

### Contract Addresses (Polygon)

| Contract | Address |
|----------|---------|
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| CTF | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| Neg Risk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |

### Polymarket Integration Reference

Detailed docs available in `packages/agent-skills/`:

| File | Content |
|------|---------|
| `SKILL.md` | Quick reference, client setup, core patterns |
| `authentication.md` | L1/L2 auth, builder headers, credentials |
| `order-patterns.md` | Order types (GTC/GTD/FOK/FAK), tick sizes, errors |
| `market-data.md` | Gamma API, Data API, orderbook, subgraph |
| `websocket.md` | Market/user/sports channels, subscriptions |
| `ctf-operations.md` | Split, merge, redeem, negative risk |
| `bridge.md` | Deposits, withdrawals, multi-chain |
| `gasless.md` | Relayer client, gasless transactions |

---

## Important Notes

- **Do NOT run lint after changes** - user verifies builds
- **No comments in code** unless explaining non-obvious logic
- **Restart dev server** after backend changes to see updates

---

## Playwright E2E Testing

Playwright is configured to test the web frontend locally via `pnpm test` or `npx playwright test`.

**Testing Guidelines:**
1. **Screenshots & Videos:** The project is configured with `screenshot: 'on'`, `video: 'on'`, and `trace: 'on'` in `playwright.config.ts`. If an issue occurs, you can view the exact UI state using the generated `.webm` video files or HTML traces in the `playwright-report/` directory.
2. **Authentication Flow (Sign Up):** When testing authenticating to check the actual product, **always generate a random email address** (e.g., `testuser_${Date.now()}@example.com`). This prevents "Email already exists" errors when the test suite runs repeatedly against the same local or remote database.
3. **Execution:** To check your work visually via E2E testing, you can write a short spec file under `e2e/`, run `npx playwright test`, and observe the output logs or review the captured media.
