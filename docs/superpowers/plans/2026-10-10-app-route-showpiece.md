# App Route Showpiece (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one shared lines-based payment route on the Prepare result, the Tracking page and the Correspondent Atlas, with the three screens on the landing tokens inside a scope.

**Architecture:** A presentational `LinesRoute` in `design-system/payment-route` takes ordered stops and a progress value and renders a stepper plus an SVG path. Each screen maps its own data to stops in a pure adapter. The landing tokens live in `design-system/landing-scope.css` under `.surface-landing`, applied only to the three screens, so the old `:root` tokens are untouched elsewhere.

**Tech Stack:** React 19, TypeScript, Vitest + jsdom, Playwright, plain CSS with custom properties.

**Spec:** [`2026-10-10-app-route-showpiece-design.md`](../specs/2026-10-10-app-route-showpiece-design.md). **Parent:** [`2026-10-01-relay-landing-and-visual-language-design.md`](../specs/2026-10-01-relay-landing-and-visual-language-design.md).

## Global Constraints

- Presentation only: `LinesRoute` fetches nothing and adds no network calls.
- The card `PaymentRoute` (`design-system/payment-route/PaymentRoute.tsx`) and its use in `features/explore/BankDetailRoute.tsx` stay unchanged.
- Motion is gated on `html.motion`. With motion off or JavaScript off, the final state shows.
- Any animated route has a pause control (WCAG 2.2.2).
- Node status is text plus icon plus colour. Text pairs in the scope pass WCAG 2.2 AA in light, dark and black.
- The landing tokens never apply on `:root`. Outside `.surface-landing` nothing changes.
- The `/app` eager shell stays within `frontend/src/design-system/bundleBudget.test.ts`.
- Phase 3 (migrating `tokens.css` for the rest of `/app`) is out of scope.

## Working environment

- Branch from `origin/main` in a worktree: `git worktree add -b feat/app-route-showpiece <path> origin/main`.
- `cd frontend && npm ci` once. Python is not needed for this plan.
- Run focused tests with `npx vitest run <path>`; run the full frontend suite with `npm test -- --run --no-file-parallelism` before the final commit.

## File map

| File | Responsibility | Task |
|---|---|---|
| `frontend/src/design-system/landing-scope.css` | Landing tokens under `.surface-landing` | 1 |
| `frontend/src/design-system/contrast.test.ts` | Scoped pairs added | 1 |
| `frontend/src/design-system/payment-route/LinesRoute.tsx`, `LinesRoute.css` | Presentational route | 2 |
| `frontend/src/design-system/payment-route/LinesRoute.test.tsx` | Route contract | 2 |
| `frontend/src/design-system/payment-route/routeStops.ts` | `RouteStop` type shared by adapters | 2 |
| `frontend/src/features/operate/prepare/prepareRoute.ts` (+ test) | Prepare result → stops | 3 |
| `frontend/src/features/operate/prepare/PreparePaymentPage.tsx` | Renders `LinesRoute` in the result | 3 |
| `frontend/src/features/operate/tracking/trackingRoute.ts` (+ test) | Timeline → stops | 4 |
| `frontend/src/features/operate/tracking/TrackingPage.tsx` | Route replaces `PaymentTimeline` as the main view | 4 |
| `frontend/src/features/explore/atlas/atlasRoute.ts` (+ test) | Hub and selected country → stops | 5 |
| `frontend/src/features/explore/AtlasPage.tsx` | Route over the map for the selection | 5 |
| `frontend/src/design-system/landing-scope.css` | Landing variants for shared components | 6 |
| `frontend/e2e/route-showpiece.spec.ts` | Three screens at 390px and 1440px | 7 |

---

### Task 1: Scoped landing tokens

**Files:**
- Create: `frontend/src/design-system/landing-scope.css`
- Modify: `frontend/src/design-system/contrast.test.ts` (add scoped pairs)
- Test: `frontend/src/design-system/contrast.test.ts`

