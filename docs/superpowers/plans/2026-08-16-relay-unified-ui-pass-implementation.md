# Relay Unified UI Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Relay into one coherent, searchable, progressively disclosed learning workspace while repairing the stale local SSI path that currently breaks bank data.

**Architecture:** Keep `AppShell` as the owner of global overlays and route loading, and extract shared search/tutor controllers into focused feature folders. Add one bounded FastAPI bank-directory endpoint backed by the existing `Bank` table, then consume it through the existing typed API/Zod/React Query stack. Recompose existing Overview, Bank Directory, Schemes, Glossary, Learn, and Prepare surfaces without replacing Relay's design system or payment-route signature.

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
- Production schema history remains Alembic-owned; the compatibility helper is additive SQLite development support only.

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

### Task 5: Rebuild Bank Directory as browse and search

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
- Consumes: local learner progress/activity, case `updatedAt`, payment draft `updatedAt`, and `PaymentRoute`.
- Produces: `/app/walkthrough`, persisted `{ step: 0 | 1 | 2, completed: boolean }`, and deterministic newest-unfinished action selection.

- [ ] **Step 1: Write failing first-visit and ranking tests**

```ts
expect(selectPrimaryAction({ firstVisit: true })).toEqual({
  kind: "explore_intro", href: "/walkthrough", label: "Explore how a payment moves",
});
expect(selectPrimaryAction({
  unfinishedLearnAt: 100, unfinishedOperateAt: 300, unfinishedCaseAt: 200,
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
  firstVisit?: boolean;
  unfinishedLearnAt?: number;
  unfinishedOperateAt?: number;
  unfinishedCaseAt?: number;
  unfinishedCaseHref?: string;
  curriculumComplete?: boolean;
  nextModuleId?: string;
}

const candidates = [
  ctx.unfinishedLearnAt === undefined ? null : { at: ctx.unfinishedLearnAt, action: { kind: "resume_learn" as const, href: "/learn", label: "Continue learning" } },
  ctx.unfinishedOperateAt === undefined ? null : { at: ctx.unfinishedOperateAt, action: { kind: "resume_operate" as const, href: "/operate", label: "Resume payment preparation" } },
  ctx.unfinishedCaseAt === undefined || !ctx.unfinishedCaseHref ? null : { at: ctx.unfinishedCaseAt, action: { kind: "resume_learn" as const, href: ctx.unfinishedCaseHref, label: "Resume customer case" } },
].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
const newest = candidates.sort((left, right) => right.at - left.at)[0];
if (newest) return newest.action;
```

Derive case timestamps from incomplete `learningState.state.cases` sessions and operate timestamps from persisted `PrepareDraft.updatedAt`; use the latest module activity for Learn. Hide recent activity when empty; replace the four equal utility cards with a plain secondary-action list. The first-visit hero includes `START HERE`, `PaymentRoute`, and the `/walkthrough` action.

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
- Produces: always-visible Ask tutor trigger; session-cached availability; answer, unavailable, retry, rate-limit, and error states.

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

### Task 8: Recompose Payment Schemes around one selected rail

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
- Produces: one selected detail, browser-history restoration, collapsed comparison, and labelled mobile records.

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
  await waitFor(() => expect(window.location.search).toContain("market=CAD"));
  expect(window.location.search).toContain("rail=Interac");
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

Change roadmap and sources in `SchemeDetails` to native `<details>` blocks. Replace mobile table row layout with labelled records and a short caption; do not allow the caption to collapse word-by-word.

- [ ] **Step 5: Run scheme tests and commit**

Run: `cd frontend && npm test -- src/features/explore`

Expected: all Explore/scheme tests PASS.

```bash
git add frontend/src/features/explore
git commit -m "feat: simplify payment scheme exploration"
```

### Task 9: Expand the glossary and canonical search links

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
}

export const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  { term: "Interac e-Transfer", definition: "Canadian near-real-time account-to-account payment service using email or mobile addressing", aliases: ["Interac"], group: "payment-rails" },
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

Retain all existing terms in the same structure; `searchStatic` scores term, aliases, then definition. `GlossaryPage` groups by `group` and highlights the canonical query term.

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

Expected: integrated journey PASS with no serious Axe findings.

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
