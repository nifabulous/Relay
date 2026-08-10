# Case Desk Expansion and Honest Module Durations

**Date:** 2026-08-09  
**Status:** Design approved in conversation; written-spec review pending

## Problem

Relay Learn currently exposes one Customer Case Desk and its evaluator contains
Canada-to-US/USD-specific assumptions. The project needs three additional case
desks without duplicating the case workflow or allowing the grader to infer a
recommendation from fragile text keywords.

The curriculum also presents exact durations such as `12 min` and `15 min`.
Those values are authored guesses, not measured completion times, and are
misleading for interactive modules with different reading and checkpoint loads.

## Goals

- Add three playable, persisted Case Desk scenarios using the existing workflow:
  - UK → Eurozone supplier payment
  - Nigeria → UK contractor payment
  - US → Mexico urgent vendor payment
- Make case routing and grading catalog-driven rather than hardcoded to one
  corridor.
- Preserve the existing Canada → US supplier experience and its tests.
- Make investigation load-bearing in every case: requestable facts must be
  requested before they can support a recommendation.
- Replace exact module durations with honest self-paced ranges shown everywhere
  the duration is presented.
- Keep all new scenario data explicitly fictional and educational.

## Non-goals

- No live payment execution, bank integrations, or external data enrichment.
- No new progression rules between Case Desks.
- No learner analytics or telemetry-based duration measurement in this change.
- No redesign of the Case Desk interaction model beyond catalog selection and
  clearer case cards.
- No claims that synthetic routes are universal operating rules for real banks.

## Design

### 1. Catalog as the single case registry

`caseCatalog.ts` will export:

- the existing `supplierCase` for compatibility;
- three new `CaseDefinition` values;
- `CASE_CATALOG`, an ordered readonly array used by both the Learn index and
  the route;
- `getCaseById(caseId)`, the shared lookup used by the route and Case Desk.

`CaseId` becomes a string-compatible case identifier while the catalog remains
the runtime authority for which IDs are valid. Transfer IDs also become
generic strings rather than Canada-specific literal types.

Each new definition contains:

- a short card summary separate from the full customer request;
- a short customer request with a fictional organization and amount;
- a case content revision used to invalidate only stale drafts for that case;
- supplied context facts for country, currency, amount, timing, and beneficiary
  details;
- only the investigation facts that materially change the decision;
- three authored rail options with eligibility, required facts, reasons, and a
  worked explanation;
- a case-specific preferred rail and priority signal mapping;
- synthetic source claims with a simulation-only scope.

The three preferred teaching outcomes are:

| Case | Main trade-off | Preferred teaching rail |
| --- | --- | --- |
| UK → Eurozone | instant value versus lower-cost standard settlement | SEPA Instant |
| Nigeria → UK | reliable cross-border delivery and visibility versus cost | SWIFT |
| US → Mexico | urgent delivery and confirmation versus batch/local constraints | SWIFT wire |

The final rail names and copy will make clear when a route is a simulation
choice, especially for the Nigeria and Mexico local-payout examples. The UI
will not imply that every bank supports the same route.

### 2. Authored evaluator rules

`CaseDefinition` will carry a small, serializable recommendation profile rather
than executable functions. The profile will identify:

- the preferred rail ID;
- which fact IDs represent urgency, tracking, and cost sensitivity;
- the corridor/currency wording used in learner-facing outcomes.

The exact shape will be:

```ts
interface CaseRecommendationProfile {
  preferredRailId: string;
  priorityFactIds: {
    urgency?: string;
    tracking?: string;
    cost?: string;
  };
  corridorLabel: string;
  paymentLabel: string;
}
```

`RailOption` will carry serializable eligibility rules and fit tags:

```ts
interface RailEligibilityRule {
  factId: string;
  operator: "equals" | "includes";
  value: string;
  outcome: "eligible" | "ineligible";
}

interface RailOption {
  // existing authored fields remain
  eligibilityRules?: RailEligibilityRule[];
  fitTags?: Array<"urgency" | "tracking" | "cost">;
}
```