**Interfaces:**
- Produces: the CSS class `.surface-landing`, which every later task applies to a screen root. It defines every token in `frontend/src/landing/client/styles/tokens.css` under that selector.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/design-system/contrast.test.ts`, at the end of the file:

```ts
describe("landing scope", () => {
  const scopeCss = readFileSync(resolve(__dirname, "landing-scope.css"), "utf8");

  it("defines the landing tokens only under .surface-landing, never on :root", () => {
    expect(scopeCss).not.toMatch(/^:root\s*\{/m);
    expect(scopeCss).toMatch(/\.surface-landing\s*\{/);
  });

  it("keeps the clashing names inside the scope", () => {
    for (const name of ["--font-mono", "--muted"]) {
      expect(scopeCss).toContain(`${name}:`);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/design-system/contrast.test.ts -t "landing scope"`
Expected: FAIL. `landing-scope.css` does not exist, so `readFileSync` throws.

- [ ] **Step 3: Create the scope file**

Create `frontend/src/design-system/landing-scope.css` by copying the three token blocks from `frontend/src/landing/client/styles/tokens.css`, with the selectors changed as shown:

```bash
cd frontend
python3 - <<'PY'
import re, pathlib
src = pathlib.Path("src/landing/client/styles/tokens.css").read_text()
src = src.replace(":root {", ".surface-landing {")
src = src.replace(':root:not([data-theme="light"])', ".surface-landing:not([data-theme=\"light\"])")
src = src.replace(':root[data-theme="dark"]', '.surface-landing[data-theme="dark"]')
src = src.replace(':root[data-theme="black"]', '.surface-landing[data-theme="black"]')
header = "/* Landing tokens, scoped to .surface-landing for the Phase 2 route screens. */\n"
pathlib.Path("src/design-system/landing-scope.css").write_text(header + src)
PY
grep -n "^:root" src/design-system/landing-scope.css || echo "no :root selectors"
```

Expected: `no :root selectors`.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd frontend && npx vitest run src/design-system/contrast.test.ts -t "landing scope"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/landing-scope.css frontend/src/design-system/contrast.test.ts
git commit -m "feat(app): scope the landing tokens to .surface-landing (phase 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `LinesRoute` component

**Files:**
- Create: `frontend/src/design-system/payment-route/routeStops.ts`
- Create: `frontend/src/design-system/payment-route/LinesRoute.tsx`
- Create: `frontend/src/design-system/payment-route/LinesRoute.css`
- Test: `frontend/src/design-system/payment-route/LinesRoute.test.tsx`

**Interfaces:**
- Produces:
  - `RouteStop` (from `routeStops.ts`): `{ role: "origin" | "correspondent" | "beneficiary"; name: string; detail?: string; status: RouteStopStatus }` where `RouteStopStatus = "passed" | "needs_attention" | "failed" | "unavailable" | "not_checked"`.
  - `LinesRoute` (from `LinesRoute.tsx`): props `{ stops: RouteStop[]; progress?: number; summary: string; paused?: boolean; onTogglePause?: () => void; ariaLabel: string }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/design-system/payment-route/LinesRoute.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinesRoute } from "./LinesRoute";
import type { RouteStop } from "./routeStops";

const stops: RouteStop[] = [
  { role: "origin", name: "Harborline Bank", detail: "Lagos", status: "passed" },
  { role: "correspondent", name: "Meridian Clearing", detail: "London", status: "needs_attention" },
  { role: "beneficiary", name: "Northstar Bank", detail: "UK", status: "not_checked" },
];

describe("LinesRoute", () => {
  it("renders the stops in order as the stepper", () => {
    render(<LinesRoute stops={stops} summary="GBP route" ariaLabel="Payment route" />);
    const steps = within(screen.getByRole("list", { name: "Payment route" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Harborline Bank"), expect.stringContaining("Northstar Bank")]),
    );
    expect(steps).toHaveLength(3);
  });

  it("states each status as text, not colour alone", () => {
    render(<LinesRoute stops={stops} summary="GBP route" ariaLabel="Payment route" />);
    expect(screen.getByText("passed")).toBeInTheDocument();
    expect(screen.getByText("needs attention")).toBeInTheDocument();
    expect(screen.getByText("not checked")).toBeInTheDocument();
  });

  it("exposes the summary for screen readers", () => {
    render(<LinesRoute stops={stops} summary="GBP route from Harborline Bank" ariaLabel="Payment route" />);
    expect(screen.getByText("GBP route from Harborline Bank", { selector: ".sr" })).toBeInTheDocument();
  });

  it("never shows a not-checked stop as passed", () => {
    render(<LinesRoute stops={stops} summary="s" ariaLabel="Payment route" />);
    const beneficiary = screen.getByText("Northstar Bank").closest("li")!;
    expect(beneficiary.textContent).not.toContain("passed");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/design-system/payment-route/LinesRoute.test.tsx`
Expected: FAIL with `Failed to resolve import "./LinesRoute"`.

- [ ] **Step 3: Write the stop type**

Create `frontend/src/design-system/payment-route/routeStops.ts`:

```ts
export type RouteStopRole = "origin" | "correspondent" | "beneficiary";

export type RouteStopStatus = "passed" | "needs_attention" | "failed" | "unavailable" | "not_checked";

export interface RouteStop {
  role: RouteStopRole;
  name: string;
  detail?: string;
  status: RouteStopStatus;
}

export const STATUS_LABEL: Record<RouteStopStatus, string> = {
  passed: "passed",
  needs_attention: "needs attention",
  failed: "failed",
  unavailable: "unavailable",
  not_checked: "not checked",
};

export const ROLE_LABEL: Record<RouteStopRole, string> = {
  origin: "Sender",
  correspondent: "Correspondent",
  beneficiary: "Beneficiary",
};
```

- [ ] **Step 4: Write the component**

Create `frontend/src/design-system/payment-route/LinesRoute.tsx`:

```tsx
import { ROLE_LABEL, STATUS_LABEL, type RouteStop } from "./routeStops";
import "./LinesRoute.css";

export interface LinesRouteProps {
  stops: RouteStop[];
  /** 0 to 1. Omitted means the whole route is drawn. */
  progress?: number;
  summary: string;
  paused?: boolean;
  onTogglePause?: () => void;
  ariaLabel: string;
}

const VIEW_WIDTH = 1080;
const VIEW_HEIGHT = 240;
const PATH_Y = 120;

function stopX(index: number, count: number): number {
  if (count <= 1) return VIEW_WIDTH / 2;
  return 100 + (index * (VIEW_WIDTH - 200)) / (count - 1);
}

export function LinesRoute({ stops, progress, summary, paused = false, onTogglePause, ariaLabel }: LinesRouteProps) {
  const count = stops.length;
  const drawn = progress === undefined ? 1 : Math.min(1, Math.max(0, progress));
  const pathD = stops.map((_, index) => `${index === 0 ? "M" : "L"} ${stopX(index, count)} ${PATH_Y}`).join(" ");

  return (
    <figure className="lines-route" aria-label={ariaLabel}>
      <svg
        className="lines-route__svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="lines-route__track" d={pathD} />
        <path
          className="lines-route__drawn"
          d={pathD}
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - drawn}
        />
        {stops.map((stop, index) => (
          <rect
            key={`${stop.role}-${index}`}
            className={`lines-route__node lines-route__node--${stop.status}`}
            x={stopX(index, count) - 7}
            y={PATH_Y - 7}
            width={14}
            height={14}
          />
        ))}
      </svg>

      <ol className="lines-route__steps" aria-label={ariaLabel} role="list">
        {stops.map((stop, index) => (
          <li key={`${stop.role}-${index}`} className={`lines-route__step lines-route__step--${stop.status}`}>
            <span className="lines-route__role">
              [ {String(index + 1).padStart(2, "0")} ] {ROLE_LABEL[stop.role]}
            </span>
            <b className="lines-route__name">{stop.name}</b>
            {stop.detail && <span className="lines-route__detail">{stop.detail}</span>}
            <span className="lines-route__status">{STATUS_LABEL[stop.status]}</span>
          </li>
        ))}
      </ol>

      <figcaption className="sr">{summary}</figcaption>

      {onTogglePause && (
        <button type="button" className="lines-route__pause" aria-pressed={paused} onClick={onTogglePause}>
          {paused ? "Play route" : "Pause route"}
        </button>
      )}
    </figure>
  );
}
```

- [ ] **Step 5: Write the CSS**

Create `frontend/src/design-system/payment-route/LinesRoute.css`:

```css
/* Colours come from the scoped landing tokens; this file holds no hex. */
.lines-route { margin: 0; position: relative; }
.lines-route__svg { display: block; width: 100%; height: 240px; }
.lines-route__track { fill: none; stroke: var(--line2); stroke-width: 2; }
.lines-route__drawn { fill: none; stroke: var(--acc); stroke-width: 2.5; }
.lines-route__node { fill: var(--surface); stroke: var(--acc); stroke-width: 2; }
.lines-route__node--failed { stroke: var(--bad); }
.lines-route__node--needs_attention { stroke: var(--warn); }
.lines-route__steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
.lines-route__step { border-top: 1px solid var(--line); padding-top: 12px; display: grid; gap: 4px; min-width: 0; }
.lines-route__role { font: 400 12px/16px var(--font-mono); color: var(--muted); letter-spacing: 0.06em; text-transform: uppercase; }
.lines-route__name { font: 500 16px/22px var(--font-sans); color: var(--ink); }
.lines-route__detail { font: 400 14px/20px var(--font-sans); color: var(--ink2); }
.lines-route__status { font: 500 12px/16px var(--font-mono); color: var(--ink2); }
.lines-route__step--failed .lines-route__status { color: var(--bad); }
.lines-route__step--needs_attention .lines-route__status { color: var(--warn); }
.lines-route__pause { margin-top: 12px; min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line2); background: var(--ghost); color: var(--ink); font: 500 14px/1 var(--font-sans); }
@media (max-width: 767px) {
  .lines-route__svg { display: none; }
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run src/design-system/payment-route/LinesRoute.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/design-system/payment-route/routeStops.ts frontend/src/design-system/payment-route/LinesRoute.tsx frontend/src/design-system/payment-route/LinesRoute.css frontend/src/design-system/payment-route/LinesRoute.test.tsx
git commit -m "feat(app): add the presentational LinesRoute component (phase 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Prepare route

**Files:**
- Create: `frontend/src/features/operate/prepare/prepareRoute.ts`
- Test: `frontend/src/features/operate/prepare/prepareRoute.test.ts`
- Modify: `frontend/src/features/operate/prepare/PreparePaymentPage.tsx` (insert before the `prepare-payment__route` block, currently at line 769 of `origin/main`)

**Interfaces:**
- Consumes: `PreparePaymentResponse["routing"]` (`suggested_intermediaries`, `routing_basis`, `inferred_currency`) from `api/schemas.ts`; `RouteStop` from Task 2.
- Produces: `prepareRouteStops(routing, names: { originator: string; beneficiary: string }): RouteStop[]`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/operate/prepare/prepareRoute.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prepareRouteStops } from "./prepareRoute";

const routing = {
  suggested_intermediaries: [
    { bic: "CITIUS33XXX", bank: "Citibank N.A.", corridor: "USD->GB", confidence: "high", basis: "published-ssi" },
  ],
  routing_basis: "published-ssi",
  inferred_currency: "USD",
} as never;

describe("prepareRouteStops", () => {
  it("builds sender, correspondent and beneficiary stops", () => {
    const stops = prepareRouteStops(routing, { originator: "Harborline Bank", beneficiary: "Northstar Bank" });
    expect(stops.map((stop) => stop.role)).toEqual(["origin", "correspondent", "beneficiary"]);
    expect(stops[1]).toMatchObject({ name: "Citibank N.A.", detail: "CITIUS33XXX" });
  });

  it("marks a heuristic correspondent as needing attention", () => {
    const heuristic = { ...routing, routing_basis: "corridor-heuristic", suggested_intermediaries: [{ ...routing.suggested_intermediaries[0], basis: "corridor-heuristic" }] };
    const stops = prepareRouteStops(heuristic as never, { originator: "A", beneficiary: "B" });
    expect(stops[1].status).toBe("needs_attention");
  });

  it("returns no stops when there are no candidates", () => {
    expect(prepareRouteStops({ ...routing, suggested_intermediaries: [] } as never, { originator: "A", beneficiary: "B" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/features/operate/prepare/prepareRoute.test.ts`
Expected: FAIL with `Failed to resolve import "./prepareRoute"`.

- [ ] **Step 3: Write the adapter**

Create `frontend/src/features/operate/prepare/prepareRoute.ts`:

```ts
import type { RouteStop } from "../../../design-system/payment-route/routeStops";
import type { PreparePaymentResponse } from "../../../api/schemas";

type Routing = PreparePaymentResponse["routing"];

/**
 * Maps the Prepare result's routing evidence to route stops. Heuristic
 * candidates are marked as needing attention: the backend ranks them, it does
 * not confirm the hops.
 */
export function prepareRouteStops(
  routing: Routing,
  names: { originator: string; beneficiary: string },
): RouteStop[] {
  const correspondent = routing.suggested_intermediaries[0];
  if (!correspondent) return [];
  const status = correspondent.basis === "published-ssi" ? "passed" : "needs_attention";
  return [
    { role: "origin", name: names.originator, status: "not_checked" },
    { role: "correspondent", name: correspondent.bank, detail: correspondent.bic, status },
    { role: "beneficiary", name: names.beneficiary, status: "not_checked" },
  ];
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd frontend && npx vitest run src/features/operate/prepare/prepareRoute.test.ts`
Expected: PASS (3 tests). If `correspondent.bank` is typed optional, the test fails on the type; fall back to `correspondent.bic` for the name and re-run.

- [ ] **Step 5: Render it in the result**

In `frontend/src/features/operate/prepare/PreparePaymentPage.tsx`, add the imports near the existing `CorrespondentOptions` import (line 20):

```tsx
import { LinesRoute } from "../../../design-system/payment-route/LinesRoute";
import { prepareRouteStops } from "./prepareRoute";
```

Then insert this block immediately before the `{/* Routing summary: preserve whether ... */}` comment (line 769 on `origin/main`):

```tsx
{result.routing.suggested_intermediaries.length > 0 && (
  <div className="surface-landing prepare-payment__lines-route">
    <LinesRoute
      stops={prepareRouteStops(result.routing, {
        originator: formValues.originatorName ?? "Sender",
        beneficiary: formValues.beneficiaryName ?? "Beneficiary",
      })}
      summary={`Route from ${formValues.originatorName ?? "sender"} through ${result.routing.suggested_intermediaries[0].bank} to ${formValues.beneficiaryName ?? "beneficiary"}.`}
      ariaLabel="Payment route"
    />
  </div>
)}
```

Confirm the form field names: `formValues.originatorName` and `formValues.beneficiaryName` must match the names used in `prepareSchema.ts`. Run `grep -n "Name" frontend/src/features/operate/prepare/prepareSchema.ts` and replace the two names if they differ.

- [ ] **Step 6: Run the Prepare tests**

Run: `cd frontend && npx vitest run src/features/operate/prepare`
Expected: PASS. The existing `PreparePaymentPage.test.tsx` must still pass; if it queries a heading or list by the wrong name now that the route list exists, scope the query to the `prepare-payment__route` region.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/operate/prepare/prepareRoute.ts frontend/src/features/operate/prepare/prepareRoute.test.ts frontend/src/features/operate/prepare/PreparePaymentPage.tsx
git commit -m "feat(prepare): show the lines route in the result after checks (phase 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tracking route

**Files:**
- Create: `frontend/src/features/operate/tracking/trackingRoute.ts`
- Test: `frontend/src/features/operate/tracking/trackingRoute.test.ts`
- Modify: `frontend/src/features/operate/tracking/TrackingPage.tsx` (replace the `<PaymentTimeline payment={data} />` at line 186 on `origin/main`)

**Interfaces:**
- Consumes: `TrackPaymentResponse` (`timeline: TrackTimelineEntry[]`, `is_terminal`) from `api/schemas.ts`; `RouteStop` from Task 2.
- Produces: `trackingRouteStops(payment: TrackPaymentResponse): RouteStop[]`. The payload carries no total hop count, so the route draws the revealed hops in full and passes no `progress`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/operate/tracking/trackingRoute.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { trackingRouteStops } from "./trackingRoute";

const payment = {
  is_terminal: false,
  timeline: [
    { status: "INITIATED", bank_bic: "AAAAGB2LXXX", bank_name: "Harborline Bank", hop: 0, timestamp: "t0" },
    { status: "FORWARDED", bank_bic: "CITIUS33XXX", bank_name: "Citibank N.A.", hop: 1, timestamp: "t1" },
    { status: "CREDITED", bank_bic: "BBBBGB2LXXX", bank_name: "Northstar Bank", hop: 2, timestamp: "t2" },
  ],
} as never;

describe("trackingRouteStops", () => {
  it("maps each revealed hop to a stop with its bank", () => {
    const stops = trackingRouteStops(payment);
    expect(stops.map((stop) => stop.name)).toEqual(["Harborline Bank", "Citibank N.A.", "Northstar Bank"]);
    expect(stops.map((stop) => stop.role)).toEqual(["origin", "correspondent", "beneficiary"]);
  });

  it("marks a rejected or returned hop as failed", () => {
    const rejected = { ...payment, timeline: [{ ...payment.timeline[0], status: "REJECTED" }] } as never;
    expect(trackingRouteStops(rejected)[0].status).toBe("failed");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/features/operate/tracking/trackingRoute.test.ts`
Expected: FAIL with `Failed to resolve import "./trackingRoute"`.

- [ ] **Step 3: Write the adapter**

Create `frontend/src/features/operate/tracking/trackingRoute.ts`:

```ts
import type { RouteStop } from "../../../design-system/payment-route/routeStops";
import type { TrackPaymentResponse } from "../../../api/schemas";

/**
 * Maps the revealed timeline to route stops. The backend reveals hops in order,
 * so the first revealed hop is the origin and the last is the beneficiary. Only
 * revealed hops are drawn: the payload has no total hop count.
 */
export function trackingRouteStops(payment: TrackPaymentResponse): RouteStop[] {
  const hops = payment.timeline;
  return hops.map((hop, index) => {
    const role = index === 0 ? "origin" : index === hops.length - 1 ? "beneficiary" : "correspondent";
    const failed = hop.status === "REJECTED" || hop.status === "RETURNED";
    return {
      role,
      name: hop.bank_name ?? hop.bank_bic,
      detail: hop.bank_bic,
      status: failed ? "failed" : "passed",
    };
  });
}
```

Note: the adapter returns every hop in the timeline. The backend only includes revealed events in `timeline`, so unrevealed hops are not drawn. The test's `not_checked` expectation is therefore wrong for this adapter; change the third test to expect `"passed"` for a revealed hop and remove the `not_checked` assertion:

```ts
it("treats a revealed credited hop as passed", () => {
  const { stops } = trackingRouteStops(payment);
  expect(stops[2].status).toBe("passed");
});
```

Re-run Step 2 after that edit; expected FAIL on the old `not_checked` assertion, then PASS after the adapter is in place.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd frontend && npx vitest run src/features/operate/tracking/trackingRoute.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Replace the timeline view**

In `frontend/src/features/operate/tracking/TrackingPage.tsx`, add imports next to the existing `PaymentTimeline` import:

```tsx
import { LinesRoute } from "../../../design-system/payment-route/LinesRoute";
import { trackingRouteStops } from "./trackingRoute";
```

Replace the line `<PaymentTimeline payment={data} />` with:

```tsx
<div className="surface-landing tracking-page__route">
  <LinesRoute
    stops={trackingRouteStops(data)}
    summary={`Payment ${data.uetr ?? ""} has revealed ${data.timeline.length} hops.`}
    ariaLabel="Payment route"
  />
</div>
```

Keep `PaymentTimeline` in the file for the event list: render it below the route with `<PaymentTimeline payment={data} />` in a `<details>` element, so the event text is still available for the stepper and screen readers, as the spec requires. Confirm `data.uetr` exists on `TrackPaymentResponse` with `grep -n "uetr" frontend/src/api/schemas.ts`; if it is named differently, use that field.

- [ ] **Step 6: Run the Tracking tests**

Run: `cd frontend && npx vitest run src/features/operate/tracking`
Expected: PASS. If `TrackingPage.test.tsx` asserts the timeline is the only route-like view, update it to expect the route figure with `aria-label="Payment route"`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/operate/tracking/trackingRoute.ts frontend/src/features/operate/tracking/trackingRoute.test.ts frontend/src/features/operate/tracking/TrackingPage.tsx
git commit -m "feat(tracking): show the lines route in place of the event timeline (phase 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Atlas route (hub country to selected country)

**Files:**
- Create: `frontend/src/features/explore/atlas/atlasRoute.ts`
- Test: `frontend/src/features/explore/atlas/atlasRoute.test.ts`
- Modify: `frontend/src/features/explore/AtlasPage.tsx` (render the route beside `AtlasMap`, around line 216)

**Interfaces:**
- Consumes: `AtlasCountry` with `correspondents: AtlasCountryCorrespondent[]` (`bic`, `name`, `iso2`, `beneficiary_banks`) from `atlasSchemas.ts`; the hub country code, which Step 1 identifies.
- Produces: `atlasRouteStops(hubIso2: string, selected: AtlasCountry): RouteStop[]`.

- [ ] **Step 1: Identify the hub country field**

Run: `grep -n "hub" frontend/src/features/explore/atlas/atlasSchemas.ts | head -20`

Record the field that holds the hub country's ISO2 code on `AtlasHub` or `AtlasNetwork`, and use that name everywhere `hubIso2` appears below. Do not guess the name.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/features/explore/atlas/atlasRoute.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { atlasRouteStops } from "./atlasRoute";

const selected = {
  iso2: "KE",
  correspondents: [
    { bic: "CITIUS33XXX", name: "Citibank N.A.", iso2: "US", beneficiary_banks: 9, currencies: ["USD"], disclosures: [] },
    { bic: "SCBLUS33XXX", name: "Standard Chartered NY", iso2: "US", beneficiary_banks: 3, currencies: ["USD"], disclosures: [] },
  ],
} as never;

describe("atlasRouteStops", () => {
  it("draws hub, the top correspondent, then the selected country", () => {
    const stops = atlasRouteStops("GB", selected);
    expect(stops.map((stop) => stop.role)).toEqual(["origin", "correspondent", "beneficiary"]);
    expect(stops[1]).toMatchObject({ name: "Citibank N.A.", detail: "CITIUS33XXX" });
  });

  it("returns no route when the selected country has no correspondent", () => {
    expect(atlasRouteStops("GB", { iso2: "KE", correspondents: [] } as never)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/features/explore/atlas/atlasRoute.test.ts`
Expected: FAIL with `Failed to resolve import "./atlasRoute"`.

- [ ] **Step 4: Write the adapter**

Create `frontend/src/features/explore/atlas/atlasRoute.ts`:

```ts
import type { RouteStop } from "../../../design-system/payment-route/routeStops";
import type { AtlasCountry } from "./atlasSchemas";

/**
 * Hub country to the selected country, through the selected country's
 * correspondent with the most beneficiary banks. Returns no stops when the
 * data has no correspondent, so nothing is invented.
 */
export function atlasRouteStops(hubIso2: string, selected: AtlasCountry): RouteStop[] {
  const top = [...selected.correspondents].sort((a, b) => b.beneficiary_banks - a.beneficiary_banks)[0];
  if (!top) return [];
  return [
    { role: "origin", name: hubIso2, status: "not_checked" },
    { role: "correspondent", name: top.name, detail: top.bic, status: "passed" },
    { role: "beneficiary", name: selected.iso2, status: "not_checked" },
  ];
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `cd frontend && npx vitest run src/features/explore/atlas/atlasRoute.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Draw it beside the map**

In `frontend/src/features/explore/AtlasPage.tsx`, when a country is selected (`selected` is set, line 31-35), render beside the `AtlasMap` at line 216:

```tsx
{selected && selectedCountry && selectedCountry.correspondents.length > 0 && (
  <div className="surface-landing atlas-page__route">
    <LinesRoute
      stops={atlasRouteStops(HUB_ISO2, selectedCountry)}
      summary={`Route from ${HUB_ISO2} through ${[...selectedCountry.correspondents].sort((a, b) => b.beneficiary_banks - a.beneficiary_banks)[0].name} to ${selectedCountry.iso2}.`}
      ariaLabel="Route to the selected country"
    />
  </div>
)}
```

Define `HUB_ISO2` from the field identified in Step 1 and `selectedCountry` from the existing lookup that feeds `AtlasPanel`, near line 77 (`panelIso2`). Import `LinesRoute` and `atlasRouteStops` at the top of the file.

Per the decision, the route appears only for a country that has correspondents in the data. A country with none shows no route (as the test asserts).

- [ ] **Step 7: Run the Atlas tests**

Run: `cd frontend && npx vitest run src/features/explore`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/explore/atlas/atlasRoute.ts frontend/src/features/explore/atlas/atlasRoute.test.ts frontend/src/features/explore/AtlasPage.tsx
git commit -m "feat(atlas): draw the route from the hub to the selected country (phase 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Landing variants of the shared components, inside the scope

**Files:**
- Modify: `frontend/src/design-system/landing-scope.css` (append the scoped component overrides)
- Test: `frontend/src/design-system/contrast.test.ts` (extend the scoped pairs)

**Interfaces:**
- Consumes: the class names `Button` and `StatusChip` render (Step 1).
- Produces: scoped overrides that apply only under `.surface-landing`.

- [ ] **Step 1: Read the rendered class names**

Run: `grep -n "className" frontend/src/design-system/Button.tsx frontend/src/design-system/StatusChip.tsx | head -20`

Use the exact class names this prints in the selectors below. Do not invent class names.

- [ ] **Step 2: Write the failing contrast test**

Add to the `landing scope` block in `frontend/src/design-system/contrast.test.ts`:

```ts
it("gives the scoped button a landing primary fill", () => {
  expect(scopeCss).toMatch(/\.surface-landing\s+\.relay-btn--primary\b/);
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/design-system/contrast.test.ts -t "landing scope"`
Expected: FAIL. The override selector is not in the file yet.

- [ ] **Step 4: Append the overrides**

Append to `frontend/src/design-system/landing-scope.css`, after the token blocks:

```css
/* Landing variants of shared components, inside .surface-landing only. */
.surface-landing .relay-btn--primary {
  background: var(--accFill);
  color: var(--onAcc);
  box-shadow: var(--priShade);
  border-radius: 10px;
}
.surface-landing .relay-btn--primary:hover {
  background: var(--accFillHover);
}
.surface-landing .relay-btn--secondary {
  background: var(--ghost);
  color: var(--ink);
  border: 1px solid var(--line2);
  border-radius: 10px;
}
.surface-landing h1,
.surface-landing h2,
.surface-landing h3 {
  font-family: var(--font-sans);
  font-weight: 500;
  color: var(--ink);
}
```

Replace `.relay-btn--primary` and `.relay-btn--secondary` with the class names found in Step 1 if they differ. Extend the rule set to the screen headers, cards and tables those three screens use, one selector per shared component, after reading their classes in Step 1.

- [ ] **Step 5: Run the test and watch it pass**

Run: `cd frontend && npx vitest run src/design-system/contrast.test.ts -t "landing scope"`
Expected: PASS.

- [ ] **Step 6: Add the surface class to the three screen roots**

Add `surface-landing` to the root element of each screen: the `Prepare` page root (`PreparePaymentPage.tsx`), the `TrackingPage` root (`TrackingPage.tsx`) and the `AtlasPage` root (`AtlasPage.tsx`). Confirm each root's class name with `grep -n "className=\"prepare-payment\"\|className=\"tracking-page\"\|className=\"atlas-page\"" <file>`.

- [ ] **Step 7: Run the three screens' tests**

Run: `cd frontend && npx vitest run src/features/operate src/features/explore`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/design-system/landing-scope.css frontend/src/design-system/contrast.test.ts frontend/src/features/operate/prepare/PreparePaymentPage.tsx frontend/src/features/operate/tracking/TrackingPage.tsx frontend/src/features/explore/AtlasPage.tsx
git commit -m "feat(app): landing variants of shared components inside the route screens (phase 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end checks at 390px and 1440px

**Files:**
- Create: `frontend/e2e/route-showpiece.spec.ts`

**Interfaces:**
- Consumes: the `Payment route` figure from Tasks 3–5, the `surface-landing` class from Task 6.

- [ ] **Step 1: Write the spec**

Create `frontend/e2e/route-showpiece.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const SCREENS: Array<{ name: string; path: string }> = [
  { name: "prepare", path: "/app/operate/prepare" },
  { name: "tracking", path: "/app/operate/tracking" },
  { name: "atlas", path: "/app/explore/atlas?selected=KE" },
];

for (const screen of SCREENS) {
  test(`${screen.name} has no horizontal overflow and a scoped route`, async ({ page }) => {
    await page.goto(screen.path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const root = page.locator(".surface-landing").first();
    await expect(root).toHaveCount(1);
  });
}

test("the route's summary is announced even when motion is off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/operate/tracking");
  const summary = page.locator("figure.lines-route figcaption.sr");
  if (await summary.count()) {
    await expect(summary.first()).toHaveText(/revealed/);
  }
});
```

- [ ] **Step 2: Run it and watch it pass**

Run: `cd frontend && E2E_SKIP_BUILD=1 npx playwright test e2e/route-showpiece.spec.ts --project=mobile --project=desktop`
Expected: PASS. The `mobile` project is 390px and `desktop` is wider; both must show no overflow. If a screen needs a seeded payment to render its route, the Tracking check passes only when its UETR exists; seed it with the existing fixture the other `e2e/` specs use.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/route-showpiece.spec.ts
git commit -m "test(app): e2e checks for the route on prepare, tracking and atlas (phase 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:** Component (Task 2), token scope (Task 1 and 6), Prepare (3), Tracking (4), Atlas (5), accessibility (Task 2 stepper, summary, status text), motion and pause (Task 2 `paused` and `onTogglePause`; Tracking draws the revealed hops without a progress value), errors and empty states (adapters return `[]` or `needs_attention`), testing (Tasks 1–7). The card `PaymentRoute` is untouched, as the constraints require.

**Known gaps to resolve during execution:**
- Task 4: the spec asks for the route to replace the timeline; the plan keeps `PaymentTimeline` inside a `<details>` so the event text stays available. Confirm this with the user if the replacement should be stricter.
- Task 6: the class names for `Button` and `StatusChip` come from Step 1 and are not known yet.
- Task 5: the hub field name comes from Step 1.

**Type consistency:** `RouteStop`, `RouteStopStatus` and `RouteStopRole` are defined once in `routeStops.ts` (Task 2) and used by the three adapters and `LinesRoute`. `LinesRouteProps` matches its use in Tasks 3–5.
