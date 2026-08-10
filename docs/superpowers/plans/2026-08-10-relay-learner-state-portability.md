# Relay Learner State Portability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Relay learners export and merge their learning progress without login, while keeping payment drafts and preferences local-only.

**Architecture:** Add a typed Learner State API over the existing versioned browser stores. Export/import covers progress, practice, activity, and case sessions; it validates before mutation, snapshots exact raw learning keys, and rolls back if a write fails. The API leaves a future account-sync adapter seam without adding backend persistence now.

**Tech Stack:** React + TypeScript, existing `localStorage` persistence, Vitest, React Testing Library, Playwright, Vite.

## Global Constraints

- No login, registration, OAuth, Relay backend learner database, or Leatherback identity integration.
- Export only progress, practice, activity, and case sessions; exclude payment drafts, preferences, telemetry, secrets, caches, and transient UI state.
- Preserve the current storage keys and existing feature behavior during migration.
- Validate the complete import before changing local state; v1 rejects invalid optional records instead of partially importing them.
- Snapshot exact raw learning keys before the first write; rollback is best-effort recovery, not an atomic localStorage transaction.
- Keep profile IDs anonymous, browser-local, and out of backend requests.
- Do not commit changes unless the user explicitly asks for a commit.

---

## File map

- Create `frontend/src/lib/persistence/learnerStateTypes.ts` for aggregate state, profile, export-envelope, validation, and result types.
- Create `frontend/src/lib/persistence/learnerStateMerge.ts` for pure validation and merge behavior.
- Create `frontend/src/lib/persistence/learnerStateTransfer.ts` for profile loading, export creation, import writes, raw-key snapshots, and rollback.
- Modify `frontend/src/lib/persistence/storage.ts` to expose safe raw-key snapshot primitives without changing existing wrapper behavior.
- Modify `frontend/src/features/learn/cases/caseStore.ts` to expose the case payload validator needed by export/import without moving reducer logic.
- Create `frontend/src/lib/persistence/learnerStateMerge.test.ts` for pure merge and validation tests.
- Create `frontend/src/lib/persistence/learnerStateTransfer.test.ts` for profile, export, import, write failure, and rollback tests.
- Create `frontend/src/features/overview/LearnerDataPanel.tsx` for the user-facing backup/restore flow.
- Modify `frontend/src/features/overview/OverviewPage.tsx` and `frontend/src/features/overview/OverviewPage.css` to place and style the panel.
- Create `frontend/e2e/learner-state.spec.ts` for browser-level export/import coverage.
- Modify `README.md` and `ROADMAP.md` to document anonymous local learning storage and learning-only portability.

## Task 1: Establish the aggregate types and raw storage boundary

**Files:**
- Create: `frontend/src/lib/persistence/learnerStateTypes.ts`
- Modify: `frontend/src/lib/persistence/storage.ts`
- Modify: `frontend/src/features/learn/cases/caseStore.ts`
- Test: `frontend/src/lib/persistence/learnerStateTransfer.test.ts`

**Interfaces:**

```ts
export interface RelayLocalProfile {
  schemaVersion: 1;
  profileId: string;
  createdAt: number;
  updatedAt: number;
}

export interface RelayLearningState {
  profile: RelayLocalProfile;
  progress: RelayProgress;
  practice: PracticeState;
  activity: RelayActivityLog;
  cases: Record<string, CaseSession>;
}

export interface RelayLearnerExportEnvelope {
  format: "relay-learner-state";
  formatVersion: 1;
  exportedAt: number;
  sourceProfileId: string;
  state: Omit<RelayLearningState, "profile">;
}

export interface RawStorageSnapshot {
  entries: Array<{ key: string; rawValue: string | null }>;
}

export type ProfilePersistence = "persistent" | "session-only";

export interface LocalProfileResult {
  profile: RelayLocalProfile;
  persistence: ProfilePersistence;
}

export interface LoadedLearningState {
  state: RelayLearningState;
  persistence: ProfilePersistence;
  warnings: string[];
}
```

- [ ] **Step 1: Write failing tests for profile and raw-key behavior.**

Add tests that assert a profile is created once, has a UUID-like ID, survives a second
load, and that a snapshot preserves both existing raw values and missing-key markers.

