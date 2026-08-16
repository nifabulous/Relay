<!-- /autoplan restore point: /Users/olaniyi.oladokun/.gstack/projects/Leatherback/codex-ui-changes-autoplan-restore-20260816-232331.md -->

# Relay Unified UI Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the stale local SSI path and ship a measured, case-first UI improvement slice. The broader searchable/progressive-disclosure workspace remains a gated follow-up after the approved five-case learner research identifies the highest-value friction.

**Architecture:** Keep `AppShell` as the owner of route loading and only the smallest validated global affordances. Stage the work behind an evidence gate: first ship SSI compatibility, route/loading reliability, and the confirmed mobile overflow/accessibility fixes; then use the learner-research readout to select one case-first intervention. If search or directory lookup is validated as the bottleneck, add a bounded curated-bank API through the existing typed API/Zod/React Query stack. Keep tutor entry points contextual until availability, grounding, and learner-helpfulness instrumentation are ready. Do not introduce a synthetic payment-draft resume source.

**Tech Stack:** Python 3.10+, FastAPI, SQLAlchemy 2, Pydantic 2, React 19, TypeScript 7, React Router 7, TanStack Query 5, Zod 4, Vitest/Testing Library/MSW, pytest, Playwright.

## Global Constraints

- Relay remains an **Educational payment simulation**; recommendation and tracking results retain **Simulation — not a real payment**.
- Preserve Overview, Learn, Explore, and Operate as the only primary navigation destinations.
- Use existing tokens from `frontend/src/design-system/tokens.css`; controls use `--radius-control`, bounded regions use `--radius-region`, and status chips use `--radius-full`.
- Do not add gradients, decorative shadows, ornamental illustrations, icon circles, a dashboard card mosaic, or a three-column promotional grid.
- `PaymentRoute` remains the visual signature; mobile uses its existing vertical document-order rendering.
- Every changed async region must have stable loading, empty, error, success, and partial/degraded states.
- Acceptance viewports are 390×844, 768px wide, 1024px wide, and 1440×900; 320px is a robustness check.
- Primary touch targets are at least 44×44px; mobile form controls remain at least 16px.
- Respect `prefers-reduced-motion`, preserve visible labels, and restore focus after closing shell overlays.
- No live external bank provider is added; all bank and SSI content remains local and illustrative.
- Curated bank data must be labelled as examples with coverage/freshness/source metadata; never call it “all banks” or imply authoritative directory coverage.
- The walkthrough is not selected by `completedModules === 0`; it requires explicit persisted onboarding status. “Resume payment preparation” is out until a real persisted draft adapter exists.
- Do not make the tutor an always-visible shell promise while it is disabled by default; use contextual triggers and preserve the server’s `grounded` signal/citations when enabled.
- Keep a compact comparison view visible on Payment Schemes; progressive disclosure may reduce detail, but must not remove the comparison job.
- The five-case learner research is a release gate for new content/navigation surfaces, not a reason to block correctness, accessibility, or reliability fixes.
- Production schema history remains Alembic-owned; the compatibility helper is additive SQLite development support only.

## Review-mandated sequencing

The original twelve-task batch is split into evidence-gated slices:

1. **Reliability slice (approved now):** T1, T11, and the narrow responsive/accessibility corrections from T10, plus regression coverage. This directly addresses the stale `ssi.as_of` failure, blank lazy-route states, bare `/app` entry inconsistency, and the observed schemes/learn mobile defects.
2. **Evidence gate:** run and synthesize the existing five-case learner-research protocol. Record one primary learning outcome and the observed friction that justifies the next UI investment.
3. **One intervention slice:** select only the highest-value intervention. Candidate order is case-first Overview/onboarding, contextual search/directory, or hybrid Schemes comparison. T2–T6, T8–T9 are candidates, not an automatic batch.
4. **Tutor pilot:** T7 is last and remains contextual, one-turn, grounded, and explicitly degraded when unavailable. It requires product evidence and usage/quality safeguards before becoming a shell-level affordance.

The remaining task descriptions below are retained as implementation options, but the gates and amendments in this review are authoritative when they conflict with an earlier “always”, “all”, or “adaptive resume” statement.

## File and Responsibility Map

### Backend

- Modify `app/services/schema_compat.py`: generic additive compatibility patches for `payment_events` and `ssi`.
- Modify `tests/test_schema_compat.py`: legacy SSI fixture, data-preservation, defaults, and idempotence.
- Create `app/data/country_names.py`: curated ISO code-to-name mapping for countries present in seeded banks.
- Modify `app/schemas.py`: `BankCountryOption`, `BankDirectoryItem`, and `BankDirectoryResponse` contracts.
- Modify `app/routers/directory.py`: `/api/banks/countries` plus `/api/banks` filtering, normalization, ordering, and pagination.
- Modify `tests/test_api.py`: bank-directory contract and validation coverage.

### Shared frontend infrastructure

- Modify `frontend/src/api/schemas.ts`: bank-directory and tutor-availability Zod schemas.
- Modify `frontend/src/api/queryKeys.ts`: stable bank-directory and tutor keys.
- Modify `frontend/src/test/handlers.ts`: default bank-directory and tutor handlers.
- Create `frontend/src/features/explore/search/useCommandSearch.ts`: shared query, debounce, cancellation, grouping, and status model.
- Create `frontend/src/features/explore/search/CommandSearchResults.tsx`: one result-list implementation for Explore and shell search.
- Modify `frontend/src/features/explore/search/CommandSearch.tsx`: in-page composition over the shared controller.
- Create `frontend/src/app-shell/CommandSearchOverlay.tsx`: desktop dialog/mobile top-sheet wrapper.
- Create `frontend/src/features/tutor/TutorPanel.tsx`: tutor availability, question, answer, and recovery states.
- Create `frontend/src/features/tutor/useTutor.ts`: session-cached availability and chat mutation.
- Modify `frontend/src/app-shell/AppShell.tsx` and `.css`: global triggers, overlay ownership, focus restoration, and responsive modes.
- Create `frontend/src/app-shell/PageLoader.tsx`: named route-level loading state.

### Product surfaces

- Create `frontend/src/features/overview/WalkthroughPage.tsx` and `.css`: three-step illustrative route.
- Create `frontend/src/features/overview/walkthroughStore.ts`: local step/completion persistence.
- Modify `frontend/src/features/overview/selectPrimaryAction.ts` and `OverviewPage.tsx`: walkthrough and deterministic resume ranking.
- Create `frontend/src/features/explore/BankDirectoryResults.tsx`: selectable/paginated bank rows.
- Modify `frontend/src/features/explore/ExplorePage.tsx` and `.css`: new Directory, Schemes, and Glossary compositions.
- Modify `frontend/src/features/explore/SchemeTable.tsx`, `SchemeTabs.tsx`, `SchemeDetails.tsx`, and styles: one URL-selected rail plus optional comparison.
- Modify `frontend/src/features/explore/search/searchIndex.ts`: expanded glossary aliases and canonical scheme links.
- Modify `frontend/src/features/learn/LearnIndexPage.tsx` and `LearnPage.css`: stacked mobile cases.
- Modify `frontend/src/features/operate/prepare/PreparePaymentPage.tsx` and `.css`: explicit validation/catalogue/SWIFT/SSI scope note.
- Modify `frontend/src/app-shell/App.tsx`: walkthrough route and non-null route loaders.
- Add/update focused tests beside every changed frontend feature and add an integrated Playwright story under `frontend/e2e/`.

---

### Task 1: Repair stale SQLite SSI schemas

**Files:**
- Modify: `app/services/schema_compat.py`
- Modify: `tests/test_schema_compat.py`

**Interfaces:**
- Consumes: SQLAlchemy `Engine` passed to `ensure_sqlite_schema(engine)` during app startup.
- Produces: additive `ssi.as_of: VARCHAR(10) NULL`, `ssi.verified_by: VARCHAR(120) NULL`, and `ssi.status: VARCHAR(12) NOT NULL DEFAULT 'illustrative'` columns without changing existing rows.

- [ ] **Step 1: Add a failing legacy-SSI preservation test**

```python
LEGACY_SSI_DDL = """
CREATE TABLE ssi (
    id INTEGER PRIMARY KEY,
    beneficiary_bic VARCHAR(11) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    intermediary_bic VARCHAR(11) NOT NULL,
    notes VARCHAR(500)
)
"""

def test_legacy_ssi_gains_provenance_columns_without_data_loss():
    engine = _raw_engine()
    with engine.begin() as conn:
        conn.execute(text(LEGACY_SSI_DDL))
        conn.execute(text(
            "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, notes) "
            "VALUES ('CITIUS33XXX', 'USD', 'CHASUS33XXX', 'legacy row')"
        ))

    ensure_sqlite_schema(engine)

    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT beneficiary_bic, currency, intermediary_bic, notes, as_of, "
            "verified_by, status FROM ssi"
        )).mappings().one()
    assert row["beneficiary_bic"] == "CITIUS33XXX"
    assert row["notes"] == "legacy row"
    assert row["as_of"] is None
    assert row["verified_by"] is None
    assert row["status"] == "illustrative"
```

- [ ] **Step 2: Run the test and confirm the missing-column failure**

Run: `.venv/bin/pytest tests/test_schema_compat.py::test_legacy_ssi_gains_provenance_columns_without_data_loss -v`

Expected: FAIL with SQLite `no such column: as_of`.

- [ ] **Step 3: Generalize the compatibility table patches**

```python
_TABLE_PATCHES = {
    "payment_events": (
        ("schedule VARCHAR(10) NOT NULL DEFAULT 'instant'", "schedule"),
        ("revealed_at VARCHAR(30)", "revealed_at"),
    ),
    "ssi": (
        ("as_of VARCHAR(10)", "as_of"),
        ("verified_by VARCHAR(120)", "verified_by"),
        ("status VARCHAR(12) NOT NULL DEFAULT 'illustrative'", "status"),
    ),
}

def ensure_sqlite_schema(engine) -> None:
    inspector = inspect(engine)
    for table_name, patches in _TABLE_PATCHES.items():
        if not inspector.has_table(table_name):
            continue
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        with engine.begin() as conn:
            for ddl, name in patches:
                if name in existing:
                    continue
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {ddl}"))
                logger.info("Added %s.%s to legacy SQLite DB", table_name, name)
```

- [ ] **Step 4: Add and run idempotence/current-schema tests**

Add assertions that calling `ensure_sqlite_schema(engine)` twice leaves the same column set and that `Base.metadata.create_all()` databases are unchanged.

Run: `.venv/bin/pytest tests/test_schema_compat.py -v`

Expected: all schema compatibility tests PASS.

- [ ] **Step 5: Commit the compatibility repair**

```bash
git add app/services/schema_compat.py tests/test_schema_compat.py
git commit -m "fix: repair legacy SSI schema compatibility"
```

### Task 2: Add the bounded bank-directory API

**Files:**
- Create: `app/data/country_names.py`
- Modify: `app/schemas.py`
- Modify: `app/routers/directory.py`
- Modify: `tests/test_api.py`

**Interfaces:**
- Consumes: `Bank` rows and query parameters `q: str | None`, `country: str | None`, `limit: int`, `offset: int`.
- Produces: `GET /api/banks/countries` → available countries with counts, and `GET /api/banks` → `BankDirectoryResponse(items, total, limit, offset)` sorted by case-insensitive bank name then BIC.

- [ ] **Step 1: Write failing contract tests**

