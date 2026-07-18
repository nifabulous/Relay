# Relay Frontend

Relay is the React frontend for the educational payment simulation. It replaces the legacy Corridor Labs `/learn` and `/ui` vanilla JS pages with a unified, responsive application.

## Architecture

```
frontend/src/
  app-shell/          routes, layouts, navigation, error boundary
  design-system/      tokens, primitives (Button, StatusChip, AsyncRegion),
                      payment route visualization
  api/                typed transport, Zod schemas, query keys
  lib/persistence/    versioned local storage + legacy migration
  features/
    overview/         adaptive home page
    explore/          command search, bank directory, glossary
    operate/
      prepare/        payment preparation workspace
      tools/          fee calculator, screening, value date, STP checker
      tracking/       UETR lookup + timeline
    learn/            curriculum, modules, progress
  test/               MSW handlers, render helper, setup
```

## Tech Stack

- React 19 + TypeScript 7 (strict mode, `verbatimModuleSyntax`)
- Vite 8 (builds to `../app/static/relay/`)
- React Router 7 (basename `/app`)
- TanStack Query 5 (server state)
- React Hook Form 7 + Zod 4 (form validation)
- Vitest 4 + React Testing Library + MSW 2 (unit/integration tests)
- Playwright (E2E tests)

## Development

### Two-terminal development

```bash
# Terminal 1 — backend
.venv/bin/uvicorn app.main:app --reload

# Terminal 2 — frontend (hot reload, proxies /api to backend)
cd frontend && npm run dev
```

Vite serves Relay at `http://127.0.0.1:5173/app/` with API requests proxied to port 8000.

### Production build

```bash
cd frontend && npm run build
```

Outputs to `app/static/relay/`. Served by FastAPI at `http://127.0.0.1:8000/app`.

## Testing

```bash
cd frontend

# Unit/integration tests
npm test

# E2E tests (requires running FastAPI)
npm run test:e2e

# Bundle budget check (≤200KB gzip eager shell)
npm run build && npm run check:bundle
```

## Design System

The canonical design contract is [`../DESIGN.md`](../DESIGN.md). All components consume tokens from `design-system/tokens.css`. Feature-local substitutes for shared tokens or components are prohibited.

Key principles:
- Blue (#3157D5) reserved for actions, selection, progress
- Thin structural borders, no decorative shadows
- No colored card edges, no emoji as icons
- Status expressed with text + icon + color (never color alone)
- All text meets WCAG 2.2 AA contrast (≥4.5:1)

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/app` | OverviewPage | Adaptive home with one dominant action |
| `/app/learn` | LearnIndexPage | Curriculum list with prerequisite gating |
| `/app/learn/:moduleId` | LearnModulePage | Individual module content |
| `/app/explore` | ExplorePage | Command search + categories |
| `/app/explore/banks` | BankDirectoryPage | BIC lookup |
| `/app/explore/glossary` | GlossaryPage | Filterable payment terms |
| `/app/operate` | PreparePaymentPage | Guided payment preparation |
| `/app/operate/fees` | FeePage | Fee calculator |
| `/app/operate/screening` | ScreeningPage | Sanctions screening |
| `/app/operate/value-date` | ValueDatePage | Settlement date calculator |
| `/app/operate/stp` | StpPage | MT103 STP checker |
| `/app/operate/tracking` | TrackingPage | UETR lookup + timeline |

Legacy `/learn` and `/ui` remain available until full parity is reached.
