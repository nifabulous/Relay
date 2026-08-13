# Relay Telemetry and Learner Research Design

> **Status:** Draft for review
> **Date:** 2026-08-12
> **Scope:** Review-fix closeout, provider-neutral Relay instrumentation, and Case Desk learner research
## Goal

Make the current review fix part of the maintained branch, establish a privacy-first analytics contract that can be connected to PostHog later without changing learning features, and give the team a repeatable research protocol for evaluating the five Case Desk scenarios before adding more content.

## Context

Relay already has two separate telemetry paths:

- The legacy `/learn` surface stores five event types in localStorage and posts them to `/api/telemetry` for per-batch metric calculation.
- The React Relay surface records learner progress, practice, and Case Desk state locally, but does not emit a shared analytics event stream.

This design does not merge the legacy and Relay storage formats. It defines a typed Relay event contract and an adapter boundary so a later PostHog integration is a transport change, not a product-wide rewrite. The existing legacy endpoint remains backward compatible.

## Architecture

The Relay frontend emits typed events through a small analytics module:

```text
React feature
    ↓
track(eventName, properties)
    ↓
Analytics sink boundary
    ├─ default: no-op production sink until a provider is configured
    ├─ test sink: captures events for unit/integration tests
    └─ future: PostHog adapter
```

The default sink must not make network requests. This keeps the first implementation safe to deploy before a provider, consent copy, retention policy, and data-processing agreement are approved. A development-only inspection hook may expose the last in-memory events through a test-injected sink; events must not be persisted in learner backups.

## File map

- Modify `tests/test_data_consistency.py` to retain the settlement-directory name invariant.
- Modify `README.md`, `ROADMAP.md`, and `ENGINEERING_ROADMAP.md` only where verification counts or next-focus links are stale.
- Create `frontend/src/lib/analytics/analytics.ts` and its test file for the closed event contract, sink boundary, and test sink.
- Modify `frontend/src/app-shell/App.tsx` for the app-view event, `frontend/src/features/learn/LearnModulePage.tsx` and `frontend/src/features/learn/useLabCompletion.ts` for module/checkpoint events, `frontend/src/features/learn/practice/PracticePage.tsx` for practice events, and `frontend/src/features/learn/cases/CaseDesk.tsx` for Case Desk events.
- Keep `app/services/telemetry.py`, `app/routers/telemetry.py`, and `app/static/js/telemetry.js` backward compatible; they are the legacy surface and are not silently converted to the Relay event schema.

## Event contract

All event names and properties are a closed TypeScript event API. Object literals with unknown properties are rejected at compile time, and runtime sinks receive only events constructed through this API; `track` does not accept arbitrary payloads.

| Event | Required properties | Meaning |
|---|---|---|
| `app_viewed` | `surface` | Relay shell became visible |
| `module_viewed` | `module_id` | A curriculum module page was rendered |
| `module_started` | `module_id` | Learner entered an incomplete module |
| `module_completed` | `module_id` | All required checkpoints were completed |
| `checkpoint_reached` | `module_id`, `checkpoint_id` | A required checkpoint was reached |
| `question_answered` | `surface`, `question_id`, `correct`, `attempt_index` | A multiple-choice or practice answer was submitted |
| `practice_started` | `question_count` | Daily practice drill began |
| `practice_completed` | `question_count`, `correct_count` | Daily practice drill finished |
| `case_started` | `case_id` | Case Desk moved out of the brief phase |
| `case_phase_entered` | `case_id`, `phase` | Case Desk entered investigate, recommend, resolve, or debrief |
| `case_action` | `case_id`, `action` | A bounded research action occurred, such as requesting evidence, opening references, or submitting a recommendation |
| `case_completed` | `case_id`, `outcome` | Case Desk reached its terminal debrief state |

Allowed property values are identifiers from authored catalogs or small enums. No event properties may contain names, account numbers, message text, customer explanations, free-form notes, raw URLs, or full state snapshots. The envelope's `name` discriminator is the approved event identifier. `question_id`, `checkpoint_id`, and `case_id` are authored synthetic identifiers, not personal data.