```python
def test_bank_directory_searches_name_and_returns_pagination(client):
    response = client.get("/api/banks", params={"q": "citibank", "limit": 25, "offset": 0})
    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 25
    assert body["offset"] == 0
    assert body["total"] >= 1
    assert all("citibank" in item["bank_name"].lower() for item in body["items"])
    assert {"bic", "bank_name", "country_code", "country_name", "city"} <= body["items"][0].keys()

def test_bank_directory_requires_query_or_country(client):
    response = client.get("/api/banks")
    assert response.status_code == 422

def test_bank_directory_filters_country_and_orders_deterministically(client):
    body = client.get("/api/banks", params={"country": "NG"}).json()
    keys = [(item["bank_name"].casefold(), item["bic"]) for item in body["items"]]
    assert keys == sorted(keys)
    assert {item["country_code"] for item in body["items"]} == {"NG"}

def test_bank_directory_lists_only_seeded_countries(client):
    body = client.get("/api/banks/countries").json()
    nigeria = next(item for item in body if item["code"] == "NG")
    assert nigeria["name"] == "Nigeria"
    assert nigeria["count"] >= 1
```

- [ ] **Step 2: Run the tests and confirm the route is missing**

Run: `.venv/bin/pytest tests/test_api.py -k bank_directory -v`

Expected: FAIL with `404 Not Found`.

- [ ] **Step 3: Add response schemas and country names**

```python
class BankDirectoryItem(BaseModel):
    bic: str
    bank_name: str
    country_code: str
    country_name: str
    city: Optional[str] = None

class BankDirectoryResponse(BaseModel):
    items: List[BankDirectoryItem]
    total: int
    limit: int
    offset: int

class BankCountryOption(BaseModel):
    code: str
    name: str
    count: int
```

Create `COUNTRY_NAMES: dict[str, str]` in `app/data/country_names.py` for the current curated-directory set:

```python
COUNTRY_NAMES = {
    "AE": "United Arab Emirates", "AT": "Austria", "AU": "Australia",
    "BD": "Bangladesh", "BE": "Belgium", "BH": "Bahrain", "BR": "Brazil",
    "CA": "Canada", "CH": "Switzerland", "CI": "Côte d’Ivoire", "CM": "Cameroon",
    "CN": "China", "DE": "Germany", "DK": "Denmark", "EG": "Egypt",
    "ES": "Spain", "FI": "Finland", "FR": "France", "GB": "United Kingdom",
    "GH": "Ghana", "GR": "Greece", "HK": "Hong Kong", "ID": "Indonesia",
    "IE": "Ireland", "IL": "Israel", "IN": "India", "IT": "Italy",
    "JO": "Jordan", "JP": "Japan", "KE": "Kenya", "KR": "South Korea",
    "KW": "Kuwait", "LK": "Sri Lanka", "MA": "Morocco", "MU": "Mauritius",
    "MX": "Mexico", "MY": "Malaysia", "NG": "Nigeria", "NL": "Netherlands",
    "NO": "Norway", "NZ": "New Zealand", "OM": "Oman", "PH": "Philippines",
    "PK": "Pakistan", "PL": "Poland", "PT": "Portugal", "QA": "Qatar",
    "RW": "Rwanda", "SA": "Saudi Arabia", "SE": "Sweden", "SG": "Singapore",
    "SN": "Senegal", "TH": "Thailand", "TN": "Tunisia", "TR": "Türkiye",
    "TW": "Taiwan", "TZ": "Tanzania", "UG": "Uganda", "US": "United States",
    "VN": "Vietnam", "ZA": "South Africa",
}
```

Unknown codes use the code itself as the defensive fallback.

- [ ] **Step 4: Implement normalized filtering and pagination**

```python
@router.get("/banks", response_model=BankDirectoryResponse)
def banks(
    q: Optional[str] = Query(None, max_length=200),
    country: Optional[str] = Query(None, min_length=2, max_length=2),
    limit: int = Query(25, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    term = (q or "").strip()
    country_code = (country or "").strip().upper()
    if not term and not country_code:
        raise HTTPException(status_code=422, detail="Enter a bank name/BIC or choose a country.")

    query = db.query(Bank)
    if term:
        pattern = f"%{term.upper()}%"
        query = query.filter(
            or_(func.upper(Bank.bank_name).like(pattern), func.upper(Bank.bic).like(pattern))
        )
    if country_code:
        query = query.filter(Bank.country_code == country_code)

    total = query.count()
    rows = query.order_by(func.lower(Bank.bank_name), Bank.bic).offset(offset).limit(limit).all()
    items = [BankDirectoryItem(
        bic=row.bic,
        bank_name=row.bank_name,
        country_code=row.country_code,
        country_name=COUNTRY_NAMES.get(row.country_code, row.country_code),
        city=row.city,
    ) for row in rows]
    return BankDirectoryResponse(items=items, total=total, limit=limit, offset=offset)

@router.get("/banks/countries", response_model=list[BankCountryOption])
def bank_countries(db: Session = Depends(get_db)):
    rows = db.query(Bank.country_code, func.count(Bank.id)).group_by(Bank.country_code).all()
    return [BankCountryOption(code=code, name=COUNTRY_NAMES.get(code, code), count=count)
            for code, count in sorted(rows)]
```

- [ ] **Step 5: Run focused and directory regression tests**

Run: `.venv/bin/pytest tests/test_api.py -k 'bank_directory or lookup or health' -v`

Expected: all selected tests PASS.

- [ ] **Step 6: Commit the directory API**

```bash
git add app/data/country_names.py app/schemas.py app/routers/directory.py tests/test_api.py
git commit -m "feat: add bank directory search API"
```

### Task 3: Add typed bank search and the shared command-search controller

**Files:**
- Modify: `frontend/src/api/schemas.ts`
- Modify: `frontend/src/api/queryKeys.ts`
- Modify: `frontend/src/test/handlers.ts`
- Create: `frontend/src/features/explore/search/useCommandSearch.ts`
- Create: `frontend/src/features/explore/search/useCommandSearch.test.tsx`
- Create: `frontend/src/features/explore/search/CommandSearchResults.tsx`
- Modify: `frontend/src/features/explore/search/CommandSearch.tsx`
- Modify: `frontend/src/features/explore/search/CommandSearch.test.tsx`

**Interfaces:**
- Consumes: `query: string`, optional `country: string`, static `searchStatic()`, and `/api/banks`.
- Produces: `CommandSearchModel { query, setQuery, groups, activeId, status, error, retry, onKeyDown }` shared by page and overlay.

- [ ] **Step 1: Add failing mixed-result and stale-request tests**

```tsx
it("returns Bank of America as a bank group result", async () => {
  server.use(http.get("/api/banks", () => HttpResponse.json({
    items: [{ bic: "BOFAUS3NXXX", bank_name: "Bank of America", country_code: "US", country_name: "United States", city: "New York" }],
    total: 1, limit: 25, offset: 0,
  })));
  const { result } = renderHook(() => useCommandSearch({ initialQuery: "Bank of America" }), { wrapper });
  await waitFor(() => expect(result.current.groups[0]?.type).toBe("bank"));
  expect(result.current.groups[0].results[0].href).toBe("/app/explore/banks/BOFAUS3NXXX");
});

it("does not publish a stale bank response after the query changes", async () => {
  const { result } = renderHook(() => useCommandSearch({ initialQuery: "Access" }), { wrapper });
  act(() => result.current.setQuery("Citibank"));
  await waitFor(() => expect(result.current.query).toBe("Citibank"));
  expect(result.current.groups.flatMap(group => group.results).some(item => item.label === "Access Bank")).toBe(false);
});
```

- [ ] **Step 2: Run the hook test and confirm the module is missing**

Run: `cd frontend && npm test -- src/features/explore/search/useCommandSearch.test.tsx`

Expected: FAIL because `useCommandSearch` is not defined.

- [ ] **Step 3: Add Zod schemas and query keys**

```ts
export const BankDirectoryItemSchema = z.object({
  bic: z.string(), bank_name: z.string(), country_code: z.string().length(2),
  country_name: z.string(), city: z.string().nullish(),
});
export const BankDirectoryResponseSchema = z.object({
  items: z.array(BankDirectoryItemSchema), total: z.number().int().nonnegative(),
  limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
});
export type BankDirectoryResponse = z.infer<typeof BankDirectoryResponseSchema>;
export const BankCountryOptionSchema = z.object({ code: z.string().length(2), name: z.string(), count: z.number().int().nonnegative() });
export const BankCountriesSchema = z.array(BankCountryOptionSchema);
```

Add `apiKeys.banks(q, country, limit, offset)` returning `['banks', q, country, limit, offset] as const`, `apiKeys.bankCountries` returning `['banks', 'countries'] as const`, and MSW defaults containing Bank of America, Access Bank, and country options.

- [ ] **Step 4: Implement the shared controller**

```ts
export function useCommandSearch({ initialQuery = "", country = "" }: CommandSearchOptions) {
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query.trim());
  const eligible = deferredQuery.length >= 2 || country.length === 2;
  const bankQuery = useQuery({
    queryKey: apiKeys.banks(deferredQuery, country, 25, 0),
    enabled: eligible,
    queryFn: ({ signal }) => apiRequest<BankDirectoryResponse>(
      `/api/banks?q=${encodeURIComponent(deferredQuery)}&country=${encodeURIComponent(country)}&limit=25&offset=0`,
      { signal },
      BankDirectoryResponseSchema,
    ),
  });
  const bankResults: SearchResult[] = (bankQuery.data?.items ?? []).map(bank => ({
    id: `bank:${bank.bic}`, type: "bank", label: bank.bank_name,
    subtitle: `${bank.bic} · ${bank.country_name}${bank.city ? ` · ${bank.city}` : ""}`,
    href: `/app/explore/banks/${bank.bic}`,
  }));
  const groups = groupResults([...bankResults, ...searchStatic(query)]);
  const flatResults = groups.flatMap(group => group.results);
  return {
    query, setQuery, groups, flatResults,
    bankStatus: bankQuery.isPending ? "loading" : bankQuery.isError ? "error" : "success",
    bankError: bankQuery.error,
    retryBanks: bankQuery.refetch,
  };
}
```

Export the existing `groupResults(results: SearchResult[]): SearchGroup[]` from `searchTypes.ts`. Keep active-result movement and Escape handling in `CommandSearch`; keep result markup in `CommandSearchResults` so the overlay and page cannot drift.

- [ ] **Step 5: Recompose the in-page search and run focused tests**

Run: `cd frontend && npm test -- src/features/explore/search`

Expected: existing keyboard tests and new bank-result tests PASS.

- [ ] **Step 6: Commit the shared search model**

```bash
git add frontend/src/api frontend/src/test/handlers.ts frontend/src/features/explore/search
git commit -m "feat: unify static and bank search results"
```

### Task 4: Add the shell command-search overlay

**Files:**
- Create: `frontend/src/app-shell/CommandSearchOverlay.tsx`
- Create: `frontend/src/app-shell/CommandSearchOverlay.test.tsx`
- Modify: `frontend/src/app-shell/AppShell.tsx`
- Modify: `frontend/src/app-shell/AppShell.css`
- Modify: `frontend/src/app-shell/AppShell.test.tsx`

**Interfaces:**
- Consumes: shared `useCommandSearch()` and `CommandSearchResults` from Task 3.
- Produces: global Search trigger, `⌘K`/`Ctrl+K`, desktop dialog, mobile top sheet, close-on-navigation, and focus restoration.

- [ ] **Step 1: Write failing shell interaction tests**

```tsx
it("opens global search with Control+K and restores trigger focus on Escape", async () => {
  const user = userEvent.setup();
  renderShell();
  await user.keyboard("{Control>}k{/Control}");
  expect(screen.getByRole("dialog", { name: "Search Relay" })).toBeVisible();
  expect(screen.getByRole("searchbox", { name: "Search Relay" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Search Relay" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Search" })).toHaveFocus();
});
```

