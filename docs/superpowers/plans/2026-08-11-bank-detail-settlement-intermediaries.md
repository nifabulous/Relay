# Bank Detail: Settlement & Intermediaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deep-linkable bank detail route at `/app/explore/banks/:bic` that shows published settlement instructions grouped by currency, falling back to the heuristic correspondent chain when no SSI exists.

**Architecture:** One new lazy-loaded route component reading three existing endpoints (`/api/lookup`, `/api/ssi`, `/api/route`). SSI and route queries fire in parallel rather than as a waterfall, because 87% of banks have no SSI and would otherwise pay two sequential round trips. Pure grouping logic lives in its own module so it can be tested without rendering.

**Tech Stack:** React 19, TypeScript 7 (strict), React Router 7, TanStack Query 5, Zod 4, Vitest + React Testing Library + MSW 2, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-10-bank-detail-settlement-intermediaries-design.md`

## Global Constraints

Every task's requirements implicitly include these.

- **No backend changes.** No edits to `app/`, to any Pydantic schema, or to seed data. This is a frontend-only feature.
- **No API-client changes.** `LookupResponseSchema`, `SSIResponseSchema`, `RouteResponseSchema` and `apiKeys` already cover every field needed.
- **Governing invariant:** never present data with more authority or more precision than it has, and add no data of its own.
- **The SSI disclaimer renders** wherever settlement data renders. CLAUDE.md requires the simulation disclaimer on every payment-shaped response.
- **`ACCT-` account numbers display as-is.** Never reformat, mask, or synthesise them.
- **Published and heuristic data stay visually and semantically distinct.** Headings are exactly `Published settlement instructions` and `Heuristic correspondent route`.
- **Group by `SSIRecord.currency`, never `SSIResponse.currency`** — the latter is the literal sentinel `"ALL"` when the request omits a currency.
- **Confidence renders as plain text, never a `StatusChip`.** `StatusChipStatus` has no `high`/`medium`/`low` member.
- **`Link to` paths must NOT include `/app`.** The router sets `basename="/app"` (`App.tsx:37`), so `to="/explore/banks"` renders `href="/app/explore/banks"`. Writing `to="/app/explore/banks"` renders `/app/app/explore/banks`, which resolves to no route and paints an empty page. Three existing links have this bug — verified live — and Task 6 removes two of them as a side effect of replacing that block. Copy the surrounding style at your peril: `ExplorePage.tsx` currently demonstrates the wrong convention.
- **Run tests with** `cd frontend && npm test -- --no-file-parallelism` (the default parallel run is load-sensitive).
- **Eager shell bundle stays under 204,800 bytes gzip.** Verify with `npm run check:bundle`.
- Existing suite baseline: 808 frontend unit tests, 612 backend tests, e2e 288 passed / 13 skipped.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `frontend/src/design-system/payment-route/routeNodes.ts` | **Moved** from `features/learn/labs/`. Builds `PaymentRouteNode[]` from intermediaries. |
| `frontend/src/design-system/payment-route/routeNodes.test.ts` | **New.** Tests for the above; it has none today. |
| `frontend/src/features/explore/ssiGrouping.ts` | **New.** Pure grouping of `SSIRecord[]` by currency. No React. |
| `frontend/src/features/explore/ssiGrouping.test.ts` | **New.** Tests for grouping and ordering. |
| `frontend/src/features/explore/BankDetailRoute.tsx` | **New.** The route: identity, disclosure, SSI panel, heuristic fallback. |
| `frontend/src/features/explore/BankDetailRoute.test.tsx` | **New.** Component tests via MSW. |
| `frontend/src/features/explore/ExplorePage.tsx` | **Modify.** Remove local `BankDetailCard`; link search result to the new route. |
| `frontend/src/features/explore/ExplorePage.css` | **Modify.** Styles for the new panels. |
| `frontend/src/app-shell/App.tsx` | **Modify.** Register the lazy route. |
| `frontend/e2e/explore.spec.ts` | **Modify.** Deep-link + axe coverage. |

---

### Task 1: Move `routeNodes` into the design system and test it

`routeNodes.ts` documents itself as "Shared between Lab 4 (route demo) and the Capstone (route step)". That is stale — nothing imports it, and `PaymentRoute` is referenced only by its own test. Confirm before moving.

**Files:**
- Create: `frontend/src/design-system/payment-route/routeNodes.ts`
- Create: `frontend/src/design-system/payment-route/routeNodes.test.ts`
- Delete: `frontend/src/features/learn/labs/routeNodes.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildRouteNodes(intermediaries: Array<{ bic: string; bank?: string }>, beneficiaryBic: string): PaymentRouteNode[]` from `../../design-system/payment-route/routeNodes`.

- [ ] **Step 1: Confirm there are no importers before moving**

Run:
```bash
cd frontend && grep -rn "buildRouteNodes\|from \"./routeNodes\"\|routeNodes\"" src | grep -v node_modules
```
Expected: only the definition in `src/features/learn/labs/routeNodes.ts`. If any other file appears, STOP and update this plan — the move needs those importers repointed.

- [ ] **Step 2: Move the file unchanged**

```bash
cd frontend && git mv src/features/learn/labs/routeNodes.ts src/design-system/payment-route/routeNodes.ts
```

- [ ] **Step 3: Fix the now-wrong relative import and the stale docstring**

In `src/design-system/payment-route/routeNodes.ts`, replace the first 11 lines with:

```ts
import type { PaymentRouteNode, CheckStatus } from "../types";

interface IntermediaryLike {
  bic: string;
  bank?: string;
}

/**
 * Build PaymentRouteNode[] from a list of intermediaries.
 *
 * Lives beside PaymentRoute because it exists to feed it. Its `IntermediaryLike`
 * shape matches the API's SuggestedIntermediary, so a /api/route response can be
 * rendered without an adapter.
 */
```

Leave the function body untouched.

- [ ] **Step 4: Write the failing test**

Create `frontend/src/design-system/payment-route/routeNodes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRouteNodes } from "./routeNodes";