An ephemeral random session token may be generated in memory to group events from one browser session. It is not written to localStorage, exported in backups, or treated as a user account identifier. The first implementation may omit the token from the default sink; the event interface must leave room for it so the PostHog adapter can add session-scoped grouping later.

## Instrumentation points

### Module funnel

`LearnModulePage` emits `module_viewed` when `mod?.id` changes and emits `module_started` once when that module is incomplete. This handles route reuse as well as a fresh mount: each module entry is observable, while a missing module emits nothing. Its existing `completeModule` callback emits `module_completed` once, alongside the current local progress and activity writes. `useLabCompletion` remains the source of truth for completion; analytics must not create a second completion state machine. “Once” means once for a given module entry/action transition, not once forever across reloads; repeated visits are intentionally observable.

Each accepted checkpoint emits `checkpoint_reached` once. Extend `useLabCompletion` with an optional `onCheckpointReached(id)` callback and invoke it only after the required-set guard accepts a new checkpoint (`requiredSet.has(id)` and the previous set does not already contain it). Keep the latest callback in a ref and report newly accepted IDs from an effect, rather than performing the callback as a state-updater side effect. This preserves the hook as the completion source of truth and keeps analytics out of individual UI controls.

### Practice funnel

`PracticePage` emits `practice_started` when the learner clicks the start button, `question_answered` after each selected option, and `practice_completed` when the drill is persisted. The event uses question IDs and correctness only; it does not include option labels or explanations.

### Case Desk research funnel

`CaseDesk` emits `case_started` on the `start` transition, `case_phase_entered` on phase changes, `case_action` for bounded reducer actions (`request-facts`, `open-reference`, `edit-draft`, `send-recommendation`, `complete-transfer`, and `restart`), and `case_completed` when the debrief becomes terminal. Each event represents one accepted discrete interaction. `edit-draft` is a coarse, deduplicated event emitted on blur or submit, never on each keystroke; the draft patch handler itself remains uninstrumented. Opening the references sheet emits one `open-reference` action even if the reducer loops over several disclosed facts. Draft text is never included. The action enum is deliberately coarse enough to support observation without recording the learner's prose reasoning.

### App entry

The Relay shell emits `app_viewed` once per `App` mount/page-view boundary. This event is a denominator for the module and Case Desk funnels; it is not a login or identity event. Provider adapters may deduplicate page-view events if their SDK runs under development-only remount behavior; tests reset the analytics sink between mounts.

## Privacy and governance constraints

- No account system, email, IP address, fingerprint, or persistent learner ID is introduced.
- No event is included in the existing learner backup JSON.
- The default sink is no-op and never sends network traffic.
- A future PostHog adapter must be opt-in at deployment configuration level, document retention and deletion behavior, and preserve the closed event/property contract.
- Research participants must receive a short consent statement before any external recording or telemetry collection. Declining must not block use of Relay.
- Research notes must use participant codes such as `P01`, never names or customer data.

## Metrics enabled by the contract

Once a sink is connected, the following metrics can be derived without collecting content:

- App-to-module-start rate: `module_started / app_viewed`.
- Module completion rate: `module_completed / module_started`, by module.
- Checkpoint friction: answer attempts and correctness by module/checkpoint.
- Practice return and learning signal: practice starts, completions, and correctness rate by question ID.
- Case Desk task completion: case starts, phase transitions, terminal outcomes, and action sequences.
- Drop-off: last observed module/case phase in a session that has no terminal event.

The first implementation does not claim that correctness equals mastery. It provides behavioral instrumentation; learning-outcome claims require research or an assessment design decision.

## Learner-research protocol

### Research question

Can a learner use the Case Desk evidence flow to choose a defensible rail, explain the decision in their own words, and transfer the reasoning to a new payment scenario without being coached through the answer?

