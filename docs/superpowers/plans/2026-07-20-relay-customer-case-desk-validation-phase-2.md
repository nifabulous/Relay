# Relay Customer Case Desk — Phase 2 Expansion Plan

> **For agentic workers:** Implement this plan only after Phase 1 observed research confirms the Case Desk resembles real work and identifies repeatable behavior across learners.

**Goal:** Expand the proven supplier-payment vertical slice into a two-case research release without introducing abstractions that Phase 1 did not validate.

**Prerequisite:** `docs/superpowers/plans/2026-07-20-relay-customer-case-desk-validation.md` is implemented, tested, and reviewed with observed evidence from the first learner cohort.

## Deferred scope

- Canadian collection and receipt case covering Interac Request Money, ordinary receipt, Autodeposit, and Canadian EFT.
- Optional research consent, learner-visible export, withdrawal, and deletion.
- Facilitator, observation, interview, and consent materials.
- Delayed contrast retention case and unguided Round 2 validation.
- Shared case units extracted only from behavior repeated across the two cases.

Do not add accounts, cross-device sync, badges, dashboards, missing curriculum tracks, or additional rails without a separate demand decision.

## Tasks

### Task 1: Author and test the Canadian collection case

- Add the case definition and source claims to `frontend/src/features/learn/cases/caseCatalog.ts`.
- Add evaluator fixtures for Request Money, ordinary Interac receipt, Autodeposit, and Canadian EFT.
- Add tests for initiator, authorization, timing, fees, cancellation/dispute considerations, and evidence availability.
- Verify that the existing Case Desk can render the second case without changing Phase 1 behavior.

### Task 2: Add research consent and learner-visible data controls

- Create `ResearchConsent.tsx`, `ResearchExport.tsx`, and focused tests.
- Store consent separately from case progress.
- Export first attempt, revision, hints, references, and timestamps only after consent.
- Support withdrawal, explicit deletion, and a clear local-data boundary.

### Task 3: Add retention and unguided validation flows

- Add the delayed contrast case with reduced scaffolding.
- Record supported performance, independent transfer, retention, and qualitative demand signals separately.
- Add E2E coverage for return visits, declined consent, export failure, deletion, and stale research data.

### Task 4: Prepare and run observed research

- Create facilitator and observation documents under `docs/research/`.
- Run five-person Round 1 with silent facilitation except for safety, consent, or technical failure.
- Review repeated interaction and misconception patterns before extracting shared components.

### Task 5: Decide whether to extract or stop

- Extract shared case units only when both cases demonstrate repeated structure.
- Expand to Round 2 only if learners independently start, complete, return, share, request another case, or describe a concrete work use.
- Stop expansion if the experience is mostly used as a static reference or requires facilitation to begin.