- [ ] **Step 2: Run the test and confirm the trigger is absent**

Run: `cd frontend && npm test -- src/app-shell/CommandSearchOverlay.test.tsx src/app-shell/AppShell.test.tsx`

Expected: FAIL because the Search button/dialog does not exist.

- [ ] **Step 3: Implement overlay lifecycle and focus restoration**

```tsx
export function CommandSearchOverlay({ open, onClose, returnFocusRef }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose, returnFocusRef]);
  if (!open) return null;
  return <div className="command-overlay" role="dialog" aria-modal="true" aria-label="Search Relay"><CommandSearch autoFocus onNavigate={onClose} /></div>;
}
```

In `AppShell`, hold `searchOpen`, register `metaKey || ctrlKey` + `k`, and place Search/Tutor/Preferences in `.app-shell__actions`. Add two focus sentinels or a small `useFocusTrap(containerRef, open)` hook that cycles Tab/Shift+Tab between the close button, query field, and result links; the test must assert focus cannot move to the underlying primary navigation.

- [ ] **Step 4: Add responsive CSS with one DOM surface**

```css
.command-overlay { position: fixed; inset: 0; z-index: 400; display: grid; place-items: start center; padding-top: 12vh; background: color-mix(in srgb, var(--color-canvas) 70%, transparent); }
.command-overlay__surface { width: min(680px, calc(100vw - 32px)); max-height: 70vh; overflow: auto; background: var(--color-surface); border: 1px solid var(--color-border-strong); border-radius: var(--radius-region); }
@media (max-width: 767px) {
  .command-overlay { place-items: start stretch; padding: 0 0 calc(var(--mobile-nav-height) + env(safe-area-inset-bottom)); }
  .command-overlay__surface { width: 100%; max-height: calc(100dvh - var(--mobile-nav-height)); border-radius: 0 0 var(--radius-region) var(--radius-region); }
}
```

- [ ] **Step 5: Run shell/search tests and commit**

Run: `cd frontend && npm test -- src/app-shell src/features/explore/search`

Expected: all selected tests PASS.

```bash
git add frontend/src/app-shell frontend/src/features/explore/search
git commit -m "feat: add global command search"
```

### Task 5: Rebuild Bank Directory as curated examples browse and search (gated)

**Files:**
- Create: `frontend/src/features/explore/BankDirectoryResults.tsx`
- Create: `frontend/src/features/explore/BankDirectoryResults.test.tsx`
- Modify: `frontend/src/features/explore/ExplorePage.tsx`
- Modify: `frontend/src/features/explore/ExplorePage.css`
- Modify: `frontend/src/features/explore/ExplorePage.test.tsx`
- Modify: `frontend/src/features/explore/BankDetailRoute.tsx`
- Modify: `frontend/src/features/explore/BankDetailRoute.test.tsx`

**Interfaces:**
- Consumes: `BankDirectoryResponse`, `apiKeys.banks()`, and the existing independent `/api/lookup` and `/api/ssi` detail queries.
- Produces: country/name/BIC filters, 25-row pages, URL-preserved context, selectable rows, and scoped SSI failure.

- [ ] **Step 1: Write failing browse-and-return tests**

```tsx
it("filters banks by country and opens the selected BIC", async () => {
  const user = userEvent.setup();
  renderExploreRoute("/explore/banks");
  await user.selectOptions(screen.getByLabelText("Country"), "NG");
  expect(await screen.findByRole("link", { name: /Access Bank.*ABNGNGLA/i })).toHaveAttribute(
    "href", "/app/explore/banks/ABNGNGLA?country=NG",
  );
});

it("keeps bank identity visible when SSI fails", async () => {
  server.use(http.get("/api/ssi", () => HttpResponse.json({ detail: "unavailable" }, { status: 500 })));
  renderBankDetail("/explore/banks/ABNGNGLA");
  expect(await screen.findByRole("heading", { name: "Access Bank" })).toBeVisible();
  expect(await screen.findByRole("button", { name: "Retry settlement instructions" })).toBeVisible();
});
```

- [ ] **Step 2: Run focused tests and verify current BIC-only behavior fails**

Run: `cd frontend && npm test -- src/features/explore/ExplorePage.test.tsx src/features/explore/BankDetailRoute.test.tsx`

Expected: FAIL because Country and directory-result links do not exist.