describe("buildRouteNodes", () => {
  it("brackets intermediaries between an originator and the beneficiary", () => {
    const nodes = buildRouteNodes(
      [{ bic: "CITIUS33", bank: "Citibank NY" }],
      "SBININBBXXX",
    );

    expect(nodes.map((n) => n.kind)).toEqual([
      "originator",
      "intermediary",
      "beneficiary",
    ]);
    expect(nodes[1].bic).toBe("CITIUS33");
    expect(nodes[1].name).toBe("Citibank NY");
    expect(nodes[2].bic).toBe("SBININBBXXX");
  });

  it("preserves intermediary order for a multi-hop chain", () => {
    const nodes = buildRouteNodes(
      [
        { bic: "CITIUS33", bank: "Citibank NY" },
        { bic: "DEUTDEFF", bank: "Deutsche Bank" },
      ],
      "SBININBBXXX",
    );

    expect(nodes.map((n) => n.bic)).toEqual([
      "—",
      "CITIUS33",
      "DEUTDEFF",
      "SBININBBXXX",
    ]);
  });

  it("falls back to the BIC when an intermediary carries no name", () => {
    const nodes = buildRouteNodes([{ bic: "DEUTDEFF" }], "SBININBBXXX");

    expect(nodes[1].name).toBe("DEUTDEFF");
  });

  it("returns only the endpoints when there are no intermediaries", () => {
    const nodes = buildRouteNodes([], "SBININBBXXX");

    expect(nodes.map((n) => n.kind)).toEqual(["originator", "beneficiary"]);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `cd frontend && npx vitest run src/design-system/payment-route/routeNodes.test.ts`
Expected: PASS, 4 tests. The move is a rename, so the behaviour is already correct — this test locks it in before anything depends on it.

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. If it reports an unresolved import of `routeNodes`, an importer was missed in Step 1.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/design-system/payment-route/routeNodes.ts frontend/src/design-system/payment-route/routeNodes.test.ts
git commit -m "refactor(design-system): move buildRouteNodes beside PaymentRoute and test it"
```

---

### Task 2: Group SSI records by currency

Pure function, no React, so the ordering rules are testable directly.

**Files:**
- Create: `frontend/src/features/explore/ssiGrouping.ts`
- Create: `frontend/src/features/explore/ssiGrouping.test.ts`

**Interfaces:**
- Consumes: `SSIRecord` from `../../api/schemas`.
- Produces: `groupByCurrency(records: SSIRecord[]): CurrencyGroup[]` where `interface CurrencyGroup { currency: string; records: SSIRecord[] }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/explore/ssiGrouping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupByCurrency } from "./ssiGrouping";
import type { SSIRecord } from "../../api/schemas";

function record(currency: string, intermediaryBic: string): SSIRecord {
  return {
    beneficiary_bic: "SBININBBXXX",
    beneficiary_bank_name: "State Bank of India",
    currency,
    intermediary_bic: intermediaryBic,
    intermediary_bank_name: `${intermediaryBic} Bank`,
    intermediary_account: "ACCT-0001",
    beneficiary_account: "ACCT-0002",
    charge_code: "SHA",
    value_date: "spot",
    notes: undefined,
  };
}

describe("groupByCurrency", () => {
  it("nests every intermediary for a currency under one group", () => {
    const groups = groupByCurrency([
      record("USD", "BOFAUS3N"),
      record("USD", "CHASUS33"),
      record("USD", "CITIUS33"),
      record("EUR", "DEUTDEFF"),
    ]);

    expect(groups.map((g) => g.currency)).toEqual(["EUR", "USD"]);
    const usd = groups.find((g) => g.currency === "USD")!;
    expect(usd.records.map((r) => r.intermediary_bic)).toEqual([
      "BOFAUS3N",
      "CHASUS33",
      "CITIUS33",
    ]);
  });

  it("orders currencies alphabetically so the list is scannable", () => {
    const groups = groupByCurrency([
      record("USD", "CITIUS33"),
      record("AED", "EBILAEAD"),
      record("GBP", "BARCGB22"),
    ]);

    expect(groups.map((g) => g.currency)).toEqual(["AED", "GBP", "USD"]);
  });

  it("preserves source order of intermediaries within a currency", () => {
    const groups = groupByCurrency([
      record("USD", "ZZZZUS33"),
      record("USD", "AAAAUS33"),
    ]);

    expect(groups[0].records.map((r) => r.intermediary_bic)).toEqual([
      "ZZZZUS33",
      "AAAAUS33",
    ]);
  });

  it("returns an empty array for no records", () => {
    expect(groupByCurrency([])).toEqual([]);
  });

  it("ignores records with a blank currency rather than making a blank group", () => {
    const groups = groupByCurrency([record("", "CITIUS33"), record("USD", "BOFAUS3N")]);

    expect(groups.map((g) => g.currency)).toEqual(["USD"]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd frontend && npx vitest run src/features/explore/ssiGrouping.test.ts`
Expected: FAIL — `Failed to resolve import "./ssiGrouping"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/explore/ssiGrouping.ts`:

```ts
import type { SSIRecord } from "../../api/schemas";

export interface CurrencyGroup {
  currency: string;
  records: SSIRecord[];
}

/**
 * Group settlement instructions by their own `currency` field.
 *
 * A bank commonly holds Nostro accounts with several correspondents in the SAME
 * currency — State Bank of India has four USD intermediaries — so the grouping
 * is one currency to many records, and flattening would hide that.
 *
 * Never group on SSIResponse.currency: when the request omits a currency the
 * endpoint sets that field to the sentinel string "ALL", which is not a currency.
 *
 * Currencies are sorted alphabetically; records keep their source order within a
 * currency, which is the order the API returned them in.
 */
export function groupByCurrency(records: SSIRecord[]): CurrencyGroup[] {
  const byCurrency = new Map<string, SSIRecord[]>();

  for (const record of records) {
    if (!record.currency) continue;
    const existing = byCurrency.get(record.currency);
    if (existing) {
      existing.push(record);
    } else {
      byCurrency.set(record.currency, [record]);
    }
  }

  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, groupRecords]) => ({ currency, records: groupRecords }));
}
```

- [ ] **Step 4: Run the test**

Run: `cd frontend && npx vitest run src/features/explore/ssiGrouping.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/explore/ssiGrouping.ts frontend/src/features/explore/ssiGrouping.test.ts
git commit -m "feat(explore): group settlement instructions by currency"
```

---

### Task 3: Bank detail route — identity, not-found, and institution-level disclosure

**Files:**
- Create: `frontend/src/features/explore/BankDetailRoute.tsx`
- Create: `frontend/src/features/explore/BankDetailRoute.test.tsx`
- Modify: `frontend/src/app-shell/App.tsx`

**Interfaces:**
- Consumes: `groupByCurrency` (Task 2) — not yet used, imported in Task 4.
- Produces: `BankDetailRoute` (named export), routed at `explore/banks/:bic`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/explore/BankDetailRoute.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { renderRelay, queryClient } from "../../test/render";
import { BankDetailRoute } from "./BankDetailRoute";

function renderBank(bic: string) {
  queryClient.clear();
  return renderRelay(
    <MemoryRouter initialEntries={[`/explore/banks/${bic}`]}>
      <Routes>
        <Route path="explore/banks/:bic" element={<BankDetailRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BankDetailRoute identity", () => {
  it("renders the bank's name and identity fields", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({
          bic: "SBININBBXXX",
          found: true,
          bank: {
            bic: "SBININBBXXX",
            bank_name: "State Bank of India",
            country_code: "IN",
            city: "Mumbai",
            country_currency: "INR",
          },
        }),
      ),
    );

    renderBank("SBININBBXXX");

    expect(
      await screen.findByRole("heading", { name: "State Bank of India" }),
    ).toBeVisible();
    // Scope to the identity grid: the BIC also appears in the breadcrumb, so
    // an unscoped getByText would throw on multiple matches.
    const grid = screen.getByText("BIC").closest("dl")!;
    expect(within(grid).getByText("SBININBBXXX")).toBeVisible();
    expect(within(grid).getByText("Mumbai")).toBeVisible();
  });

  it("shows a not-found state with a way back when the BIC is unknown", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "XXXXUS33XXX", found: false, bank: null }),
      ),
    );

    renderBank("XXXXUS33XXX");

    expect(
      await screen.findByRole("heading", { name: "Bank not found" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to Bank Directory" }),
    ).toBeVisible();
  });

  it("discloses institution-level resolution when the resolved BIC differs", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({
          bic: "SBININBB123",
          found: true,
          bank: {
            bic: "SBININBBXXX",
            bank_name: "State Bank of India",
            country_code: "IN",
            city: "Mumbai",
            country_currency: "INR",
          },
        }),
      ),
    );

    renderBank("SBININBB123");

    expect(
      await screen.findByText(/institution-level records for SBININBBXXX/i),
    ).toBeVisible();
  });

  it("does not disclose institution-level resolution on an exact match", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({
          bic: "SBININBBXXX",
          found: true,
          bank: {
            bic: "SBININBBXXX",
            bank_name: "State Bank of India",
            country_code: "IN",
            city: "Mumbai",
            country_currency: "INR",
          },
        }),
      ),
    );

    renderBank("SBININBBXXX");

    await screen.findByRole("heading", { name: "State Bank of India" });
    await waitFor(() => {
      expect(screen.queryByText(/institution-level records/i)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd frontend && npx vitest run src/features/explore/BankDetailRoute.test.tsx`
Expected: FAIL — `Failed to resolve import "./BankDetailRoute"`.

- [ ] **Step 3: Write the component**

Create `frontend/src/features/explore/BankDetailRoute.tsx`:

```tsx
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiKeys } from "../../api/queryKeys";
import { apiRequest } from "../../api/client";
import { LookupResponseSchema } from "../../api/schemas";
import type { LookupResponse } from "../../api/schemas";
import { AsyncRegion } from "../../design-system/AsyncRegion";
import type { AsyncStatus } from "../../design-system/types";
import type { ApiProblem } from "../../api/problem";
import "./ExplorePage.css";

/**
 * Bank detail — `/app/explore/banks/:bic`.
 *
 * All three backing endpoints resolve a BIC by exact match, then the 8-char
 * prefix, then the 6-char prefix, so a branch BIC resolves to its head office.
 * When that happens the page says so rather than presenting an institution's
 * records as a specific branch's.
 */
export function BankDetailRoute() {
  const { bic: rawBic } = useParams<{ bic: string }>();
  const requestedBic = (rawBic ?? "").toUpperCase();

  const lookup = useQuery({
    queryKey: apiKeys.lookup(requestedBic),
    queryFn: () =>
      apiRequest<LookupResponse>(
        `/api/lookup?bic=${encodeURIComponent(requestedBic)}`,
        undefined,
        LookupResponseSchema,
      ),
    enabled: requestedBic.length > 0,
  });

  // ── Later tasks insert their queries here ──────────────────────────────
  // Task 4 adds the SSI query, Task 5 the heuristic route query. They belong
  // ABOVE the not-found early return: hooks must run unconditionally on every
  // render, so a query placed after the return would violate the rules of
  // hooks the first time a BIC misses.

  const bank = lookup.data?.bank ?? null;

  // The route param is what the learner typed; bank.bic is what the API
  // resolved it to. They differ for any branch BIC.
  const resolvedDiffers = Boolean(bank && bank.bic && bank.bic !== requestedBic);

  // Not-found is a page-level state, NOT an AsyncRegion empty slot. AsyncRegion
  // returns its own empty message *instead of* children for status="empty", so
  // a not-found block passed as a child would never render.
  if (lookup.data && !lookup.data.found) {
    return (
      <div className="explore">
        <nav className="explore__breadcrumb" aria-label="Breadcrumb">
          <Link to="/explore/banks">Bank Directory</Link>
          <span aria-hidden="true">/</span>
          <span className="mono">{requestedBic}</span>
        </nav>
        <div className="bank-detail__not-found">
          <h1>Bank not found</h1>
          <p className="measure">
            No bank in the directory matches <span className="mono">{requestedBic}</span>.
            The BIC may be mistyped, or the link may be out of date.
          </p>
          <Link to="/explore/banks" className="relay-btn relay-btn--secondary">
            Back to Bank Directory
          </Link>
        </div>
      </div>
    );
  }

  // Only loading / error / success reach AsyncRegion now.
  let status: AsyncStatus = "loading";
  if (lookup.isError) status = "error";
  else if (lookup.data) status = "success";

  return (
    <div className="explore">
      <nav className="explore__breadcrumb" aria-label="Breadcrumb">
        <Link to="/explore/banks">Bank Directory</Link>
        <span aria-hidden="true">/</span>
        <span className="mono">{requestedBic}</span>
      </nav>

      <AsyncRegion
        status={status}
        loadingLabel="Loading bank"
        error={lookup.error as ApiProblem | null}
        onRetry={() => lookup.refetch()}
      >
        {bank && (
          <>
            <div className="bank-detail">
              <h1 className="bank-detail__name">{bank.bank_name}</h1>
              <dl className="bank-detail__grid">
                <dt>BIC</dt>
                <dd className="mono">{bank.bic}</dd>
                {bank.country_code && (
                  <>
                    <dt>Country</dt>
                    <dd className="mono">{bank.country_code}</dd>
                  </>
                )}
                {bank.city && (
                  <>
                    <dt>City</dt>
                    <dd>{bank.city}</dd>
                  </>
                )}
                {bank.country_currency && (
                  <>
                    <dt>Currency</dt>
                    <dd className="mono">{bank.country_currency}</dd>
                  </>
                )}
              </dl>

              {resolvedDiffers && (
                <p className="bank-detail__resolution">
                  Showing institution-level records for{" "}
                  <span className="mono">{bank.bic}</span>. The BIC you searched
                  resolves to this institution rather than a specific branch.
                </p>
              )}

              <div className="bank-detail__actions">
                <Link
                  to={`/operate/prepare?bic=${encodeURIComponent(bank.bic)}`}
                  className="relay-btn relay-btn--secondary"
                >
                  Prepare payment to this bank
                </Link>
              </div>
            </div>
          </>
        )}
      </AsyncRegion>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `cd frontend && npx vitest run src/features/explore/BankDetailRoute.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Register the lazy route**

In `frontend/src/app-shell/App.tsx`, add after the other explore lazy imports (near line 12):

```tsx
const BankDetailRoute = lazy(() => import("../features/explore/BankDetailRoute").then(m => ({ default: m.BankDetailRoute })));
```

Add the route immediately after the `explore/banks` line. Static segments outrank dynamic ones in React Router 7, so `explore/banks` still wins for the index:

```tsx
              <Route path="explore/banks/:bic" element={<Suspense fallback={null}><BankDetailRoute /></Suspense>} />
```

- [ ] **Step 6: Add the styles**

Append to `frontend/src/features/explore/ExplorePage.css`:

```css
/* ─── Bank detail route ─────────────────────────────────────────────── */

.explore__breadcrumb {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}

.bank-detail__resolution {
  margin-top: var(--space-3);
  padding: var(--space-3);
  border-left: 2px solid var(--color-border);
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
  max-width: 60ch;
}

.bank-detail__not-found {
  padding: var(--space-6) 0;
}
```

- [ ] **Step 7: Typecheck and build**

Run: `cd frontend && npm run build`
Expected: `tsc --noEmit` clean, Vite build succeeds. If a CSS custom property above is undefined, check the real names in `src/design-system/tokens.css` and use those — do not invent token names.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/explore/BankDetailRoute.tsx frontend/src/features/explore/BankDetailRoute.test.tsx frontend/src/features/explore/ExplorePage.css frontend/src/app-shell/App.tsx
git commit -m "feat(explore): add bank detail route with institution-level disclosure"
```

---

### Task 4: Published settlement instructions panel

**Files:**
- Modify: `frontend/src/features/explore/BankDetailRoute.tsx`
- Modify: `frontend/src/features/explore/BankDetailRoute.test.tsx`
- Modify: `frontend/src/features/explore/ExplorePage.css`

**Interfaces:**
- Consumes: `groupByCurrency(records: SSIRecord[]): CurrencyGroup[]` from `./ssiGrouping` (Task 2).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/features/explore/BankDetailRoute.test.tsx`:

```tsx
const INDIA_BANK = {
  bic: "SBININBBXXX",
  bank_name: "State Bank of India",
  country_code: "IN",
  city: "Mumbai",
  country_currency: "INR",
};

function ssiRecord(currency: string, intermediaryBic: string, name: string) {
  return {
    beneficiary_bic: "SBININBBXXX",
    beneficiary_bank_name: "State Bank of India",
    currency,
    intermediary_bic: intermediaryBic,
    intermediary_bank_name: name,
    intermediary_account: `ACCT-${intermediaryBic}`,
    beneficiary_account: "ACCT-BENE-1",
    charge_code: "SHA",
    value_date: "spot",
    notes: undefined,
  };
}

describe("BankDetailRoute settlement instructions", () => {
  it("groups intermediaries under their currency and shows account details", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "SBININBBXXX", found: true, bank: INDIA_BANK }),
      ),
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [
            ssiRecord("USD", "BOFAUS3N", "Bank of America New York"),
            ssiRecord("USD", "CHASUS33", "JP Morgan Chase NY"),
            ssiRecord("EUR", "DEUTDEFF", "Deutsche Bank Frankfurt"),
          ],
          disclaimer: "SIMULATION — illustrative placeholder accounts.",
        }),
      ),
    );

    renderBank("SBININBBXXX");

    expect(
      await screen.findByRole("heading", { name: "Published settlement instructions" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "USD" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "EUR" })).toBeVisible();
    expect(screen.getByText("Bank of America New York")).toBeVisible();
    expect(screen.getByText("JP Morgan Chase NY")).toBeVisible();
    expect(screen.getByText("ACCT-BOFAUS3N")).toBeVisible();
  });

  it("renders the simulation disclaimer alongside settlement data", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "SBININBBXXX", found: true, bank: INDIA_BANK }),
      ),
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [ssiRecord("USD", "BOFAUS3N", "Bank of America New York")],
          disclaimer: "SIMULATION — illustrative placeholder accounts.",
        }),
      ),
    );

    renderBank("SBININBBXXX");

    expect(
      await screen.findByText(/SIMULATION — illustrative placeholder accounts\./),
    ).toBeVisible();
  });

  it("never renders the ALL sentinel as a currency heading", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "SBININBBXXX", found: true, bank: INDIA_BANK }),
      ),
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [ssiRecord("USD", "BOFAUS3N", "Bank of America New York")],
          disclaimer: "SIMULATION",
        }),
      ),
    );

    renderBank("SBININBBXXX");

    await screen.findByRole("heading", { name: "USD" });
    expect(screen.queryByRole("heading", { name: "ALL" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm the new tests fail**

Run: `cd frontend && npx vitest run src/features/explore/BankDetailRoute.test.tsx`
Expected: the 4 Task 3 tests PASS; the 3 new tests FAIL on the missing "Published settlement instructions" heading.

- [ ] **Step 3: Add the SSI query and panel**

In `BankDetailRoute.tsx`, extend the imports:

```tsx
import { LookupResponseSchema, SSIResponseSchema } from "../../api/schemas";
import type { LookupResponse, SSIResponse } from "../../api/schemas";
import { groupByCurrency } from "./ssiGrouping";
```

Add the query at the insertion-point comment left by Task 3 — after the `lookup` query and **above** the `const bank = ...` line and the not-found early return. Note the empty-string currency in the key: `apiKeys.ssi` is `(bic, currency)` and this call deliberately omits the currency to get every currency at once:

```tsx
  const ssi = useQuery({
    queryKey: apiKeys.ssi(requestedBic, ""),
    queryFn: () =>
      apiRequest<SSIResponse>(
        `/api/ssi?bic=${encodeURIComponent(requestedBic)}`,
        undefined,
        SSIResponseSchema,
      ),
    enabled: requestedBic.length > 0,
  });

  const instructions = ssi.data?.instructions ?? [];
  const currencyGroups = groupByCurrency(instructions);
  const hasSSI = currencyGroups.length > 0;
```

Add this block inside the `{bank && (<>...</>)}` fragment, after the closing `</div>` of `.bank-detail`:

```tsx
            {hasSSI && (
              <section className="bank-ssi" aria-labelledby="bank-ssi-title">
                <h2 id="bank-ssi-title">Published settlement instructions</h2>
                <p className="measure bank-ssi__intro">
                  Where this bank holds Nostro accounts, and which correspondent
                  to pay for each currency. A currency can list more than one
                  correspondent.
                </p>

                {currencyGroups.map((group) => (
                  <div className="bank-ssi__group" key={group.currency}>
                    <h3 className="bank-ssi__currency mono">{group.currency}</h3>
                    <ul className="bank-ssi__list">
                      {group.records.map((r) => (
                        <li
                          className="bank-ssi__item"
                          key={`${group.currency}-${r.intermediary_bic}`}
                        >
                          <p className="bank-ssi__intermediary">
                            {r.intermediary_bank_name ?? r.intermediary_bic}
                          </p>
                          <dl className="bank-ssi__fields">
                            <dt>Intermediary BIC</dt>
                            <dd className="mono">{r.intermediary_bic}</dd>
                            {r.intermediary_account && (
                              <>
                                <dt>Nostro account</dt>
                                <dd className="mono">{r.intermediary_account}</dd>
                              </>
                            )}
                            {r.beneficiary_account && (
                              <>
                                <dt>Credit to</dt>
                                <dd className="mono">{r.beneficiary_account}</dd>
                              </>
                            )}
                            <dt>Charges</dt>
                            <dd className="mono">{r.charge_code}</dd>
                            <dt>Value date</dt>
                            <dd>{r.value_date}</dd>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {ssi.data?.disclaimer && (
                  <p className="bank-ssi__disclaimer">{ssi.data.disclaimer}</p>
                )}
              </section>
            )}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/features/explore/BankDetailRoute.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the styles**

Append to `frontend/src/features/explore/ExplorePage.css`:

```css
.bank-ssi {
  margin-top: var(--space-6);
}

.bank-ssi__intro {
  color: var(--color-ink-muted);
}

.bank-ssi__group {
  margin-top: var(--space-4);
}

.bank-ssi__currency {
  margin-bottom: var(--space-2);
}

.bank-ssi__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3);
}

.bank-ssi__item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-region);
  padding: var(--space-3);
}

.bank-ssi__intermediary {
  font-weight: 600;
  margin: 0 0 var(--space-2);
}

.bank-ssi__disclaimer {
  margin-top: var(--space-4);
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}
```

- [ ] **Step 6: Build**

Run: `cd frontend && npm run build`
Expected: clean. Replace any undefined token with the real name from `src/design-system/tokens.css`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/explore/BankDetailRoute.tsx frontend/src/features/explore/BankDetailRoute.test.tsx frontend/src/features/explore/ExplorePage.css
git commit -m "feat(explore): show published settlement instructions grouped by currency"
```

---

### Task 5: Heuristic correspondent fallback

**Files:**
- Modify: `frontend/src/features/explore/BankDetailRoute.tsx`
- Modify: `frontend/src/features/explore/BankDetailRoute.test.tsx`
- Modify: `frontend/src/features/explore/ExplorePage.css`

**Interfaces:**
- Consumes: `buildRouteNodes` (Task 1), `PaymentRoute` from `../../design-system/payment-route/PaymentRoute`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/features/explore/BankDetailRoute.test.tsx`:

```tsx
const EMPTY_SSI = {
  beneficiary_bic: "GTBINGLAXXX",
  currency: "ALL",
  instructions: [],
  disclaimer: "SIMULATION",
};

const NIGERIA_BANK = {
  bic: "GTBINGLAXXX",
  bank_name: "Guaranty Trust Bank",
  country_code: "NG",
  city: "Lagos",
  country_currency: "NGN",
};

describe("BankDetailRoute heuristic fallback", () => {
  it("shows the heuristic chain when the bank has no published SSI", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "GTBINGLAXXX", found: true, bank: NIGERIA_BANK }),
      ),
      http.get("/api/ssi", () => HttpResponse.json(EMPTY_SSI)),
      http.get("/api/route", () =>
        HttpResponse.json({
          bic: "GTBINGLAXXX",
          bank: null,
          beneficiary_country: "NG",
          currency: "NGN",
          valid: true,
          suggested_intermediaries: [
            { bic: "CITIUS33", bank: "Citibank NY", corridor: "USD-NGN", confidence: "high" },
          ],
          notes: "Heuristic suggestion.",
          source: "curated-corridor-table",
        }),
      ),
    );

    renderBank("GTBINGLAXXX");

    expect(
      await screen.findByRole("heading", { name: "Heuristic correspondent route" }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Published settlement instructions" })).toBeNull();
    // findByText, not getByText: the confidence dd appears after the route
    // query resolves asynchronously.
    expect(await screen.findByText(/high/)).toBeVisible();
  });

  it("requests the heuristic route in the bank's own country currency", async () => {
    const seen: string[] = [];
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "GTBINGLAXXX", found: true, bank: NIGERIA_BANK }),
      ),
      http.get("/api/ssi", () => HttpResponse.json(EMPTY_SSI)),
      http.get("/api/route", ({ request }) => {
        seen.push(new URL(request.url).searchParams.get("currency") ?? "");
        return HttpResponse.json({
          bic: "GTBINGLAXXX",
          bank: null,
          beneficiary_country: "NG",
          currency: "NGN",
          valid: true,
          suggested_intermediaries: [],
          notes: "No curated corridor rule for currency=NGN country=NG.",
          source: "curated-corridor-table",
        });
      }),
    );

    renderBank("GTBINGLAXXX");

    await screen.findByRole("heading", { name: "Heuristic correspondent route" });
    await waitFor(() => expect(seen).toContain("NGN"));
  });

  it("renders the backend's own explanation when nothing matches", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "GTBINGLAXXX", found: true, bank: NIGERIA_BANK }),
      ),
      http.get("/api/ssi", () => HttpResponse.json(EMPTY_SSI)),
      http.get("/api/route", () =>
        HttpResponse.json({
          bic: "GTBINGLAXXX",
          bank: null,
          beneficiary_country: "NG",
          currency: "NGN",
          valid: true,
          suggested_intermediaries: [],
          notes: "No curated corridor rule for currency=NGN country=NG. Contact originator bank for exact chain.",
          source: "curated-corridor-table",
        }),
      ),
    );

    renderBank("GTBINGLAXXX");

    expect(
      await screen.findByText(/No curated corridor rule for currency=NGN country=NG/),
    ).toBeVisible();
  });

  it("keeps the settlement panel when the heuristic route request fails", async () => {
    server.use(
      http.get("/api/lookup", () =>
        HttpResponse.json({ bic: "SBININBBXXX", found: true, bank: INDIA_BANK }),
      ),
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "SBININBBXXX",
          currency: "ALL",
          instructions: [ssiRecord("USD", "BOFAUS3N", "Bank of America New York")],
          disclaimer: "SIMULATION",
        }),
      ),
      http.get("/api/route", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    );

    renderBank("SBININBBXXX");

    expect(
      await screen.findByRole("heading", { name: "Published settlement instructions" }),
    ).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to confirm the new tests fail**

Run: `cd frontend && npx vitest run src/features/explore/BankDetailRoute.test.tsx`
Expected: the 7 earlier tests PASS; the 3 genuinely new ones FAIL on the missing "Heuristic correspondent route" heading. (The 4th new test — the SSI-precedence regression guard — already passes at this point.)

- [ ] **Step 3: Add the route query and fallback block**

Extend the imports in `BankDetailRoute.tsx`:

```tsx
import { LookupResponseSchema, SSIResponseSchema, RouteResponseSchema } from "../../api/schemas";
import type { LookupResponse, SSIResponse, RouteResponse } from "../../api/schemas";
import { PaymentRoute } from "../../design-system/payment-route/PaymentRoute";
import { buildRouteNodes } from "../../design-system/payment-route/routeNodes";
```

This query reads `bank`, so unlike the SSI query it goes **below** the `const bank = ...` line — but still **above** the not-found early return, because hooks must run unconditionally. Placing it beside the SSI query would reference `bank` before its declaration and fail to compile.

The currency comes from the resolved bank; `USD` is a defensive fallback, since `country_currency` is populated for every seeded bank:

```tsx
  const routeCurrency = bank?.country_currency || "USD";

  // Fired in parallel with the SSI query rather than after it. 87% of banks have
  // no published SSI, so a conditional fetch would make the common case pay two
  // sequential round trips to save one request for the uncommon case.
  const heuristic = useQuery({
    queryKey: apiKeys.route(requestedBic, routeCurrency),
    queryFn: () =>
      apiRequest<RouteResponse>(
        `/api/route?bic=${encodeURIComponent(requestedBic)}&currency=${encodeURIComponent(routeCurrency)}`,
        undefined,
        RouteResponseSchema,
      ),
    enabled: requestedBic.length > 0 && Boolean(bank),
  });
```

The not-found early return added in Task 3 sits below all three queries, so every hook still runs on every render.

Add this block immediately after the `{hasSSI && (...)}` section:

```tsx
            {ssi.data !== undefined && !hasSSI && (
              <section className="bank-route" aria-labelledby="bank-route-title">
                <h2 id="bank-route-title">Heuristic correspondent route</h2>

                {heuristic.isError ? (
                  <p className="bank-route__error">
                    No published settlement instructions are on file for this
                    bank, and the suggested chain could not be loaded. Try
                    reloading the page.
                  </p>
                ) : (
                  <p className="measure bank-route__intro">
                    No published settlement instructions are on file for this
                    bank. Real correspondent relationships are private and
                    bank-specific, so the chain below is an informed suggestion
                    from the curated corridor table — not a published
                    instruction.
                  </p>
                )}

                {heuristic.data && heuristic.data.suggested_intermediaries.length > 0 && (
                  <>
                    <PaymentRoute
                      nodes={buildRouteNodes(
                        heuristic.data.suggested_intermediaries,
                        bank.bic,
                        "possible",
                      )}
                      currency={heuristic.data.currency}
                    />
                    <dl className="bank-route__meta">
                      <dt>Confidence</dt>
                      <dd>{heuristic.data.suggested_intermediaries[0].confidence}</dd>
                      <dt>Source</dt>
                      <dd>{heuristic.data.source}</dd>
                    </dl>
                  </>
                )}

                {heuristic.data &&
                  heuristic.data.suggested_intermediaries.length === 0 &&
                  heuristic.data.notes && (
                    <p className="bank-route__notes measure">{heuristic.data.notes}</p>
                  )}
              </section>
            )}
```

The gate is `ssi.data !== undefined && !hasSSI`, NOT `!hasSSI && !ssi.isLoading`: the former distinguishes "loaded, empty" from "request failed", so a settlement-service failure can never render the false claim "No published settlement instructions are on file" (that claim is suppressed on error — see the separate `ssi.isError` note beside the SSI section). The `heuristic.isError` branch keeps the per-block error contract from the spec's error table: no dangling "the chain below…" with no chain.

Confidence is rendered as plain text inside a `<dd>`, deliberately not a `StatusChip` — `StatusChipStatus` has no `high`/`medium`/`low` member. The chain nodes are built with status `"possible"` (not the `"passed"` default) so a suggested chain never wears the verified-state visuals of an executed route.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/features/explore/BankDetailRoute.test.tsx`
Expected: PASS, 13 tests. (The review fix wave added two tests to Task 5's file: the suggested-chain error state, and assertions that heuristic chains render "Possible" chips, never "Passed".)

- [ ] **Step 5: Add the styles**

Append to `frontend/src/features/explore/ExplorePage.css`:

```css
.bank-route {
  margin-top: var(--space-6);
}

.bank-route__intro,
.bank-route__notes {
  color: var(--color-ink-muted);
}

.bank-route__meta {
  margin-top: var(--space-3);
}
```

- [ ] **Step 6: Build**

Run: `cd frontend && npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/explore/BankDetailRoute.tsx frontend/src/features/explore/BankDetailRoute.test.tsx frontend/src/features/explore/ExplorePage.css
git commit -m "feat(explore): fall back to the heuristic correspondent chain"
```

---

### Task 6: Link the directory search result to the new route

**Files:**
- Modify: `frontend/src/features/explore/ExplorePage.tsx`
- Modify: `frontend/src/features/explore/ExplorePage.test.tsx`

**Interfaces:**
- Consumes: the route registered in Task 3.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

`ExplorePage.test.tsx` already imports `userEvent`, `MemoryRouter`, `screen` and `GlossaryPage`. Do **not** append fresh import lines for those — a second `import userEvent from ...` is a redeclaration error. Make two edits:

1. Extend the existing line 5 import to pull in the other page:

```tsx
import { GlossaryPage, BankDirectoryPage } from "./ExplorePage";
```

2. Add one genuinely new import beneath it:

```tsx
import { renderRelay, queryClient } from "../../test/render";
```

`BankDirectoryPage` uses `useQuery`, so it needs `renderRelay` (which supplies the `QueryClientProvider`) rather than the bare `render` the glossary tests use.

Then append the test block:

```tsx
describe("BankDirectoryPage", () => {
  it("links a found bank to its detail route instead of expanding inline", async () => {
    queryClient.clear();
    const user = userEvent.setup();

    renderRelay(
      <MemoryRouter initialEntries={["/explore/banks"]}>
        <BankDirectoryPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("BIC to look up"), "CITIUS33");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    const link = await screen.findByRole("link", { name: /View settlement details/i });
    expect(link).toHaveAttribute("href", "/explore/banks/CITIUS33");
  });
});
```

The default MSW `/api/lookup` handler echoes the requested BIC, so no `server.use` override is needed.

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd frontend && npx vitest run src/features/explore/ExplorePage.test.tsx`
Expected: FAIL — no link matching "View settlement details".

- [ ] **Step 3: Replace the inline card with a summary and link**

In `frontend/src/features/explore/ExplorePage.tsx`, delete the whole `BankDetailCard` function (starts at line 113 with `function BankDetailCard(`, ends at its closing brace before the Payment Schemes comment).

Replace the `<BankDetailCard bank={query.data.bank} />` usage inside `BankDirectoryPage` with:

```tsx
            {query.data?.bank && (
              <div className="bank-detail">
                <h2 className="bank-detail__name">{query.data.bank.bank_name}</h2>
                <dl className="bank-detail__grid">
                  <dt>BIC</dt>
                  <dd className="mono">{query.data.bank.bic}</dd>
                  {query.data.bank.country_code && (
                    <>
                      <dt>Country</dt>
                      <dd className="mono">{query.data.bank.country_code}</dd>
                    </>
                  )}
                  {query.data.bank.city && (
                    <>
                      <dt>City</dt>
                      <dd>{query.data.bank.city}</dd>
                    </>
                  )}
                </dl>
                <div className="bank-detail__actions">
                  <Link
                    to={`/explore/banks/${encodeURIComponent(query.data.bank.bic)}`}
                    className="relay-btn relay-btn--primary"
                  >
                    View settlement details
                  </Link>
                </div>
              </div>
            )}
```

`Link` is already imported at `ExplorePage.tsx:1`.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/features/explore/ExplorePage.test.tsx`
Expected: PASS, including the pre-existing glossary tests.

- [ ] **Step 5: Run the whole unit suite for regressions**

Run: `cd frontend && npm test -- --no-file-parallelism`
Expected: all pass. Baseline was 808; this plan adds roughly 20.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/explore/ExplorePage.tsx frontend/src/features/explore/ExplorePage.test.tsx
git commit -m "feat(explore): link directory results to the bank detail route"
```

---

### Task 7: End-to-end coverage and budget verification

**Files:**
- Modify: `frontend/e2e/explore.spec.ts`

**Interfaces:**
- Consumes: everything above, against the real built app.
- Produces: nothing.

- [ ] **Step 1: Write the e2e test**

Append to `frontend/e2e/explore.spec.ts`:

```ts
test.describe("Bank detail", () => {
  test("deep link shows published settlement instructions grouped by currency", async ({ page }) => {
    await page.goto("/app/explore/banks/SBININBBXXX", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "State Bank of India" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Published settlement instructions" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "USD" })).toBeVisible();
  });

  test("a bank without SSI shows the heuristic route instead", async ({ page }) => {
    await page.goto("/app/explore/banks/COBADEFFXXX", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "Heuristic correspondent route" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Published settlement instructions" }),
    ).toHaveCount(0);
  });

  test("an unknown BIC degrades to a not-found state", async ({ page }) => {
    // XXXXUS33XXX: the plan's original ZZZZZZ99XXX is rejected by the API's BIC
    // validation (non-ISO country code "99" -> 400 before lookup), so a
    // valid-format-but-absent BIC is required to reach the not-found path.
    await page.goto("/app/explore/banks/XXXXUS33XXX", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "Bank not found" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: "Back to Bank Directory" }),
    ).toBeVisible();
  });

  test("axe: no serious violations on bank detail", async ({ page }) => {
    await page.goto("/app/explore/banks/SBININBBXXX", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "State Bank of India" }),
    ).toBeVisible({ timeout: 10_000 });

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
```

If `explore.spec.ts` does not already import `AxeBuilder`, add `import AxeBuilder from "@axe-core/playwright";` at the top. Check first — do not add a duplicate import.

- [ ] **Step 2: Build so the e2e server serves the new route**

Run: `cd frontend && npm run build`
Expected: clean.

- [ ] **Step 3: Run the e2e spec**

Run: `cd frontend && npx playwright test e2e/explore.spec.ts --project=desktop`
Expected: PASS. Both fixtures are real seed data: `SBININBBXXX` has 36 SSI rows, `COBADEFFXXX` (Commerzbank, EUR) has none but does resolve 3 heuristic intermediaries. Do NOT substitute `GTBINGLAXXX` — it carries 3 SSI rows and would take the published branch. Confirm with `curl 'http://127.0.0.1:8000/api/ssi?bic=COBADEFFXXX'`.

- [ ] **Step 4: Check the bundle budget**

Run: `cd frontend && npm run check:bundle`
Expected: PASS. The new route is its own lazy chunk, so the eager shell should be unchanged from its 124,514-byte baseline.

- [ ] **Step 5: Run the full suites**

Run:
```bash
cd frontend && npm test -- --no-file-parallelism && npm run test:e2e
```
Expected: unit all pass; e2e 0 failed. Baseline before this plan: 288 passed / 13 skipped.

- [ ] **Step 6: Run the backend suite to prove nothing leaked**

Run: `cd .. && source .venv/bin/activate && python -m pytest tests/ -q`
Expected: 612 passed. This feature makes no backend change, so any deviation means something went wrong.

- [ ] **Step 7: Commit**

```bash
git add frontend/e2e/explore.spec.ts
git commit -m "test(e2e): cover bank detail deep links, fallback, and accessibility"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| Route `explore/banks/:bic`, lazy, breadcrumb | 3 |
| `BankDetailCard` moves out of `ExplorePage` | 3, 6 |
| Not-found for unknown BIC | 3 |
| Institution-level BIC disclosure | 3 |
| SSI with currency omitted, all currencies | 4 |
| Group by record currency, never `"ALL"` | 2, 4 |
| Disclaimer rendered | 4 |
| Parallel queries, not a waterfall | 5 |
| Per-query independent errors | 5 |
| Heuristic fallback via `PaymentRoute` | 5 |
| Currency default from `country_currency` | 5 |
| Backend `notes` for the empty state | 5 |
| Confidence as plain text | 5 |
| `buildRouteNodes` moved + tested | 1 |
| Directory links into the route | 6 |
| E2E + axe + bundle | 7 |

**Placeholder scan:** no TBD/TODO; every code step carries complete code.

**Type consistency:** `groupByCurrency` / `CurrencyGroup` defined in Task 2 and consumed under the same names in Task 4. `buildRouteNodes(intermediaries, beneficiaryBic)` defined in Task 1, called with that signature in Task 5. `bank`, `hasSSI`, `requestedBic` and `routeCurrency` are introduced in Tasks 3–5 in the order they are used.

**Verified against the tree:**

- Every design token used in the CSS steps is defined in `src/design-system/tokens.css`: `--space-2/3/4/6`, `--color-border`, `--color-ink-muted`, `--radius-region`, `--text-sm`. The first draft of this plan used `--color-text-muted` and `--radius-md`, neither of which exists; both were corrected.
- `relay-btn--primary` / `--secondary` are defined in `Button.css`, which compiles into the **eager** shell stylesheet (`check:bundle` lists `index-*.css` as an eager asset). So `BankDetailRoute` can use those classes without importing `Button`, exactly as `CaseDeskRoute` already does — a lazy route will not render them unstyled.
- `AsyncStatus` includes every member this plan assigns: `idle`, `loading`, `success`, `empty`, `error`.
- `server` is a named export of `src/test/server.ts`; `renderRelay` and `queryClient` are named exports of `src/test/render.tsx`.
- MSW handlers for `/api/lookup`, `/api/route` and `/api/ssi` already exist in `src/test/handlers.ts`. The default `/api/ssi` handler returns `instructions: []`, which is the fallback path — tests asserting SSI-present must override with `server.use(...)`, as Task 4 does.
- `e2e/explore.spec.ts` does **not** currently import `AxeBuilder`, so Task 7 adds it.
- `PaymentRoute` accepts `{ nodes, currency, amount, activeNodeId }`; Task 5 passes `nodes` and `currency` only.

**Defects found in the first draft of this plan and fixed:**

1. **`AsyncRegion` returns its empty state *instead of* children.** Task 3 originally passed the not-found block as a child guarded by `status === "empty"`, which would never have rendered and would have failed its own test. Not-found is now a page-level early return.
2. **Hook ordering.** Task 5's heuristic query reads `bank`, and the first draft told the implementer to place it beside the SSI query — above `bank`'s declaration — while asserting no reordering was needed. That is a use-before-declaration compile error. Insertion points are now explicit, and all three queries sit above the early return so the rules of hooks hold.
3. **Invalid e2e fixture.** `GTBINGLAXXX` was used as the "bank with no SSI" case; it actually carries 3 SSI rows and would take the published branch. Replaced with `COBADEFFXXX`, verified through the API (which accounts for prefix-fallback matching, so a bank with no exact row can still return records).
4. **Duplicate imports.** Task 6 appended `import userEvent`, already imported in `ExplorePage.test.tsx` — a redeclaration error. Now specifies editing the existing import line.
