# Project Status README Update Implementation Plan

> **For agentic workers:** This documentation-only plan is executed inline in the current session. Steps use checkbox (`[ ]`) syntax for tracking.

**Goal:** Make the root README an accurate handoff document for the current Relay project state and the next syllabus work.

**Architecture:** Keep the root README as the first-stop project status page. Link the implementation source files rather than duplicating lesson logic, and separate shipped functionality, verified health, and open curriculum decisions.

**Tech Stack:** Markdown, FastAPI/Python, React/TypeScript/Vite, Vitest, Playwright.

## Global Constraints

- Documentation-only change; do not alter application behavior.
- Use repository evidence current on 2026-08-09 and avoid stale test counts.
- Treat `frontend/src/features/learn/curriculum.ts` as the syllabus order/prerequisite/outcome source of truth.
- Preserve the simulation-only safety boundary and legacy `/learn`/`/ui` migration context.

---

### Task 1: Refresh project status and verified health

**Files:**
- Modify: `README.md`

- [x] Record current product status, commit/date context, test results, E2E matrix, build budget, and endpoint count.
- [x] Explain the parallel Vitest timeout separately from the passing serial verification mode.
- [x] Remove claims that are contradicted by the current repository state.

### Task 2: Add syllabus handoff guidance

**Files:**
- Modify: `README.md`

- [x] Describe the 13-entry curriculum (12 learning modules plus capstone) and the case-first entry point.
- [x] Link the curriculum definition, lab registry, parity contract, lab content, tests, and roadmap.
- [x] List the concrete next syllabus decisions and recommended starting order.

### Task 3: Verify the documentation against the repository

**Files:**
- Verify: `README.md`

- [x] Re-read the edited sections.
- [x] Confirm the README paths, module count, route names, and verified command results match the source tree.
- [x] Confirm the targeted documentation changes preserve unrelated worktree edits.
