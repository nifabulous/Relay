# Relay Learner State Portability — Design

**Date:** 2026-08-10  
**Status:** Draft for review; architecture and import strategy chosen  
**Scope:** Anonymous local profile, export/import, and future account-sync boundary

## Problem

Relay currently saves learning progress and activity in browser storage without a
login. That is appropriate for a no-account educational experience, but the state is
not portable: a learner can lose it when clearing browser data, changing browsers, or
moving devices. The current stores are also distributed across several keys, so a
future account or sync implementation would otherwise need to understand feature-level
storage details.

The goal is to make the existing local-first model safer and portable without
introducing Leatherback identity, account creation, or server-side learner persistence.

## Goals

- Keep Relay usable without login or network access.
- Add one learner-state boundary that owns load, save, export, and import behavior.
- Preserve existing local-storage keys during migration and avoid breaking current
  drafts or progress.
- Give every browser profile a stable, anonymous Relay profile ID that is not an
  account identity.
- Export one validated JSON file containing durable educational state.
- Import by merging into the current profile, never silently replacing it.
- Validate and create a recoverable local backup before import changes local state.
- Keep a future account/sync adapter replaceable and outside this implementation.

## Non-goals

- No login, registration, password, OAuth, or account provider decision.
- No Relay backend learner database or cross-device sync in this phase.
- No reuse of LeatherbackTransaction identity, auth, or customer data.
- No export of server telemetry, access tokens, secrets, or transient UI state.
- No export of payment drafts or preferences in the first version. Those remain local
  until there is a separate product decision and privacy treatment for operational
  data.
- No rewrite of individual feature reducers unless required to expose their persisted
  state through the boundary.

## Current persistence surface

The adapter must initially cover these existing stores:

| State | Current location | Export treatment |
| --- | --- | --- |
| Preferences | `relay:preferences` | Remain local; not included in v1 export |
| Module progress | `relay:progress` and legacy migration path | Durable; merge completed IDs by union |
| Daily practice | `relay:practice` | Durable; merge history, review state, and streak metadata |
| Recent activity | `relay:activity` | Durable; deduplicate, newest-first, cap at current limit |
| Case sessions | `relay:case-session:<caseId>` | Durable; merge per case using newest valid session |
| Payment drafts | `relay:draft:<id>` | Remain local; not included in v1 export |

Transient component state, open overlays, selected tabs, in-progress network requests,
and browser-specific caches are not exported.

## Proposed architecture

```text
Relay feature components
        |
        v
Learner State API
  - profile metadata
  - load/save adapters
  - export envelope
  - validate + merge + rollback
        |
        v
Existing versioned local stores
        |
        +-- future: optional Relay sync adapter
            (only after explicit account consent)
```

Feature components should call the existing domain wrappers or the new aggregate
adapter, rather than importing `localStorage` keys directly. The aggregate adapter is
a compatibility layer over the current stores first; consolidating physical storage
into one key is not required for this phase.

## Profile metadata

Add a small local profile record, for example `relay:profile`, containing:

```ts
interface RelayLocalProfile {
  schemaVersion: 1;
  profileId: string;       // UUID; anonymous and browser-local
  createdAt: number;
  updatedAt: number;
}
```

`profileId` is used for export provenance and future sync correlation only. It must not
be presented as a user account, sent to a backend, or connected to Leatherback data.
Existing profiles receive one lazily on first read and retain it thereafter.

## Export envelope

Export uses a separate envelope version from each store’s schema version:

```ts
interface RelayLearnerExport {
  format: "relay-learner-state";
  formatVersion: 1;
  exportedAt: number;
  sourceProfileId: string;
  state: {
    progress: unknown;
    practice: unknown;
    activity: unknown;
    cases: Record<string, unknown>;
  };
}
```

The implementation should use concrete domain types rather than `unknown` in code.
The file must be JSON, human-readable enough for support/debugging, and limited in
size before parsing or writing.

## Import contract

Import is a staged operation:

1. Read the selected file without mutating application state.
2. Parse JSON and validate the top-level format, version, payload shape, IDs, and size.
3. Load the current local state and create an exact raw-key snapshot of every learning
   key that may be changed. The snapshot is held in memory for the duration of the
   operation and is never treated as an export of payment drafts or preferences.
4. Merge each state domain using the rules below.
5. Persist the merged state through the same versioned save functions.
6. If any required write fails, restore the exact raw-key snapshot and report whether
   recovery succeeded. This is rollback, not a transactional localStorage guarantee.
