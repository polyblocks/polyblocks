# PROJECT_OVERVIEW.md

## Polyblocks: Codebase & Context Overview (as of Feb 2026)

### Project Purpose
Polyblocks is a modular, block-based trading automation platform for prediction markets (e.g., Polymarket). It enables users to visually build, backtest, and deploy trading strategies, with support for copy trading, pro features, and a modern UI/UX.

### Architecture
- **Monorepo**: Managed with pnpm workspaces, TurboRepo, and TypeScript.
- **Apps**:
  - `apps/api`: Node.js/TypeScript backend (Express), handles strategy execution, user auth, market data, and scheduling. Connects to MongoDB.
  - `apps/web`: React + Vite frontend. Modern, responsive, with block-based editor, dashboards, and pro features.
- **Packages**:
  - `engine-core`: Core graph/evaluator logic for block execution.
  - `types`: Shared types, templates, and registry for blocks/strategies.
  - `ui`: Shared UI components and styles.

### Key Features
- Block-based strategy editor (React Flow)
- Copy trading dashboard
- Pro/Beta feature gating
- Backtesting and analytics
- Modern landing/pricing pages
- No notification/email/Telegram integration (removed for simplicity)

### Recent Context
- All notification features/settings were removed (Feb 2026)
- Major UI/UX and feature upgrades completed
- App runs locally: API (tsx watch), frontend (pnpm dev)

### How to Continue
- See `NEW_IDEA.md` for next feature idea
- All code is TypeScript, React, Node.js
- Use pnpm for dependency management
- See `README.md` for setup

### For Next AI Agent
- Review this file and `README.md` for context
- Check `IMPROVEMENTS.md` for open ideas
- Use modern, modular, and type-safe patterns
- Prioritize reliability and user experience

---
_Last updated: Feb 16, 2026_