```ts
it("creates one anonymous profile and does not regenerate it", () => {
  const first = loadOrCreateLocalProfile();
  const second = loadOrCreateLocalProfile();
  expect(second.profileId).toBe(first.profileId);
});

it("snapshots missing keys as null", () => {
  localStorage.setItem("relay:progress", JSON.stringify({ schemaVersion: 1, completedModuleIds: ["lab-1"] }));
  const snapshot = snapshotLearningStorage();
  expect(snapshot.entries).toContainEqual({ key: "relay:practice", rawValue: null });
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run: `cd frontend && npm test -- --run src/lib/persistence/learnerStateTransfer.test.ts`

Expected: FAIL because the profile and snapshot functions do not exist.

- [ ] **Step 3: Add raw storage primitives without changing existing callers.**

Add typed helpers in `storage.ts`:

```ts
export function snapshotLearningStorage(additionalKeys?: string[]): RawStorageSnapshot;
export function restoreLearningStorage(snapshot: RawStorageSnapshot): SaveResult;
export function listLearningStorageKeys(): string[];
export function loadOrCreateLocalProfile(): LocalProfileResult;
```

`listLearningStorageKeys()` must include the fixed profile/progress/practice/activity
keys and every key beginning with `relay:case-session:`. It must never include
`relay:draft:` or `relay:preferences`.

- [ ] **Step 4: Expose a pure case-session payload parser.**

Extract the existing structural guard in `caseStore.ts` behind an exported function:

```ts
export function parseCaseSessionPayload(caseId: CaseId, value: unknown): CaseSession | null;
```

`loadCaseSession()` must continue returning the same normalized/recovered values as it
does today; this change only makes strict import validation reuse the same shape rules.

- [ ] **Step 5: Implement profile creation and verify the focused tests pass.**

Store the profile under `relay:profile`. Use `crypto.randomUUID()` when available and
fall back to a browser-safe random ID generator. If storage is unavailable, return a
session-only profile result instead of throwing; the caller must be able to tell that
the profile will not survive closing the tab.

Run: `cd frontend && npm test -- --run src/lib/persistence/learnerStateTransfer.test.ts`

Expected: PASS for profile creation and raw-key snapshot behavior.

## Task 2: Implement pure validation and merge rules

**Files:**
- Create: `frontend/src/lib/persistence/learnerStateMerge.ts`
- Create: `frontend/src/lib/persistence/learnerStateMerge.test.ts`
- Modify: `frontend/src/lib/persistence/learnerStateTypes.ts`

**Interfaces:**

```ts
export type ImportValidation =
  | { ok: true; value: RelayLearnerExportEnvelope }
  | { ok: false; reason: "malformed" | "unsupported-version" | "invalid-record" | "oversized"; message: string };

export interface MergeReport {
  completedModulesAdded: number;
  casesImported: number;
  casesRetained: number;
  activityEntriesAdded: number;
  ignoredIds: string[];
}

export function validateLearningExport(input: unknown): ImportValidation;
export function mergeLearningState(local: RelayLearningState, imported: RelayLearnerExportEnvelope): { state: RelayLearningState; report: MergeReport };
```

- [ ] **Step 1: Write failing validation tests.**

Cover wrong format, unsupported `formatVersion`, missing state fields, unknown module
IDs, malformed case sessions, and a payload above the configured size limit. The valid
fixture must include one progress item, one practice state, one activity entry, and one
case session.

- [ ] **Step 2: Run validation tests and verify they fail.**

Run: `cd frontend && npm test -- --run src/lib/persistence/learnerStateMerge.test.ts`

Expected: FAIL because validation is not implemented.

- [ ] **Step 3: Implement strict envelope validation.**

Validate plain objects, exact format/version, bounded strings and arrays, known module
IDs, practice schema, activity shape, case IDs, and case payloads through
`parseCaseSessionPayload`. Reject the entire file on the first invalid included record.

- [ ] **Step 4: Write failing merge tests for every domain.**

Test module union, newest valid case session by ISO `updatedAt`, exact activity
deduplication and cap, practice history deduplication by `day/correct/total`, maximum
`bestStreak`, later `lastPracticeDay`, and missed-question conflict rules.

- [ ] **Step 5: Implement pure merge functions.**

Keep local `profileId`; never import the source profile ID as the active profile. Do
not merge preferences or payment drafts because they are absent from the envelope.

- [ ] **Step 6: Run the pure test suite.**

Run: `cd frontend && npm test -- --run src/lib/persistence/learnerStateMerge.test.ts`

Expected: PASS with deterministic reports and no localStorage access in the merge module.

## Task 3: Build export/import transfer services with recovery

**Files:**
- Create: `frontend/src/lib/persistence/learnerStateTransfer.ts`
- Modify: `frontend/src/lib/persistence/learnerStateTransfer.test.ts`
- Modify: `frontend/src/features/learn/cases/caseStore.ts` if the case-key reader needs a small adapter export

**Interfaces:**

```ts
export type TransferResult =
  | { ok: true; report: MergeReport }
  | { ok: false; phase: "read" | "validate" | "write" | "rollback"; message: string };