7. Return a result containing counts of imported, retained, ignored, and rejected items.

Malformed, unsupported, oversized, or partially invalid files must be rejected before
step 3. A valid file containing one invalid optional record may retain valid records
only if the UI clearly reports that partial import behavior; the default should be
strict rejection for the first version.

## Merge rules

- **Module progress:** union known completed module IDs. An import can never make a
  completed module incomplete; unknown IDs are ignored and reported.
- **Case sessions:** merge by case ID. Select the newest valid session using its
  `updatedAt` value. Preserve the current local `profileId`.
- **Practice:** merge completed history with stable deduplication, retain the greatest
  `bestStreak`, use the latest valid practice day, and reconcile missed/review items
  by newest valid state. Preserve existing caps.
- **Activity:** combine entries, deduplicate by a deterministic signature of type,
  label, and timestamp, sort newest-first, and enforce the existing cap of 20.
- **Preferences and payment drafts:** are not part of the v1 export/import contract;
  local values remain untouched by restore.

### Practice merge detail

Practice data has no per-record timestamp today, so the first version must use
deterministic rules rather than pretending to know which browser copy is newer:

- history duplicates are exact matches on `day`, `correct`, and `total`;
- `bestStreak` is the maximum of both states;
- `lastPracticeDay` is the later valid day, with the `streak` from the state that owns
  that day;
- missed questions are merged by `questionId`, keeping the higher `misses` value and
  the later `dueDay` when the values conflict.

These rules preserve learning signals without inventing additional drill attempts.

## Import recovery boundary

The adapter must explicitly discover only learning keys:

- fixed keys for `relay:progress`, `relay:practice`, and `relay:activity`;
- keys beginning with `relay:case-session:` for case sessions;
- no `relay:draft:` or `relay:preferences` keys.

Before the first write, capture each affected key as `{ key, rawValue }`, including a
missing-key marker. On failure, restore each key to its original raw value or remove it
when it was originally absent. If restoration itself fails because storage is denied or
full, stop retrying, preserve the in-memory error details, and show the learner that
manual recovery is required. The UI must not claim the import succeeded in that state.

If browser storage is unavailable when the profile is created, Relay may continue in a
session-only mode, but the UI must say that progress will not survive closing the tab.

## User experience

Add a clearly labeled “Your learning data” surface, preferably from Overview or a
small Relay settings area:

- Show that learning progress is saved on this device without an account.
- Show the anonymous profile state without exposing a confusing technical ID by
  default.
- `Download learning backup` starts a JSON export containing progress, practice,
  activity, and case sessions only.
- `Restore from backup` opens a file picker, previews what will merge, and requires
  confirmation.
- Show success and failure states, including when browser storage is unavailable or
  quota is exceeded.
- Offer a local “undo restore” path using the pre-import snapshot.

The UI should not imply that export/import is cloud sync. Copy should say “this
browser/device” and explain that account sync is not available yet.

## Backward compatibility and migration

- Keep the current storage keys and wrappers as the first implementation target.
- Add adapters for legacy progress and any older case/session shapes already supported
  by the existing stores.
- Treat corrupt or unsupported individual keys as empty through current safe-load
  behavior, but surface an export/import warning when the aggregate operation sees
  them.
- Do not migrate all data into a new monolithic key until there is a demonstrated need.

## Testing requirements

Unit tests should cover:

- profile creation, persistence, and non-regeneration;
- export round-trip across every included state domain;
- rejection of malformed, unsupported, oversized, and invalid-record files;
- each merge rule, including newer-versus-older case sessions;
- practice streak/history reconciliation and activity caps;
- failed writes and rollback behavior;
- rollback restoration failure and the session-only storage-unavailable state;
- legacy local keys remaining readable after adapter introduction.

Browser verification should cover a fresh profile, an existing profile, export/import
on the same browser, import into a second browser profile, canceling an import, and
storage quota/unavailable failure messaging.

## Implementation phases

1. Introduce typed aggregate models, profile metadata, and read adapters over current
   stores.
2. Implement pure validation and merge functions with tests.
3. Implement export and import service with backup/rollback behavior.
4. Add the learner-data UI and accessible feedback states.
5. Run regression tests and browser verification across Learn, Overview, and Operate.
6. Update README and roadmap to describe anonymous local persistence and learning-state
   portability. Document that payment drafts and preferences are not included.

## Open decision intentionally deferred

The exact Relay account and sign-in method remains outside this phase. The adapter
boundary is designed so a future sync implementation can be added without making
anonymous learners create an account today.