The evaluator will use these authored conditions and tags instead of inspecting
English text for “Canada,” “USD,” or “United States.” A case may omit rules for
a rail that is always eligible within that case; an explicit ineligible rule is
used when the learning gradient needs to show a tempting but invalid choice.

Priority matching will use authored rail tags, not regexes over reason copy.
This keeps educational wording editable without silently changing grading.

The evaluator contract remains:

- no selected rail → invalid;
- ineligible rail → invalid;
- missing required facts → invalid and direct the learner back to evidence;
- eligible + gathered facts + thin reasoning → possible;
- eligible + gathered facts + substantive reason and customer expectation →
  defensible;
- defensible + authored preferred rail → preferred.

Outcome copy will interpolate the case’s authored corridor and payment context.
The Canada→US outcome wording should remain equivalent to today’s wording.

### 3. Learn index and routing

`LearnIndexPage` will render a “Customer case desks” collection by mapping over
`CASE_CATALOG`. Each card will load its own session key and retain the existing
fresh/resume/completed/under-review behavior.

`CaseDeskRoute` and `CaseDesk` will use `getCaseById`. Unknown IDs will retain the
existing not-found state. Storage remains namespaced by case ID, so progress in
one desk cannot overwrite another desk.

Each definition will also carry its own content revision. The persistence layer
will compare a session with the revision for that case only; adding or revising
another desk will not invalidate an unrelated in-progress session. The existing
Canada revision export remains available for current tests and compatibility.

The three-card Learn index will use a case-specific heading ID such as
`case-entry__title-${caseDef.id}` and reference that ID from `aria-labelledby`.
The card subtitle will use the authored case summary rather than repeating the
same generic sentence for every desk.

The existing Canada case remains first in the list so current learners and
bookmarks keep the same primary entry point.

### 4. Honest duration ranges

`CurriculumModule.duration` will become a range object with minimum and maximum
minutes. The UI will display `Estimated time` as a range, for example
`15–20 min`, in both the curriculum list and module header, including the
accessible label.

The estimates represent a self-paced learner reading the material and
completing required interactions/checkpoints. They exclude optional exploration
and are not presented as measured telemetry.

`formatDuration(range)` will be the single formatting helper. It will render a
single value only when the minimum equals the maximum; otherwise it will render
an en dash range. Both the list and module header will consume that helper, and
the accessible label will say `Estimated time: 15 to 20 minutes` rather than
exposing punctuation as the only distinction.

Initial authored ranges:

| Module | Estimate |
| --- | --- |
| lab-1 | 10–15 min |
| lab-2 | 15–20 min |
| lab-3 | 15–20 min |
| lab-4 | 10–15 min |
| lab-5 | 15–20 min |
| lab-6 | 10–15 min |
| lab-7 | 15–20 min |
| lab-8 | 15–20 min |
| lab-9 | 25–35 min |
| gbp-eur-rails | 25–35 min |
| cad-rails | 20–25 min |
| fees-fx | 15–20 min |
| capstone | 30–45 min |

The data shape will make invalid ranges difficult to author: minimum and
maximum are required, positive, and maximum must be greater than or equal to
minimum.

## Testing and verification

- Add catalog tests for all four cases: unique IDs, valid fact references,
  required facts, source claim metadata, and preferred rail contract.
- Add evaluator tests proving the new cases do not depend on the Canada/US
  corridor and that each preferred rail reaches `preferred` only after the
  required investigation.
- Add route/index tests proving all catalog cases render, link to unique paths,
  persist independently, and produce unique accessible heading IDs.
- Update duration tests and add a range-formatting test for list, module header,
  and accessible label, plus validation that every authored range is positive
  and ordered.
- Run the complete frontend test suite and production build.
- Open the Learn index and each new Case Desk in the dev server and check the
  brief, investigation, recommendation, resolve, and mobile layout paths.
- Confirm there are no new browser console errors.

## Rollback

The change is isolated to the frontend case catalog, evaluator, case routing,
curriculum metadata, and their tests. Reverting the implementation restores the
single-case registry and exact-duration display. Existing local sessions are
namespaced by case ID and are not deleted by this work.