export function loadLearningState(): LoadedLearningState;
export function createLearningExport(now?: number): RelayLearnerExportEnvelope;
export function importLearningExport(input: unknown): TransferResult;
```

- [ ] **Step 1: Write failing export tests.**

Assert the envelope contains only profile provenance, progress, practice, activity,
and case sessions. Assert `relay:draft:*` and `relay:preferences` never appear in the
serialized export.

- [ ] **Step 2: Implement `loadLearningState()` and `createLearningExport()`.**

Read fixed stores through their existing loaders, enumerate only case-session keys,
parse valid sessions, omit unknown/corrupt case keys with a reportable warning, and
serialize a JSON-safe envelope. `loadLearningState()` returns those warnings and the
profile persistence mode so the UI can explain session-only behavior.

- [ ] **Step 3: Write failing import and rollback tests.**

Cover same-profile merge, imported completion union, imported case creation, invalid
file rejection before writes, a write failure after one successful write, successful
raw-key restoration, and restoration failure reporting.

- [ ] **Step 4: Implement staged import.**

Use this order:

```text
validate input
  -> load current state
  -> snapshot exact learning raw keys
  -> merge in memory
  -> write progress/practice/activity/cases/profile
  -> restore snapshot on any failure
```

Do not write until validation and merge complete. Pass the imported case-session keys
as `additionalKeys` to `snapshotLearningStorage()` so newly created case keys receive
missing-key markers and are removed during rollback. Update local profile `updatedAt`
only after the merged state writes succeed.

- [ ] **Step 5: Run transfer tests.**

Run: `cd frontend && npm test -- --run src/lib/persistence/learnerStateTransfer.test.ts`

Expected: PASS, including explicit `rollback` failure results when restoration cannot
write back to browser storage.

## Task 4: Add the learner-data UI

**Files:**
- Create: `frontend/src/features/overview/LearnerDataPanel.tsx`
- Modify: `frontend/src/features/overview/OverviewPage.tsx`
- Modify: `frontend/src/features/overview/OverviewPage.css`
- Create: `frontend/src/features/overview/LearnerDataPanel.test.tsx`

**Interfaces:**

```ts
interface LearnerDataPanelProps {
  profilePersistence: "persistent" | "session-only";
}
```

- [ ] **Step 1: Write failing component tests.**

Test visible copy that says learning data is saved on this device, a download button,
file picker acceptance, no mutation before confirmation, preview counts, cancel, success,
invalid-file error, and session-only warning.

- [ ] **Step 2: Implement the panel using the transfer services.**

Use `Blob` and an object URL for download. Read the selected file with `file.text()`;
validate it before showing the preview. Require an explicit confirmation before calling
`importLearningExport`. Use `role="status"` or `aria-live` for result/error feedback.

- [ ] **Step 3: Add privacy and scope copy.**

Use “Download learning backup” and state that payment drafts and preferences are not
included. Warn that case sessions may contain learner-entered notes and the downloaded
file should be kept private. Do not call this cloud sync.

- [ ] **Step 4: Place the panel on Overview and style it.**

Place it after progress/activity and before the lower data summary so it is discoverable
without competing with the primary learning CTA. Follow existing Relay spacing, button,
border, and muted-text tokens; provide a stacked mobile layout.

- [ ] **Step 5: Run component tests.**

Run: `cd frontend && npm test -- --run src/features/overview/LearnerDataPanel.test.tsx src/features/overview/OverviewPage.test.tsx`

Expected: PASS with no console errors and no network request for export/import.

## Task 5: Add browser coverage and update project documentation

**Files:**
- Create: `frontend/e2e/learner-state.spec.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Add Playwright coverage.**

Cover a fresh browser profile, completing one module, downloading a learning backup,
clearing learning keys, importing the backup, confirming progress/activity return, and
asserting that a `relay:draft:*` key and preference value are unchanged by restore.

- [ ] **Step 2: Run the browser test.**

Run: `cd frontend && npm run test:e2e -- e2e/learner-state.spec.ts`

Expected: PASS in the existing local dev-server setup.

- [ ] **Step 3: Update README.**

Document that Relay has anonymous, browser-local learning persistence; explain that
learning backups are manual JSON export/import; state that no account or cross-device
sync exists yet; list the included and excluded state domains; mention session-only
behavior when browser storage is unavailable.

- [ ] **Step 4: Update ROADMAP.**

Move learning-state portability into the current product status and keep account/cloud
sync as a future item. Do not describe telemetry as progress storage.

## Task 6: Full verification and handoff

**Files:**
- No new files; verify all changed files above.

- [ ] **Step 1: Run the full frontend test suite.**

Run: `cd frontend && npm test -- --run`

Expected: all existing and new tests pass.

- [ ] **Step 2: Build the frontend.**

Run: `cd frontend && npm run build`

Expected: successful Vite production build.

- [ ] **Step 3: Run the focused browser smoke checks.**

Run: `cd frontend && npm run test:e2e -- e2e/learner-state.spec.ts e2e/learn.spec.ts`

Expected: both suites pass and the Overview, Learn, and Case Desk routes remain usable.

- [ ] **Step 4: Review the diff for scope.**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors, no unrelated files changed, and no generated export
files or test artifacts added to the repository.