- [ ] **Step 3: Implement URL-backed filters and query state**

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const query = searchParams.get("q") ?? "";
const country = searchParams.get("country") ?? "";
const offset = Number(searchParams.get("offset") ?? "0");
const eligible = query.trim().length >= 2 || country.length === 2;
const banks = useQuery({
  queryKey: apiKeys.banks(query.trim(), country, 25, offset),
  enabled: eligible,
  queryFn: ({ signal }) => apiRequest<BankDirectoryResponse>(
    `/api/banks?q=${encodeURIComponent(query.trim())}&country=${encodeURIComponent(country)}&limit=25&offset=${offset}`,
    { signal },
    BankDirectoryResponseSchema,
  ),
});
const countries = useQuery({
  queryKey: apiKeys.bankCountries,
  queryFn: ({ signal }) => apiRequest("/api/banks/countries", { signal }, BankCountriesSchema),
  staleTime: Infinity,
});
```

Country options come from `countries.data`; render the count in each option label and keep the query control usable if the country list fails.

- [ ] **Step 4: Render compact selectable rows and pagination**

```tsx
export function BankDirectoryResults({ response, context }: Props) {
  return <section aria-labelledby="bank-results-heading">
    <h2 id="bank-results-heading">{response.total} banks</h2>
    <ul className="bank-results">
      {response.items.map(bank => <li key={bank.bic}>
        <Link to={`/explore/banks/${bank.bic}?${context.toString()}`} className="bank-result">
          <span className="bank-result__name">{bank.bank_name}</span>
          <span className="bank-result__bic mono">{bank.bic}</span>
          <span className="bank-result__place">{[bank.city, bank.country_name].filter(Boolean).join(", ")}</span>
        </Link>
      </li>)}
    </ul>
  </section>;
}
```

Back links in `BankDetailRoute` must preserve `q`, `country`, and `offset`; lookup failure remains page-level while SSI failure remains inside `SettlementInstructions`.

- [ ] **Step 5: Run directory/detail tests and commit**

Run: `cd frontend && npm test -- src/features/explore/BankDirectoryResults.test.tsx src/features/explore/ExplorePage.test.tsx src/features/explore/BankDetailRoute.test.tsx`

Expected: all selected tests PASS.

```bash
git add frontend/src/features/explore
git commit -m "feat: add browsable bank directory"
```

### Task 6: Add the walkthrough and adaptive Overview action

**Files:**
- Create: `frontend/src/features/overview/walkthroughStore.ts`
- Create: `frontend/src/features/overview/walkthroughStore.test.ts`
- Create: `frontend/src/features/overview/WalkthroughPage.tsx`
- Create: `frontend/src/features/overview/WalkthroughPage.css`
- Create: `frontend/src/features/overview/WalkthroughPage.test.tsx`
- Modify: `frontend/src/features/overview/selectPrimaryAction.ts`
- Modify: `frontend/src/features/overview/OverviewPage.tsx`
- Modify: `frontend/src/features/overview/OverviewPage.css`
- Modify: `frontend/src/features/overview/OverviewPage.test.tsx`
- Modify: `frontend/src/app-shell/App.tsx`

**Interfaces:**
- Consumes: local learner progress/activity, explicit onboarding state, case `updatedAt`, and `PaymentRoute`. Payment drafts are not a resume source until a real persisted draft adapter is added and verified.
- Produces: `/app/walkthrough`, persisted `{ step: 0 | 1 | 2, completed: boolean }`, and deterministic newest-unfinished action selection.

- [ ] **Step 1: Write failing first-visit and ranking tests**

```ts
expect(selectPrimaryAction({ onboardingStatus: "unseen" })).toEqual({
  kind: "explore_intro", href: "/walkthrough", label: "Explore how a payment moves",
});
expect(selectPrimaryAction({
  unfinishedLearnAt: 100, unfinishedCaseAt: 200,
  unfinishedCaseHref: "/learn/cases/case-us-supplier",
})).toMatchObject({ kind: "resume_operate", href: "/operate" });
```

```tsx
it("persists step progress and completes the walkthrough", async () => {
  const user = userEvent.setup();
  renderWalkthrough();
  await user.click(screen.getByRole("button", { name: "Trace the institutions" }));
  expect(screen.getByText("2 of 3")).toBeVisible();
  expect(loadWalkthroughState()).toEqual({ step: 1, completed: false });
});
```

- [ ] **Step 2: Run focused tests and confirm the route/store are missing**

Run: `cd frontend && npm test -- src/features/overview`

Expected: FAIL on `/walkthrough` expectation and missing walkthrough modules.

- [ ] **Step 3: Add bounded local persistence**

```ts
const KEY = "relay:walkthrough";
export interface WalkthroughState { step: 0 | 1 | 2; completed: boolean; }
export function loadWalkthroughState(): WalkthroughState {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<WalkthroughState> | null;
    const step = parsed?.step === 1 || parsed?.step === 2 ? parsed.step : 0;
    return { step, completed: parsed?.completed === true };
  } catch { return { step: 0, completed: false }; }
}
export function saveWalkthroughState(state: WalkthroughState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
```

- [ ] **Step 4: Implement the three-step route using `PaymentRoute`**

```tsx
const STEPS = [
  { title: "Prepare the instruction", action: "Trace the institutions" },
  { title: "Trace the institutions", action: "Understand settlement" },
  { title: "Understand settlement", action: "Finish walkthrough" },
] as const;

export function WalkthroughPage() {
  const [state, setState] = useState(loadWalkthroughState);
  const advance = () => {
    const next = state.step === 2 ? { step: 2 as const, completed: true } : { step: (state.step + 1) as 1 | 2, completed: false };
    saveWalkthroughState(next); setState(next);
  };
  return <article className="walkthrough">
    <p className="walkthrough__progress">{state.step + 1} of 3</p>
    <h1 tabIndex={-1}>{STEPS[state.step].title}</h1>
    <PaymentRoute nodes={WALKTHROUGH_NODES} currency="USD" amount="5,000" activeNodeId={WALKTHROUGH_NODES[state.step].id} />
    <Button onClick={advance}>{STEPS[state.step].action}</Button>
  </article>;
}
```

The completion state replaces the button with links to `/learn/lab-4` and `/explore/schemes?market=USD&rail=FEDWIRE`.

- [ ] **Step 5: Recompose Overview around one dominant action**

Extend `OverviewContext` and select the newest candidate before the next-module fallback:

```ts
export interface OverviewContext {
  onboardingStatus?: "unseen" | "in_progress" | "completed" | "skipped";
  unfinishedLearnAt?: number;
  unfinishedCaseAt?: number;
  unfinishedCaseHref?: string;
  curriculumComplete?: boolean;
  nextModuleId?: string;
}

const candidates = [
  ctx.unfinishedLearnAt === undefined ? null : { at: ctx.unfinishedLearnAt, action: { kind: "resume_learn" as const, href: "/learn", label: "Continue learning" } },
  ctx.unfinishedCaseAt === undefined || !ctx.unfinishedCaseHref ? null : { at: ctx.unfinishedCaseAt, action: { kind: "resume_learn" as const, href: ctx.unfinishedCaseHref, label: "Resume customer case" } },
].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
const newest = candidates.sort((left, right) => right.at - left.at)[0];
if (newest) return newest.action;
```

Derive case timestamps from incomplete `learningState.state.cases` sessions and use the latest module activity for Learn. Do not infer onboarding from zero module completion. Hide recent activity when empty; replace the four equal utility cards with a plain secondary-action list. The first-visit hero includes `START HERE`, `PaymentRoute`, and the `/walkthrough` action. If an operate draft later becomes a real persisted source, add it through a `ResumeCandidate` adapter with corrupt, stale, completed, and missing-destination tests before reintroducing it to ranking.

- [ ] **Step 6: Add the route, run tests, and commit**

Run: `cd frontend && npm test -- src/features/overview src/app-shell/App.test.tsx`

Expected: all selected tests PASS.

```bash
git add frontend/src/features/overview frontend/src/app-shell/App.tsx
git commit -m "feat: add payment walkthrough and adaptive overview"
```

### Task 7: Add the shared tutor launcher and panel

**Files:**
- Modify: `frontend/src/api/schemas.ts`
- Modify: `frontend/src/api/queryKeys.ts`
- Modify: `frontend/src/test/handlers.ts`
- Create: `frontend/src/features/tutor/useTutor.ts`
- Create: `frontend/src/features/tutor/useTutor.test.tsx`
- Create: `frontend/src/features/tutor/TutorPanel.tsx`
- Create: `frontend/src/features/tutor/TutorPanel.css`
- Create: `frontend/src/features/tutor/TutorPanel.test.tsx`
- Modify: `frontend/src/app-shell/AppShell.tsx`
- Modify: `frontend/src/app-shell/AppShell.css`
- Modify: `frontend/src/app-shell/AppShell.test.tsx`

**Interfaces:**
- Consumes: `GET /api/tutor/availability`, `POST /api/tutor/chat`, existing `TutorRequestSchema`, `TutorResponseSchema`, and current route context.
- Produces: contextual Ask tutor triggers only where the page has a meaningful context; session-cached availability; answer, unavailable, retry, rate-limit, grounded/citation, and error states. A shell-wide trigger is a later pilot decision, not part of this batch.

- [ ] **Step 1: Write failing availability and recovery tests**

```tsx
it("keeps the tutor trigger visible when unavailable", async () => {
  server.use(http.get("/api/tutor/availability", () => HttpResponse.json({ available: false })));
  renderShell();
  await userEvent.click(screen.getByRole("button", { name: "Ask tutor" }));
  expect(await screen.findByRole("heading", { name: "Tutor unavailable" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Check again" })).toBeVisible();
});

it("renders a grounded answer and return action", async () => {
  renderTutorPanel();
  await userEvent.type(screen.getByLabelText("Question"), "What is Fedwire?");
  await userEvent.click(screen.getByRole("button", { name: "Ask tutor" }));
  expect(await screen.findByText(/real-time gross settlement/i)).toBeVisible();
  expect(screen.getByRole("link", { name: "Continue Payment Schemes" })).toBeVisible();
});
```

- [ ] **Step 2: Run tests and confirm the panel is missing**

Run: `cd frontend && npm test -- src/features/tutor src/app-shell/AppShell.test.tsx`

Expected: FAIL because tutor components do not exist.

- [ ] **Step 3: Add the availability schema and session-cached query**

```ts
export const TutorAvailabilitySchema = z.object({ available: z.boolean() });
export type TutorAvailability = z.infer<typeof TutorAvailabilitySchema>;

export function useTutor(context: TutorContext) {
  const availability = useQuery({
    queryKey: apiKeys.tutorAvailability,
    queryFn: () => apiRequest("/api/tutor/availability", undefined, TutorAvailabilitySchema),
    staleTime: Infinity,
  });
  const chat = useMutation({
    mutationFn: (message: string) => apiPost("/api/tutor/chat", TutorRequestSchema.parse({ message, context, history: [] }), TutorResponseSchema),
  });
  return { availability, chat };
}
```

- [ ] **Step 4: Implement distinct panel states and focus behavior**

```tsx
export function TutorPanel({ open, onClose, context, returnFocusRef }: TutorPanelProps) {
  const { availability, chat } = useTutor(context);
  const [question, setQuestion] = useState("");
  const compact = useMediaQuery("(max-width: 1023px)");
  useEffect(() => {
    if (!open) return;
    return () => returnFocusRef.current?.focus();
  }, [open, returnFocusRef]);
  if (!open) return null;
  const problem = chat.error as ApiProblem | null;
  const returnHref = context.surface === "scheme" ? "/explore/schemes" : context.surface === "lesson" ? "/learn" : "/explore";
  return <aside className="tutor-panel" aria-label="Relay tutor" aria-modal={compact ? true : undefined} role={compact ? "dialog" : "complementary"}>
    <button type="button" onClick={onClose} aria-label="Close tutor">Close</button>
    {availability.isPending && <div role="status">Checking tutor availability…</div>}
    {availability.data?.available === false && <section>
      <h2>Tutor unavailable</h2>
      <p>This is a Relay availability issue, not a problem with your question.</p>
      <Button onClick={() => availability.refetch()}>Check again</Button>
      <Link to="/explore/glossary">Search the glossary</Link>
    </section>}
    {availability.data?.available && <form onSubmit={event => { event.preventDefault(); if (question.trim()) chat.mutate(question.trim()); }}>
      <label htmlFor="tutor-question">Question</label>
      <textarea id="tutor-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={2000} />
      <Button type="submit" isLoading={chat.isPending}>Ask tutor</Button>
    </form>}
    {chat.data && <section aria-live="polite">
      <h2>Tutor answer</h2><p>{chat.data.answer}</p>
      {chat.data.citations?.length ? <ul aria-label="Tutor sources">{chat.data.citations.map(source => <li key={source.source_id}><a href={source.url ?? undefined}>{source.title}</a><span>{source.evidence}</span></li>)}</ul> : null}
      <p>{chat.data.grounded ? "Grounded in Relay reference material." : "Reference grounding was not available for this answer."}</p>
      <p>Educational guidance — verify current operator rules.</p>
      <Link to={returnHref}>Continue this page</Link>
    </section>}
    {problem && <section role="alert">
      <h2>{problem.status === 429 ? "Tutor limit reached" : "Tutor answer unavailable"}</h2>
      <p>{problem.status === 429 ? "Continue this page and try again later." : "Your question is still here. Try the answer again."}</p>
      {problem.status !== 429 && <Button onClick={() => chat.mutate(question.trim())}>Retry answer</Button>}
    </section>}
  </aside>;
}
```

Add `useMediaQuery(query: string): boolean` beside the panel using `window.matchMedia`, with a test-safe initial value and change listener. Mobile (`max-width: 1023px`) is focus-trapped; desktop is a non-modal side panel. Closing restores `returnFocusRef`.

- [ ] **Step 5: Run tutor/shell tests and commit**

Run: `cd frontend && npm test -- src/features/tutor src/app-shell/AppShell.test.tsx src/api/schemas.test.ts`

Expected: all selected tests PASS.

```bash
git add frontend/src/api frontend/src/test/handlers.ts frontend/src/features/tutor frontend/src/app-shell
git commit -m "feat: add contextual tutor panel"
```

### Task 8: Recompose Payment Schemes around a hybrid comparison and selected rail (gated)

**Files:**
- Modify: `frontend/src/features/explore/ExplorePage.tsx`
- Modify: `frontend/src/features/explore/SchemeTabs.tsx`
- Modify: `frontend/src/features/explore/SchemeTable.tsx`
- Modify: `frontend/src/features/explore/SchemeDetails.tsx`
- Modify: `frontend/src/features/explore/SchemeDetails.css`
- Modify: `frontend/src/features/explore/ExplorePage.test.tsx`
- Create: `frontend/src/features/explore/SchemeRailSelector.tsx`
- Create: `frontend/src/features/explore/SchemeRailSelector.test.tsx`

**Interfaces:**
- Consumes: current schemes APIs and `?market={tab.label}&rail={scheme.name}`.
- Produces: one selected detail, browser-history restoration, compact comparison, and labelled mobile records.

- [ ] **Step 1: Add failing URL-state and single-detail tests**

```tsx
it("selects the URL rail and renders only its article", async () => {
  renderExploreRoute("/explore/schemes?market=USD&rail=FEDWIRE");
  expect(await screen.findByRole("heading", { name: "FEDWIRE" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "FEDACH" })).not.toBeInTheDocument();
});

it("updates market and rail together", async () => {
  const user = userEvent.setup();
  renderExploreRoute("/explore/schemes?market=USD&rail=FEDWIRE");
  await user.click(screen.getByRole("tab", { name: "CAD" }));
  await waitFor(() => expect(routerLocation().search).toContain("market=CAD"));
  expect(screen.getByRole("heading", { name: "Interac" })).toBeVisible();
  expect(routerLocation().search).toContain("rail=Interac");
});
```

- [ ] **Step 2: Run tests and confirm all-details rendering fails**

Run: `cd frontend && npm test -- src/features/explore/ExplorePage.test.tsx src/features/explore/SchemeRailSelector.test.tsx`

Expected: FAIL because rail query state and selector do not exist.

- [ ] **Step 3: Implement canonical URL selection**

```tsx
const [params, setParams] = useSearchParams();
const requestedMarket = params.get("market")?.toUpperCase();
const activeTab = SCHEME_TAB_ORDER.find(tab => tab.label === requestedMarket) ?? SCHEME_TAB_ORDER[0];
const schemes = international ? [international] : domesticSchemes;
const requestedRail = params.get("rail");
const selected = schemes.find(scheme => scheme.name.toUpperCase() === requestedRail?.toUpperCase()) ?? schemes[0];
const selectRail = (name: string) => setParams({ market: activeTab.label, rail: name }, { replace: false });
```

When data proves either query parameter invalid, replace the URL with the valid market/first rail rather than pushing a second history entry.

- [ ] **Step 4: Render one rail and an optional comparison disclosure**

```tsx
<SchemeRailSelector schemes={schemes} selectedName={selected.name} onSelect={selectRail} />
<SchemeDetails scheme={selected} />
<details className="scheme-comparison">
      <summary>Compare rails</summary>
  <SchemeTable schemes={schemes} />
</details>
```

Render the compact comparison before the selected detail so novices can compare speed, cost, limits, and use case without holding one rail in memory. Change roadmap and sources in `SchemeDetails` to native `<details>` blocks. Replace mobile table row layout with labelled records and a short caption; do not allow the caption to collapse word-by-word.

- [ ] **Step 5: Run scheme tests and commit**

Run: `cd frontend && npm test -- src/features/explore`

Expected: all Explore/scheme tests PASS.

```bash
git add frontend/src/features/explore
git commit -m "feat: simplify payment scheme exploration"
```

### Task 9: Expand the glossary and canonical search links (gated by learner evidence)

**Files:**
- Modify: `frontend/src/features/explore/search/searchIndex.ts`
- Modify: `frontend/src/features/explore/search/searchTypes.ts`
- Modify: `frontend/src/features/explore/search/CommandSearch.test.tsx`
- Modify: `frontend/src/features/explore/ExplorePage.tsx`
- Modify: `frontend/src/features/explore/ExplorePage.test.tsx`

**Interfaces:**
- Consumes: one canonical glossary data structure with aliases.
- Produces: term/definition/alias matching in both Glossary and command search, including `Interac` → `Interac e-Transfer`.

- [ ] **Step 1: Write failing alias and zero-result recovery tests**

```ts
it("matches Interac through the canonical term alias", () => {
  const results = searchStatic("Interac");
  expect(results).toContainEqual(expect.objectContaining({
    type: "glossary", label: "Interac e-Transfer",
    href: "/app/explore/glossary?term=Interac%20e-Transfer",
  }));
});
```

```tsx
it("clears a zero-result glossary filter", async () => {
  renderExploreRoute("/explore/glossary");
  await userEvent.type(screen.getByRole("searchbox", { name: "Filter glossary terms" }), "not-a-term");
  await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
  expect(screen.getByText("Interac e-Transfer")).toBeVisible();
});
```

- [ ] **Step 2: Run tests and confirm Interac is absent**

Run: `cd frontend && npm test -- src/features/explore/search src/features/explore/ExplorePage.test.tsx`

Expected: FAIL because aliases and the clear action are not implemented.

- [ ] **Step 3: Replace tuple data with canonical glossary records**

```ts
export interface GlossaryTerm {
  term: string;
  definition: string;
  aliases: readonly string[];
  group: "identifiers" | "correspondent-banking" | "tracking-messaging" | "payment-rails";
  source?: string;
  jurisdiction?: string;
  verifiedAsOf?: string;
}

export const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  { term: "Interac e-Transfer", definition: "Canadian near-real-time account-to-account payment service using email or mobile addressing", aliases: ["Interac"], group: "payment-rails", source: "Relay educational reference", jurisdiction: "CA", verifiedAsOf: "2026-08" },
  { term: "Auto-Deposit", definition: "Interac feature that deposits an incoming transfer without a security question", aliases: ["Autodeposit"], group: "payment-rails" },
  { term: "Request Money", definition: "Interac request that asks another user to initiate an e-Transfer", aliases: [], group: "payment-rails" },
  { term: "NIBSS Instant Pay", definition: "Nigeria's real-time interbank account transfer rail", aliases: ["NIP"], group: "payment-rails" },
  { term: "NUBAN", definition: "Nigeria Uniform Bank Account Number, a ten-digit domestic account identifier", aliases: [], group: "identifiers" },
  { term: "KEPSS", definition: "Kenya Electronic Payment and Settlement System for high-value real-time settlement", aliases: [], group: "payment-rails" },
  { term: "PesaLink", definition: "Kenyan interbank account-to-account retail payment service", aliases: [], group: "payment-rails" },
  { term: "FedNow", definition: "Federal Reserve instant payment service for US depository institutions", aliases: [], group: "payment-rails" },
  { term: "Faster Payments", definition: "UK near-real-time retail account-to-account payment scheme", aliases: ["FPS"], group: "payment-rails" },
  { term: "BACS", definition: "UK batch system for Direct Credit and Direct Debit payments", aliases: [], group: "payment-rails" },
];
```

Retain all existing terms in the same structure and inventory them in the migration test; `searchStatic` scores term, aliases, then definition. Live-operator terms must carry source, jurisdiction, and verification metadata (or be explicitly labelled as stable concepts). `GlossaryPage` groups by `group` and highlights the canonical query term.

- [ ] **Step 4: Add zero-result recovery, run tests, and commit**

Run: `cd frontend && npm test -- src/features/explore/search src/features/explore/ExplorePage.test.tsx`

Expected: all selected tests PASS.

```bash
git add frontend/src/features/explore
git commit -m "feat: expand searchable payment glossary"
```

### Task 10: Repair Learn mobile browsing and Prepare scope communication

**Files:**
- Modify: `frontend/src/features/learn/LearnIndexPage.tsx`
- Modify: `frontend/src/features/learn/LearnPage.css`
- Create: `frontend/src/features/learn/LearnIndexPage.test.tsx`
- Modify: `frontend/src/features/operate/prepare/PreparePaymentPage.tsx`
- Modify: `frontend/src/features/operate/prepare/PreparePaymentPage.css`
- Modify: `frontend/src/features/operate/prepare/PreparePaymentPage.test.tsx`

**Interfaces:**
- Consumes: existing case catalogue and existing broad ISO currency list.
- Produces: document-order mobile case list and an explicit four-part support boundary for Prepare Payment.

- [ ] **Step 1: Add failing semantic and copy tests**

```tsx
it("renders every case in one document-order list", () => {
  render(<LearnIndexPage />);
  const list = screen.getByRole("list", { name: "Customer cases" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(CASE_CATALOG.length);
});
```

```tsx
it("separates accepted currency input from rail and SSI coverage", () => {
  renderPreparePayment();
  const note = screen.getByRole("note", { name: "Payment coverage" });
  expect(note).toHaveTextContent("Currency entry validation");
  expect(note).toHaveTextContent("Domestic rail catalogue");
  expect(note).toHaveTextContent("International / SWIFT");
  expect(note).toHaveTextContent("bank-published settlement instructions");
});
```

- [ ] **Step 2: Run tests and confirm list/note are absent**

Run: `cd frontend && npm test -- src/features/learn/LearnIndexPage.test.tsx src/features/operate/prepare/PreparePaymentPage.test.tsx`

Expected: FAIL on missing labelled list and Payment coverage note.

- [ ] **Step 3: Use one semantic list and stack it below 768px**

```css
.learn-cases { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(320px, 1fr); gap: var(--space-4); overflow-x: auto; }
@media (max-width: 767px) {
  .learn-cases { grid-auto-flow: row; grid-auto-columns: auto; grid-template-columns: 1fr; overflow: visible; }
}
```

If desktop keeps the horizontal track, retain visible previous/next buttons, item count, keyboard scrolling, and focus-visible styles. Do not duplicate case markup for mobile.

- [ ] **Step 4: Add the Prepare scope note without narrowing accepted currencies**

```tsx
<aside className="prepare-payment__coverage" role="note" aria-label="Payment coverage">
  <h2>What this simulation covers</h2>
  <ul>
    <li><strong>Currency entry validation:</strong> accepts supported ISO currency codes.</li>
    <li><strong>Domestic rail catalogue:</strong> available only for markets listed in Payment Schemes.</li>
    <li><strong>International / SWIFT:</strong> provides educational routing guidance, not payment execution.</li>
    <li><strong>Bank-published settlement instructions:</strong> appear only when illustrative SSI records exist for the selected bank and currency.</li>
  </ul>
</aside>
```

- [ ] **Step 5: Run tests, build, and commit**

Run: `cd frontend && npm test -- src/features/learn/LearnIndexPage.test.tsx src/features/operate/prepare/PreparePaymentPage.test.tsx && npm run build`

Expected: tests PASS and TypeScript/Vite build succeeds.

```bash
git add frontend/src/features/learn frontend/src/features/operate/prepare
git commit -m "fix: clarify responsive learning and payment coverage"
```

### Task 11: Standardize route loading and direct app entry

**Files:**
- Create: `frontend/src/app-shell/PageLoader.tsx`
- Create: `frontend/src/app-shell/PageLoader.test.tsx`
- Modify: `frontend/src/app-shell/App.tsx`
- Modify: `frontend/src/app-shell/App.test.tsx`
- Create: `frontend/appBaseRedirect.ts`
- Create: `frontend/appBaseRedirect.test.ts`
- Modify: `frontend/vite.config.ts`

**Interfaces:**
- Consumes: route destination labels, Vite's dev server middleware, and the existing FastAPI SPA fallback.
- Produces: non-null named Suspense fallbacks and a development-only `/app` → `/app/` redirect matching production behavior.

- [ ] **Step 1: Add failing loader and direct-entry tests**

```tsx
it("renders a named route loader while Explore is suspended", () => {
  renderAppAt("/app/explore");
  expect(screen.getByRole("status", { name: "Loading Explore" })).toBeVisible();
});
```

```ts
it("redirects only the bare app path", () => {
  expect(appBaseRedirectTarget("/app")).toBe("/app/");
  expect(appBaseRedirectTarget("/app/")).toBeNull();
  expect(appBaseRedirectTarget("/app/explore")).toBeNull();
});
```

- [ ] **Step 2: Run tests and confirm null fallback/trailing-slash failures**

Run: `cd frontend && npm test -- src/app-shell/App.test.tsx src/app-shell/PageLoader.test.tsx`

Expected: frontend tests FAIL because the named loader and redirect helper do not exist.

- [ ] **Step 3: Implement one reusable route loader**

```tsx
export function PageLoader({ destination }: { destination: string }) {
  return <div className="page-loader" role="status" aria-label={`Loading ${destination}`}>
    <span className="page-loader__bar" aria-hidden="true" />
    <span>Loading {destination}…</span>
  </div>;
}
```

Wrap each lazy route with `<Suspense fallback={<PageLoader destination="Explore" />}>`; use the actual destination name for Learn, Bank Directory, Payment Schemes, Glossary, Operate, Tracking, and Settings.

- [ ] **Step 4: Normalize the Vite development entry path**

```ts
export function appBaseRedirectTarget(pathname: string): string | null {
  return pathname === "/app" ? "/app/" : null;
}

function appBaseRedirectPlugin() {
  return {
    name: "relay-app-base-redirect",
    configureServer(server: { middlewares: { use: (handler: (req: { url?: string }, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: () => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const target = appBaseRedirectTarget((req.url ?? "").split("?")[0]);
        if (!target) return next();
        res.statusCode = 307;
        res.setHeader("Location", target);
        res.end();
      });
    },
  };
}
```

Place the exported helper/plugin in `frontend/appBaseRedirect.ts`, import it into `vite.config.ts`, and register it before `react()`. Keep the existing FastAPI `/app` and `/app/{rest:path}` handlers unchanged; they already serve one production SPA shell.

- [ ] **Step 5: Run tests and commit**

Run: `cd frontend && npm test -- src/app-shell && npm run build`

Expected: all frontend tests PASS and the frontend builds.

```bash
git add frontend/src/app-shell frontend/appBaseRedirect.ts frontend/appBaseRedirect.test.ts frontend/vite.config.ts
git commit -m "fix: make route loading and app entry consistent"
```

### Task 12: Run integrated regression and browser verification

**Files:**
- Create: `frontend/e2e/unified-ui-pass.spec.ts`
- Defect corrections discovered by this task must be committed separately in the owning Task 1–11 files before the E2E commit.

**Interfaces:**
- Consumes: complete feature branch and local FastAPI/Vite application.
- Produces: one end-to-end story proving search, Directory, Schemes, tutor degradation, walkthrough, responsive layouts, and API health together.

- [ ] **Step 1: Add the integrated Playwright story**

```ts
test("Relay discovery journey remains coherent", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("link", { name: "Explore how a payment moves" }).click();
  await expect(page.getByText("1 of 3")).toBeVisible();

  await page.keyboard.press("Control+K");
  await page.getByRole("searchbox", { name: "Search Relay" }).fill("Bank of America");
  await page.getByRole("option", { name: /Bank of America/ }).click();
  await expect(page.getByRole("heading", { name: "Bank of America" })).toBeVisible();

  await page.goto("/app/explore/schemes?market=USD&rail=FEDWIRE");
  await expect(page.getByRole("heading", { name: "FEDWIRE" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "FEDACH" })).toHaveCount(0);
});
```

- [ ] **Step 2: Run focused backend health checks**

Run: `.venv/bin/pytest tests/test_schema_compat.py tests/test_api.py tests/test_ssi.py tests/test_tutor_api.py -q`

Expected: all selected backend tests PASS.

- [ ] **Step 3: Run the full automated suites**

Run: `.venv/bin/pytest -q`

Expected: full backend suite PASS.

Run: `cd frontend && npm test && npm run build && npm run check:bundle`

Expected: full frontend suite PASS, build succeeds, bundle budget passes.

- [ ] **Step 4: Run Playwright and accessibility checks**

Run: `cd frontend && npm run test:e2e -- unified-ui-pass.spec.ts`

Expected: integrated journey PASS with no new serious Axe findings. The existing SSI-table `scrollable-region-focusable` violation is a documented baseline in README and must be fixed by the reliability slice or explicitly reported as the only remaining baseline; it must not be silently reclassified as a pass.

- [ ] **Step 5: Manually verify the acceptance matrix**

At 390×844, 768px wide, 1024px wide, and 1440×900 verify:

- Search opens as mobile top sheet below 768px and dialog at/above 768px.
- Tutor opens as top sheet below 1024px and side panel at/above 1024px.
- No page-level horizontal overflow; market tabs are the only intentional mobile horizontal scroller.
- Bank results are labelled records, SSI failure leaves bank identity visible, and retry works.
- Scheme URL back/forward restores market and rail.
- Learn cases stack below 768px.
- Reduced motion removes overlay/route movement without hiding state changes.
- Keyboard focus never escapes a modal surface and returns to its trigger on close.
- `/app`, `/app/`, and representative deep links refresh successfully.
- The research gate is recorded before any gated T2–T9 surface is enabled; its primary outcome and chosen intervention are linked from the implementation commit.

- [ ] **Step 6: Commit the integrated verification**

```bash
git add frontend/e2e/unified-ui-pass.spec.ts
git commit -m "test: verify unified Relay discovery journey"
```

## Plan Self-Review

- Spec coverage: all Goals, NOT-in-scope constraints, nine resolved decisions, responsive requirements, and eleven review tasks map to Tasks 1–12.
- Placeholder scan: every code-changing step names concrete behavior, files, commands, and expected outcomes.
- Type consistency: `/api/banks`, `BankDirectoryResponse`, `apiKeys.banks`, and `SearchResult` names are consistent across backend, schemas, hooks, UI, and tests.
- Dependency order: SSI/API foundations precede consumers; shared search precedes shell and Directory; shell foundations precede tutor; integrated QA runs last.
- Commit boundaries: every task leaves a focused, independently testable commit and preserves unrelated worktree changes.

## Autoplan Review — Phase 0 Intake

| Input | Result |
|---|---|
| Repository mode | GitHub-style repository; `codex/ui-changes` is three commits ahead of `origin/main`. |
| Plan | This file; restore point captured before review at `~/.gstack/projects/Leatherback/codex-ui-changes-autoplan-restore-20260816-232331.md`. |
| Design input | `docs/superpowers/specs/2026-08-16-relay-unified-ui-pass-design.md`. |
| Product signals | README and ROADMAP identify the five-case learner research as the next product-learning step. |
| UI scope | Detected: Overview, shell, Directory, Schemes, Glossary, Learn, Prepare, responsive behavior, focus and loading states. |
| DX scope | Detected: new API endpoint, local schema compatibility, tutor configuration, tests, README/API documentation. |
| Existing guidance | No `AGENTS.md` or `TODOS.md` found. Unrelated untracked Sentry plan and `tmp/` were preserved. |
| Outside voice | Claude unavailable: OAuth session expired. One independent Codex challenge completed for the CEO pass; later passes are explicitly single-model where no second voice is available. |

## Autoplan Review — Phase 1: CEO / Product Review

### 1. Premise challenge

The plan assumes the best next move is to assemble a universal learning workspace: walkthrough, adaptive home, global search, curated directory, glossary expansion, scheme comparison, tutor, and responsive cleanup. The repository’s own strategy says the next product-learning step is the five-case learner research (`ROADMAP.md:118-125`), while the current product already has a 16-entry curriculum, practice loop, five Case Desk scenarios, and provider-neutral instrumentation (`README.md:13-29`).

The plan is therefore **not approved as one implementation batch**. It is approved as a staged reliability slice plus research-gated candidates. The wedge for future work is: **a payment-operations learner learns to make and defend a rail decision in a Case Desk scenario**. Search, glossary, schemes, and tutor are supporting tools, not four equal products competing for the shell.

### 2. Existing code leverage

- Reuse `schema_compat.py` and the existing startup hook for the additive SSI repair; no new migration system is needed.
- Reuse `CaseSession.updatedAt`, `learningState`, `AsyncRegion`, `PageLoader`, `SchemeTabs`, `PaymentRoute`, existing Zod/React Query conventions, and the current MSW handlers.
- Do not invent a `PrepareDraft.updatedAt` source: `PrepareDraft` exists in storage types, but `PreparePaymentPage` does not currently persist drafts. The review removes it from resume ranking until a real adapter exists.
- Reuse existing tutor server contracts and its `grounded`/citation response rather than presenting an uncited generic chat surface.
- Keep the existing curated `Bank` seed and its explicit starter-set warning; add metadata and honest labels if Directory browsing is later enabled.

### 3. Dream state and delta

Dream state: a learner opens Relay, understands the payment journey, resumes the exact unfinished Case Desk activity, searches a term or bank without ambiguity, compares rails without losing the comparison context, receives grounded help only when it is actually available, and can recover from every local/API failure without losing their place.

Current delta: the plan improves the shell and several surfaces, but originally overreached on universal navigation and AI while leaving the primary learning outcome unmeasured. The amended plan closes the reliability delta first, makes onboarding explicit, keeps comparison visible, labels bank coverage honestly, and defers expansion until learner evidence selects one intervention.

### 4. Alternatives considered

| Alternative | Decision | Why |
|---|---|---|
| Ship all twelve tasks now | Rejected | High regression and content-maintenance risk; validates implementation, not learning improvement. |
| Research only, no code | Rejected | SSI compatibility, blank route loading, mobile overflow, and accessibility defects are concrete user-facing issues worth fixing now. |
| Reliability slice → research → one intervention | Accepted | Preserves momentum while keeping product decisions evidence-led. |
| Case-first shell with contextual reference tools | Accepted as north star | Aligns with existing Case Desk/curriculum rather than making Directory/tutor the product center. |

### 5. System audit

```text
Learner
  │
  ├── AppShell ── route loader ── lazy page ── existing learning/tool state
  │       ├── contextual search (gated) ── static index + bounded curated Bank API
  │       └── contextual tutor (last pilot) ── availability ── grounded chat/citations
  │
  ├── Case Desk / curriculum ── local versioned learner state ── Overview resume
  ├── Schemes ── market/rail URL state ── compact comparison + selected detail
  └── Directory (gated) ── local illustrative Bank rows ── SSI lookup/detail

Research protocol + existing telemetry
  └── release gate ── chooses one future intervention and its success metric

SQLite compatibility ── additive local repair only ── SSI reads remain safe
```

The main architectural risk is AppShell becoming the owner of unrelated global state. The amendment keeps route loading global, makes search/tutor contextual, and uses research to decide whether a global command surface is justified.

### 6. Error and rescue registry

| Code path | Failure | Required rescue | User sees |
|---|---|---|---|
| `ensure_sqlite_schema` | missing SSI columns | additive `ALTER TABLE`; log table/column; idempotent rerun | app starts with legacy rows intact |
| `ensure_sqlite_schema` | locked/read-only DB | preserve startup error/degraded health; do not swallow | actionable local schema message |
| `/api/banks` (gated) | invalid/oversized query | Pydantic/FastAPI 422; bounded limit/offset | query guidance, no 500 |
| `/api/banks` (gated) | DB timeout/error | typed 503 and structured log | directory unavailable; retry/keep BIC lookup |
| Search bank merge (gated) | timeout/429/malformed JSON | abort stale request; retain static results; typed error status | “Bank search unavailable; browse static Relay content” |
| Walkthrough storage | corrupt/quota/private mode | reset to safe `unseen`; catch read and write separately | progress can continue in session; no crash |
| Tutor availability | disabled/unconfigured/timeout | distinguish unavailable from question error; refetch action | contextual fallback to current page/glossary |
| Tutor response | empty/malformed/ungrounded/refusal | schema-validate; show no fabricated answer; expose citation/grounding state | “Tutor could not answer safely; continue/reference” |
| Tutor chat | 429 | no automatic retry; preserve question | rate-limit message and continue action |
| Scheme URL state | invalid market/rail/API error | canonicalize once with replace; show API error/last valid context | selected valid rail or retry |
| Lazy route | chunk rejection | named loader plus error boundary/reload action | destination-specific recovery |

### 7. Failure modes registry

| Failure mode | Severity | Plan response |
|---|---:|---|
| Walkthrough repeats because zero modules is mistaken for first visit | High | explicit versioned `onboardingStatus`; test completed walkthrough with zero modules |
| “Resume payment preparation” links to a state that was never persisted | High | remove candidate until a real draft adapter and corruption tests exist |
| Curated starter bank list looks authoritative after adding filters/pagination | High | rename to “Curated bank examples”; include coverage, source, freshness, and status metadata |
| Search promises corridors/country names but only searches static terms and bank name/BIC | High | narrow copy or implement canonical country-name normalization plus a real corridor index; do not promise both accidentally |
| Always-visible tutor signals a feature that is disabled by default | High | contextual trigger; show grounded/citations; pilot later with quality/usage gates |
| Schemes progressive disclosure hides the comparison job | High | compact comparison remains visible; detail is the disclosed layer |
| Glossary live-operator facts become stale and unowned | Medium | source/jurisdiction/verified-as-of fields or stable-concept label; research gate additions |
| Existing SSI axe violation is hidden by a broad “no serious findings” assertion | High | baseline tracked explicitly and fixed or reported |
| Broad batch causes route/search/tutor regressions | High | split into reliability slice, research gate, one intervention, tutor last |

### 8. NOT in scope

- No live SWIFTRef/Accuity or other authoritative bank provider.
- No production payment processing, account ownership, authentication, multi-user data, or server-side learner profiles.
- No promise of every global currency/rail; Prepare remains explicit about validation, catalogue, SWIFT, and SSI scope.
- No new AI dependency or tutor-provider rollout; tutor remains disabled by default.
- No analytics provider integration; use existing provider-neutral telemetry only.
- No replacement of the existing Case Desk, curriculum, PaymentRoute, or design system.
- No full corridor search unless research proves it is the bottleneck and a maintained data source is defined.

### 9. What already exists

- Five Case Desk scenarios, 16 curriculum entries, practice retention loop, local learner persistence, and telemetry/research protocol.
- Existing `Bank`, `SSI`, `FedwireBank`, `FedACHBank`, scheme, glossary, and tutor contracts.
- Existing route shell, `basename="/app"`, shared tokens, async states, keyboard-aware scheme tabs, and test fixtures.
- Existing README baseline: 1,302 backend tests, 1,091 serial frontend tests, 289 Chromium E2E passes, and one known SSI-table axe failure.

### 10. Strategic recommendation

Keep T1, T11, the narrow responsive/accessibility corrections from T10, and integrated regression. Require the five-case research readout before enabling T2–T9. If the readout shows lookup friction, implement the Directory/search slice with honest curated-data contracts. If it shows rail-decision confusion, implement the hybrid Schemes/Case Desk intervention first. Build tutor last, with grounded citations and a measurable usefulness pilot.

### 11. CEO completion summary

| Dimension | Result |
|---|---|
| Mode | REDUCTION / SELECTIVE EXPANSION |
| Product verdict | Do not approve the original twelve-task batch; approve staged reliability work. |
| Scope retained now | SSI compatibility, route loaders/entry path, narrow mobile/a11y corrections, regression verification. |
| Scope deferred | Walkthrough, global search/directory, glossary expansion, schemes rewrite, shell-wide tutor. |
| Primary wedge | Case-first payment-operations learning. |
| Reversibility | 4/5 for the staged plan; 2/5 for an all-at-once shell/tutor rollout. |
| Critical gaps | Explicit onboarding state, real resume-source contract, data authority labels, learning/research gate, baseline axe treatment. |

**Dual voice:** the independent Codex challenge reached the same strategic verdict as this review. Claude’s voice was unavailable because its OAuth session had expired; there is no cross-model consensus claim.

### CEO review section coverage

#### Section 1 — Architecture Review

Covered by the system audit and architecture diagram above. The architecture is acceptable only when AppShell owns shared mechanics while search/tutor remain contextual and the research gate owns expansion decisions. The main single point of failure is the shell overlay layer; keep it thin and covered by integration tests.

#### Section 2 — Error & Rescue Map

Covered by the error/rescue registry above. The critical gaps are storage write failures, stale bank responses, malformed tutor responses, and DB-lock behavior; each now has a named rescue requirement.

#### Section 3 — Security & Threat Model

New attack surface is limited to bounded read-only bank queries, BIC path segments, localStorage state, overlay input, and optional tutor prompts. Required controls: Pydantic bounds, ORM parameters, safe text rendering, no account values in search/telemetry, tutor redaction/rate limits, and citation URLs validated before rendering. No authorization change is needed because the app is anonymous and illustrative; do not add user-scoped data in this slice.

#### Section 4 — Data Flow & Interaction Edge Cases

```text
query/input ─▶ schema/bounds ─▶ normalize ─▶ query/local state ─▶ labelled UI
     │              │                │              │                │
   nil          invalid          unicode         timeout          stale result
     └──────────────┴────────────────┴──────────────┴────────────────┘
       safe empty/error state, retry or recovery action, no silent fallback
```

Required interaction tests include double submit, navigation while pending, Escape/close, back/forward, zero results, offset beyond total, 320px, corrupt local state, and unavailable tutor.

#### Section 5 — Code Quality Review

The plan fits existing FastAPI/React Query/Zod patterns. Avoid a second search abstraction, a synthetic resume abstraction, or a custom focus trap unless the existing design system has no primitive. Keep country normalization in one backend module and URL parsing in one frontend helper. Any method with more than five meaningful branches should be split into state/normalization helpers.

#### Section 6 — Test Review

Covered by the dedicated engineering test plan artifact and test diagram. The most confidence-building test is the local end-to-end learner journey with no provider; the hostile test is malformed/stale state across direct links and narrow viewports. Current parallel Vitest sensitivity and the pre-existing axe failure must be named in CI output.

#### Section 7 — Performance Review

The reliability slice is low risk. Gated bank search must cap page size and query fields, verify indexes/query plans, and avoid loading every bank into the browser. Static search remains local and debounced; tutor availability is cached but explicitly refetchable; gated routes should remain lazy so the eager shell budget stays below the existing limit.

#### Section 8 — Observability & Debuggability Review

Use existing provider-neutral telemetry for bounded event names and outcome flags only: onboarding state transition, search result type selected, directory empty/error, scheme selected, tutor availability/grounded outcome. Never record BIC/account values, tutor questions, or answers. Add structured server logs for schema patch, directory query bounds, and tutor failure class.

#### Section 9 — Deployment & Rollout Review

T1 is additive local SQLite compatibility and must not be treated as a production migration. Land it separately, run legacy/current/idempotence tests, then ship route/mobile fixes. Gated UI slices require their own commits and can be reverted independently. Smoke `/api/health`, `/app`, `/app/`, and one deep link after deploy; do not make a live-provider dependency part of the smoke path.

#### Section 10 — Long-Term Trajectory Review

The staged plan is reversible and creates useful primitives: honest data contracts, route loading, a real resume adapter, and contextual controllers. The original batch would create path dependency around a general directory/tutor product and a glossary maintenance burden. In twelve months, a new engineer should be able to see the research gate, authoritative-vs-curated boundary, and local-vs-production schema boundary in the plan and README.

#### Section 11 — Design & UX Review

Covered in the full Phase 2 review below: case-first IA, state coverage, journey, AI-slop resistance, design-system fit, responsive/accessibility intent, and unresolved design decisions.

## Autoplan Review — Phase 2: Design Review

### Design pass 1 — Information architecture

The amended IA is case-first: Overview establishes the current learning action, Learn/Case Desk owns practice, Explore supplies contextual reference, and Operate remains the simulation/tool surface. Search and tutor are page-context tools rather than competing primary destinations. This is clearer than the original “everything is globally reachable” model.

### Design pass 2 — State coverage

| Feature | Loading | Empty | Error | Success | Partial/degraded |
|---|---|---|---|---|---|
| Overview/resume | named page loader | no activity | corrupt local state fallback | one dominant action | no draft resume until real source |
| Directory/search | skeleton/status | no matches + recovery | API retry/static fallback | labelled bank rows | curated coverage/freshness banner |
| Schemes | market data status | no rail catalogue | retry + preserve URL | compact compare + detail | stale/source note |
| Glossary | filter status | zero result + clear | malformed data test | alias/canonical result | unverified term label |
| Tutor | availability status | no question | unavailable/429/malformed | grounded answer/citations | ungrounded fallback |
| Route loading | destination loader | n/a | error boundary | page | preserved shell |

### Design pass 3 — User journey coherence

```text
Open Relay
  └─ Overview: “What should I do next?”
       ├─ resume Case Desk / module (real persisted state)
       ├─ explicit walkthrough if onboardingStatus = unseen
       └─ contextual reference → search / schemes / glossary / tutor
             └─ return-to-context action preserves place
```

Emotional arc: orient → act → understand → verify → recover. The original plan risked orient → browse four directories → configure a tutor; the amended plan keeps action and explanation adjacent.

### Design pass 4 — AI slop / genericness

The visual language remains Relay-specific through PaymentRoute, simulation banner, existing tokens, and operational terminology. Generic patterns remain a risk in the search overlay, tutor sheet, and card replacement. Keep copy concrete: “Search Relay” / “Ask about this rail” / “Curated bank examples”, not “AI-powered discovery”.

### Design pass 5 — Design-system alignment

Reuse existing control/region/full radii, typography, status colors, and `AsyncRegion`. Do not add an overlay-specific design language. The tutor must look like a contextual tool, not a consumer chat product. The directory must not look like a bank-data SaaS dashboard.

### Design pass 6 — Responsive and accessibility

The plan correctly names 390×844, 768, 1024, 1440×900, and 320 robustness. Add explicit tests for Meta+K and Ctrl+K, focus trap/restore, `aria-live`, table headers/labelled mobile records, dialog naming, reduced motion, and no page-level horizontal overflow. The schemes mobile caption regression and existing SSI scrollable-region axe finding are release blockers until fixed or recorded.

### Design pass 7 — Unresolved design decisions

1. Choose one post-research intervention; do not ship all gated surfaces together.
2. Confirm whether the research needs a walkthrough or whether Case Desk orientation is the better first-visit action.
3. Confirm curated directory naming/coverage disclosure before adding country filters.
4. Confirm tutor launch contexts and the minimum citation/grounding presentation.

### Design scorecard

| Dimension | Score | What makes it a 10 |
|---|---:|---|
| Information architecture | 8/10 | One validated learner job is reflected in navigation and copy. |
| Interaction states | 8/10 | Explicit degraded states are strong; storage and baseline-axe tests must land. |
| Journey coherence | 8/10 | Case-first return paths are clear; research must choose the first-visit intervention. |
| AI slop resistance | 9/10 | Strong Relay-specific visual constraints; avoid generic chat language. |
| Design-system fit | 9/10 | Existing tokens and PaymentRoute remain central. |
| Responsive/accessibility | 7/10 | Good intent, but mobile caption/SSI axe/focus-trap verification remains. |
| Decision completeness | 7/10 | Product wedge, directory authority, tutor contexts, and research gate need approval. |
| **Overall** | **8/10** | A focused reliability slice can ship; the full UI expansion is not yet design-ready. |

Visual mockups were not generated: the local renderer was unavailable in this environment, and the review is plan-level rather than a request to create design artifacts.

**Dual voice:** no second design model was available. The design review is Codex-only and explicitly marked as such.

## Autoplan Review — Phase 3: Engineering Review

### Architecture and boundaries

```text
FastAPI startup
  └─ ensure_sqlite_schema ── additive local SSI columns

FastAPI directory (gated)
  └─ bounded query ── Bank table ── labelled curated response

React AppShell
  ├─ PageLoader/ErrorBoundary ── lazy routes
  ├─ contextual search controller (gated)
  └─ contextual tutor controller (last pilot)

Overview ── versioned learner state ── real ResumeCandidate adapter
Schemes ── URL parser/normalizer ── compact compare + selected detail
Learn/Prepare ── responsive/accessibility corrections
```

Load-bearing engineering amendments:

- Define `ResumeCandidate` from real stores; do not pass synthetic timestamps from `OverviewPage`.
- Make `onboardingStatus` part of the existing versioned learner state, not an unrelated unversioned localStorage key. If a separate key is retained temporarily, define reset/import/version semantics.
- Keep `BankDirectoryItem` explicit about `coverage`, `source`, `verified_as_of`, and `illustrative`; add a seeded-country invariant for country labels.
- Use parameterized SQLAlchemy expressions, bounded `q`, explicit country normalization, and indexed BIC/country/name access. Do not imply country-name search unless implemented.
- Use `useLocation()`/router helpers in tests; MemoryRouter tests must not assert the real browser global.
- Use a shared focus-trap primitive or document the exact trap behavior; mobile tutor/search overlays must not merely set `aria-modal`.
- Tutor availability must refetch after “Check again”; a permanently stale `staleTime: Infinity` query needs explicit invalidation/refetch semantics. Preserve `grounded`, citations, refusal/empty behavior, and one-turn history semantics.
- Add `app/main.py` manifest/API count and README endpoint/config documentation when `/api/banks` or new routes are enabled.
- Make Vite redirect helper types and tests concrete; test query preservation and no redirect loop.

### Error, security, data-flow, performance, and rollout checks

| Area | Finding | Plan amendment |
|---|---|---|
| Security | Search query, country, limit, offset, BIC path, localStorage, and tutor prompt are new inputs. | Bound/normalize all inputs; use ORM parameters; escape rendered copy; never expose secrets; keep tutor redaction/limits. |
| Data flow | Directory, SSI, search, tutor, onboarding, schemes, and lazy route each have nil/empty/error/stale paths. | Keep the error registry above and require one test for each shadow path in the test artifact. |
| Performance | Name/BIC/country filtering can become a full scan; shell overlays can inflate eager bundle; tutor calls can be expensive. | Index/query-plan check; lazy-load gated surfaces; availability cache with explicit retry; bundle check remains required. |
| Observability | Existing telemetry is provider-neutral; new UI states could be invisible. | Add bounded events for search selection, directory empty/error, onboarding completion, scheme selection, tutor availability/grounded outcome—no bank/account values or tutor text. |
| Deployment | SSI helper is local additive compatibility only; no production migration is included. | Run legacy/current/idempotence tests; document that production schema remains Alembic-owned. |
| Rollback | A broad shell change is hard to bisect. | Land reliability slice separately; gate later slices; revert feature commits independently. |

### Test coverage diagram

```text
Unit: schema patches, URL normalizer, search ranking, onboarding state,
      ResumeCandidate ranking, glossary aliases, scope copy
   ↓
Integration: FastAPI bank contract, SSI lookup/compatibility, MSW search/tutor,
             shell overlay focus, lazy loader/error boundary
   ↓
E2E: /app entry → current Case Desk/learning action → gated search or schemes
     deep link → mobile/desktop/reduced-motion/keyboard recovery
```

The detailed test plan is persisted at `~/.gstack/projects/Leatherback/codex-ui-changes-eng-review-test-plan-20260816.md`. The hostile QA tests are: corrupt local state, stale/duplicate bank responses, invalid deep links, closed overlays while requests are pending, double tutor submit, DB lock, 429, malformed tutor output, and 320px layouts. No live provider or wall-clock-dependent test is allowed.

### Engineering completion summary

| Dimension | Result |
|---|---|
| Architecture | Sound after staging; unsafe as one shell-wide batch. |
| Code quality | Good reuse potential; real resume adapter, router test helper, focus trap, tutor citation types, and API docs need explicit steps. |
| Tests | Strong baseline and focused plan; baseline axe exception must be explicit. |
| Performance | Low risk for reliability slice; gated API needs indexes and query bounds. |
| Rollout | Reliability slice reversible; UI expansion requires evidence gate/feature ownership. |
| Eng verdict | **ISSUES OPEN** until amendments are accepted and reliability tests pass. |

**Dual voice:** Claude unavailable; no independent second engineering model was available after the Codex challenge. This is a single-model engineering review, not cross-model consensus.

## Autoplan Review — Phase 3.5: Developer Experience Review

### Developer persona card

**Primary developer:** a contributor who can run Python/Node locally, wants to reproduce a learner-facing bug or add a payment reference surface, and needs a first useful result before understanding every payment domain detail. They care about copy-paste setup, honest API contracts, deterministic tests, and knowing whether a failure is local data, provider configuration, or UI state.

### Empathy narrative

“I clone Relay, start the backend and frontend, open `/app`, and want to see a seeded educational journey quickly. If `/api/banks` is added, I need to know whether those are authoritative or examples before I build UI assumptions around them. If the tutor is disabled, I need a fake/test path and a clear configuration guide, not a button that appears broken. When a stale SQLite file is missing `ssi.as_of`, I need the compatibility behavior and production migration boundary spelled out. When a test fails, I need the exact focused command and whether the failure is a baseline axe issue or a regression.”

### Developer journey map

| Stage | Current friction | Target after plan amendments | Evidence |
|---|---|---|---|
| Discover repo | README is rich but next slice competes with UI plan | README/ROADMAP name reliability slice + research gate | README/ROADMAP |
| Install | Python/Node setup is documented but not a one-command bootstrap | keep existing setup; add exact quick-start smoke path | README |
| Start backend | local DB/seed behavior can be opaque | `/api/health` plus schema-compat test explains state | app/main.py |
| Start frontend | `/app` vs `/app/` inconsistency | redirect and deep-link smoke test | vite/FastAPI |
| See first result | overview action can misroute or overpromise resume | explicit onboarding + real candidate contract | Overview/storage |
| Exercise API/UI | new bank endpoint lacks docs if not updated | OpenAPI/README example, bounded contract, curated label | directory/schemas |
| Extend feature | shell ownership can become coupled | contextual controllers and focused files | AppShell/features |
| Run tests | parallel Vitest is load-sensitive; axe baseline is easy to misread | focused commands + serial baseline + explicit exception | README/test plan |
| Operate/upgrade | tutor provider and local schema boundaries are easy to confuse | disabled-default runbook, fake handler, additive local repair note | tutor/README |

### TTHW and DX scorecard

Estimated current time-to-hello-world is **5–8 minutes** for an experienced contributor, excluding dependency download; target is **under 5 minutes** to a seeded `/app` journey and `/api/health` response. This is inferred from existing docs, not measured in a fresh environment.

| Dimension | Score | Review note |
|---|---:|---|
| Getting started | 8/10 | Strong README; add one exact smoke command. |
| API/CLI/SDK | 7/10 | Existing API table is useful; new bank contract/docs must be added. |
| Error messages | 8/10 | Existing tutor/health patterns are good; schema-lock and search errors need named recovery. |
| Documentation | 8/10 | Rich docs; avoid plan/README drift and document curated data authority. |
| Upgrade path | 6/10 | Local SQLite compatibility is helpful but production/Alembic boundary needs a runbook. |
| Dev environment | 7/10 | Reproducible local stack; browser/tooling assumptions should be explicit. |
| Community | 4/10 | No visible contribution/community workflow was found; not a blocker for this slice. |
| DX measurement | 5/10 | No measured TTHW or API adoption metric; add a lightweight smoke check, not a platform. |
| **Overall** | **6.6/10** | Competitive for a local prototype; upgrade path and documentation must keep pace with new contracts. |

**Product type:** local educational web application with read-only/reference APIs and optional AI configuration. **Mode:** POLISH/TRIAGE now, EXPANSION only after research. **Competitive tier:** Needs Work, with a credible path to Competitive after the smoke/docs fixes.

### DX implementation checklist

- [x] Existing local setup and seeded data documented.
- [ ] Add one copy-paste hello-world smoke path: health → `/app/` → one seeded learner action.
- [ ] Document `/api/banks` only if the gated slice is selected, including illustrative coverage/source/freshness.
- [ ] Document tutor disabled-by-default, optional install, fake/MSW test path, and provider failure meanings.
- [ ] Document SQLite compatibility as development support and Alembic as production schema authority.
- [ ] Add explicit baseline/parallel-test guidance and axe exception treatment.
- [ ] Keep TypeScript/Pydantic/Zod contracts synchronized and tested.
- [ ] Do not add an SDK, external provider, or community platform in this slice.

**Dual voice:** Claude unavailable; DX review is Codex-only.

## Autoplan Decision Audit Trail

| Decision | Principle | Why |
|---|---|---|
| Reduce the original batch to reliability + research gate | P1/P6: protect the primary user outcome and avoid one-way scope expansion | ROADMAP explicitly prioritizes five-case research; current batch mixes four product jobs. |
| Keep T1/T11/narrow T10 now | P2: low-risk, high-confidence correctness | These address observed stale SSI, blank loaders, bare `/app`, and mobile/a11y defects. |
| Require explicit `onboardingStatus` | P3: make state truthful | `completedModules === 0` is not first visit. |
| Remove operate draft from resume until persisted | P3/P5: no synthetic behavior | `PreparePaymentPage` does not currently save the draft it would resume. |
| Rename Directory to curated examples and add authority metadata | P1: preserve user trust | Seed data explicitly calls itself a starter set. |
| Keep schemes comparison visible | P4: preserve the core task | Users should compare speed/cost/limit/use case while learning. |
| Make tutor contextual and grounded | P1/P4: avoid false affordances | Tutor is disabled by default and grounding/citations are trust-critical. |
| Require source/jurisdiction/date for live-operator glossary terms | P2: contain maintenance debt | New terms otherwise become an unowned stale knowledge base. |
| Make baseline axe explicit | P5: verify before claiming completion | README records an existing SSI scroll violation. |
| Add docs/manifest updates with gated APIs | P2: make contracts discoverable | API count/table and OpenAPI should not drift from code. |
| Preserve unrelated untracked files | Safety | Sentry plan and `tmp/` are outside this request. |

## Autoplan Implementation Tasks

These are review-derived amendments, not permission to implement product code in this review.

- [ ] **R1 (P1, human: ~2h / CC: ~15min)** — Product sequencing — add a research-gate checklist and one-primary-outcome template to the plan/ROADMAP handoff.
  - Surfaced by: CEO premise challenge and failure-mode registry.
  - Files: `docs/superpowers/plans/2026-08-16-relay-unified-ui-pass-implementation.md`, `ROADMAP.md` if the gate is adopted.
  - Verify: a future implementation commit links the five-case readout and selected intervention.
- [ ] **R2 (P1, human: ~2h / CC: ~15min)** — Overview persistence — define versioned `onboardingStatus` and a real `ResumeCandidate` adapter; remove synthetic payment-draft resume.
  - Surfaced by: CEO findings 3–4; `OverviewPage.tsx`, `storage.ts`, `PreparePaymentPage.tsx`.
  - Files: `frontend/src/lib/persistence`, `frontend/src/features/overview`, focused tests.
  - Verify: corrupt/stale/completed/missing-destination cases pass.
- [ ] **R3 (P1, human: ~2h / CC: ~15min)** — Directory contract — label the endpoint as curated examples and include coverage/source/freshness metadata plus canonical country labels.
  - Surfaced by: CEO finding 5–6 and DX API review.
  - Files: `app/schemas.py`, `app/routers/directory.py`, `app/data/country_names.py`, `tests/test_api.py`, README/API manifest.
  - Verify: every seeded country has a label; bounds, empty results, and source metadata are tested.
- [ ] **R4 (P1, human: ~1h / CC: ~10min)** — Reliability baseline — fix or explicitly isolate the existing SSI scrollable-region axe violation and add named route loading/error states.
  - Surfaced by: design and engineering test review.
  - Files: `frontend/src/features/explore/SettlementInstructions*`, `frontend/src/app-shell/App.tsx`, E2E/a11y tests.
  - Verify: no new serious axe findings and the baseline is closed or reported.
- [ ] **R5 (P2, human: ~1h / CC: ~10min)** — Schemes comparison — use router state helpers and keep compact comparison visible above selected detail.
  - Surfaced by: design pass 3 and CEO finding 8.
  - Files: `frontend/src/features/explore`, focused tests.
  - Verify: direct link and back/forward restore market/rail on mobile and desktop.
- [ ] **R6 (P2, human: ~1h / CC: ~10min)** — Tutor trust surface — keep contextual, capture grounded/citations, and define availability/refetch/empty/malformed response behavior.
  - Surfaced by: CEO finding 7 and engineering error review.
  - Files: `frontend/src/features/tutor`, `frontend/src/api/schemas.ts`, tests, README tutor section.
  - Verify: no live provider required; MSW covers disabled, 429, malformed, ungrounded, and cited answers.
- [ ] **R7 (P2, human: ~1h / CC: ~10min)** — Glossary stewardship — add source/jurisdiction/verified-as-of metadata or stable-concept labels and an inventory migration test.
  - Surfaced by: CEO finding 9 and design trust review.
  - Files: glossary/search data and tests.
  - Verify: every new live-operator term has provenance and `Interac` alias recovery works.
- [ ] **R8 (P2, human: ~45min / CC: ~5min)** — DX contract sync — update README endpoint/config/test-baseline docs and add one copy-paste hello-world smoke path.
  - Surfaced by: DX journey map and scorecard.
  - Files: `README.md`, `app/main.py` manifest if needed, test docs.
  - Verify: fresh contributor reaches `/api/health` and `/app/` without undocumented steps.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES OPEN (PLAN via `/autoplan`) | Reduced broad batch; 4 reliability items retained, 8 expansion items gated/deferred; 5 critical gaps. |
| Codex Review | `codex exec` | Independent 2nd opinion | 1 | ISSUES OPEN (single-model) | Confirmed research sequencing, primary-wedge ambiguity, false resume source, directory authority, tutor scope, and comparison risk. |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | ISSUES OPEN (PLAN via `/autoplan`) | Resume adapter, focus trap, API/docs contract, router test helper, observability, and baseline axe need implementation. |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ISSUES OPEN (PLAN via `/autoplan`) | 8/10 after amendments; mobile/a11y and product-wedge decisions remain. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 1 | ISSUES OPEN (PLAN via `/autoplan`) | 6.6/10 inferred; improve schema/runbook/docs sync and hello-world smoke path. |

**CODEX:** Independent challenge completed for the CEO pass; it agreed the original batch should not ship as one implementation and its findings were folded into the staged plan.

**VERDICT:** The amended plan is ready for user approval as a staged implementation plan, but the original all-at-once UI expansion is not cleared. Engineering remains a required gate before product code lands.

**UNRESOLVED DECISIONS:**
- Approve the research gate and staged reduction, or explicitly override it and accept the risks of implementing the gated UI surfaces in one batch.
- After the five-case readout, choose the first intervention: case-first onboarding/resume, contextual search/curated directory, or hybrid Schemes comparison.
