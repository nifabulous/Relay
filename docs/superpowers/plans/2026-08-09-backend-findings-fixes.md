# Backend Findings Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the frontend with backend semantics for routing, progress, fee simulation, and SSI data.

**Architecture:** Keep `/api/route` as a ranked-candidate response and replace serial route graphics in downstream screens with candidate summaries. Align the progress service with the current frontend curriculum, pass a deterministic illustrative fee chain from the standalone fee tool, and label SSI seed data as simulated.

**Tech Stack:** React, TypeScript, Vitest, FastAPI, Pydantic, pytest.

## Global Constraints

- Preserve simulation disclaimers; no UI may imply a real payment decision.
- Do not treat ranked route suggestions as confirmed sequential hops.
- Preserve existing unrelated worktree changes.

### Task 1: Correct Prepare Payment and Capstone routing presentation

**Files:**
- Modify: `frontend/src/features/operate/prepare/PreparePaymentPage.tsx`
- Modify: `frontend/src/features/operate/prepare/PreparePaymentPage.css`
- Modify: `frontend/src/features/learn/labs/CapstoneContent.tsx`
- Test: existing Prepare/Capstone tests plus new assertions in their test files.

- [x] Write failing tests asserting heuristic route responses render candidate wording and no `PaymentRoute` image.
- [x] Run the focused tests and confirm the expected failures.
- [x] Replace serial route graphics with candidate summaries and clear heuristic copy.
- [x] Run focused tests and confirm they pass.

### Task 2: Align backend progress IDs with the current curriculum

**Files:**
- Modify: `app/services/progress.py`
- Modify: `app/routers/progress.py`
- Modify: `frontend/src/features/overview/badgeIds.ts`
- Test: `tests/test_progress.py`, `frontend/src/features/overview/badgeIds.test.ts`.

- [x] Write failing tests for the 13 current curriculum IDs and current next-module behavior.
- [x] Run backend and frontend progress tests and confirm failures.
- [x] Use the current frontend module IDs as the backend catalogue and map the composite Fees & FX module once.
- [x] Update badge requirements and progress documentation to the current curriculum.
- [x] Run focused tests and confirm they pass.

### Task 3: Wire the standalone Fee Calculator to an illustrative chain

**Files:**
- Modify: `frontend/src/features/operate/tools/FeePage.tsx`
- Modify: `frontend/src/features/operate/tools/FeePage.test.tsx` or the existing tool test file.

- [x] Write a failing test asserting the request includes the displayed illustrative intermediary BICs and names.
- [x] Run the focused test and confirm the failure.
- [x] Add a small fixed illustrative chain to the tool request and label it as simulated.
- [x] Run focused tests and confirm the response renders non-zero hops when appropriate.

### Task 4: Correct SSI wording and backend documentation

**Files:**
- Modify: `frontend/src/features/learn/labs/Lab5Content.tsx`
- Modify: `app/routers/ssi.py`
- Test: `frontend/src/features/learn/labs/Lab5Content.test.tsx`, `tests/test_disclaimers.py` if needed.

- [x] Write failing copy assertions for simulated SSI wording.
- [x] Run the focused test and confirm the failure.
- [x] Replace “real/live SSI data” language with “simulated/seeded SSI record” language while retaining the disclaimer.
- [x] Update the endpoint docstring to distinguish curated records from production SSI.
- [x] Run focused tests and the full verification suite.