### Participants

Recruit 5–8 participants across two target groups:

1. Fintech engineers or product managers who understand software but are not payment specialists.
2. Payment operations learners who know basic payment terms but are new to Relay's evidence-led workflow.

Do not recruit real customers or use real account/payment data. Each session is 30–45 minutes. Screen recording and external notes require explicit consent; the product remains usable without consent.

### Session flow

1. Give the participant the neutral instruction: “Use Relay to decide how this payment should be handled. Think aloud, but do not search for the answer externally.”
2. Let the participant complete one assigned case without intervention.
3. Ask the participant to explain the decision, the evidence they trusted, and what would make them stop or escalate.
4. Give a transfer prompt using the case's authored transfer variant where available, without showing the prior recommendation.
5. Repeat with a second case from a different corridor if time permits.
6. End with a five-minute debrief about unclear labels, missing evidence, confidence, and what they expected the system to do next.

### Case coverage

Use the five authored cases as the first research set:

| Case ID | Transfer decision to observe |
|---|---|
| `canada-us-supplier` | Distinguish domestic Interac, cross-border ACH, and SWIFT/Fedwire for an urgent USD supplier payment |
| `uk-eurozone-supplier` | Select the appropriate EUR rail for a UK-to-Eurozone supplier payment |
| `nigeria-uk-contractor` | Choose between a local GBP collection route and a SWIFT fallback |
| `us-mexico-vendor` | Reject domestic-only options and choose a viable Mexico route under the stated needs |
| `us-nigeria-family-support` | Prefer an IMTO NGN payout when the destination currency and family-remittance context make a USD wire a poor fit |

### Observation rubric

Score each session with evidence, not impressions:

- **Task success:** chose the authored preferred rail without a hint.
- **Evidence use:** requested or cited at least two relevant facts before deciding.
- **Reasoning transfer:** made the right choice on the transfer prompt or identified the changed constraint.
- **Confidence calibration:** could name one uncertainty or condition that would change the recommendation.
- **Usability friction:** observed confusion, dead ends, repeated actions, or unexplained terminology.

Record one short quote or behavior example per rubric item. Keep the raw research notes separate from analytics events; analytics cannot capture reasoning quality by itself.

### Synthesis template

After each session, record:

```text
Participant: P__    Case(s): ____    Researcher: ____

Task success: pass / partial / fail
Evidence used: ____
Transfer result: pass / partial / fail
Confidence calibration: ____
Observed friction: ____
Most important quote or behavior: ____
Recommended product change: ____
Severity: blocker / important / polish
```

Prioritize changes observed in at least two sessions or changes that block a participant from completing the decision. Do not add a new Case Desk scenario until the existing five have been observed and the top recurring friction has an owner.

## Implementation boundaries

### Included

- Restore the settlement-directory `bank_name` invariant and update stale verification counts in project docs.
- Add the typed Relay analytics contract, default sink, test sink, and instrumentation at the points above.
- Add unit/integration tests proving event names, property allowlists, once-only semantics, and absence of sensitive fields.
- Add this research protocol and a short README/roadmap pointer.

### Deferred

- PostHog SDK installation or deployment configuration.
- Server-side event persistence or an instructor dashboard.
- Consent UI beyond the research-session protocol.
- Automated mastery scoring, learner segmentation, or personalized recommendations.
- Additional Case Desk content.

## Acceptance criteria

1. The review fix is committed and the documented test counts match a fresh local run.
2. Every listed Relay funnel event is emitted from the stated source of truth and duplicate renders do not duplicate once-only events.
3. TypeScript rejects unknown event names and unapproved object-literal properties at compile time.
4. Tests demonstrate that event payloads contain no free text, account values, names, or full learner state.
5. The default analytics sink performs no network request and learner backup exports remain unchanged.
6. The five-case research protocol can be run by another researcher using only the authored case catalog and the rubric above.
7. Backend, frontend, lint, build, and diff checks pass.
