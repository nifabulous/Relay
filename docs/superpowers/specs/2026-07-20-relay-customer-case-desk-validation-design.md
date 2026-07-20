# Relay Customer Case Desk Validation Design

**Status:** Approved
**Date:** 2026-07-20
**Mode:** Open-source education first, with commercialization earned through user pull
**Target release:** Research prototype, not a complete curriculum rewrite

## Problem Statement

Relay contains strong interactive payments content, but it has no external users and no evidence that its current concept-led curriculum solves a sufficiently important learner problem. Expert reviews found domain inaccuracies, progress and badge inconsistencies, incomplete curriculum promises, and assessment checkpoints that often measure interaction rather than comprehension. Fixing the entire backlog would improve the artifact without proving that anyone needs it.

The first concrete learner, Marvellous, is a payment-system account manager with approximately one to two years of experience. Her questions are job decisions rather than academic topics:

- When should a customer use ACH, Fedwire, or a SWIFT-enabled cross-border route?
- What is the difference between Interac e-Transfer and Canadian EFT?
- What do Interac Request Money and Autodeposit do?
- When should a UK customer use Bacs, Faster Payments, or CHAPS?
- How is the appropriate intermediary bank determined?
- What will processing cost, when should funds arrive, and what tracking is actually available?

Relay should therefore test a narrower product thesis:

> A browser-based practice environment where early-career, customer-facing payments professionals investigate realistic customer requests, recommend defensible payment paths, and explain cost, arrival time, traceability, routing, and uncertainty.

The lessons support the scenarios. The scenarios are the product.

## Demand Evidence and Current Stage

Relay is pre-demand:

- No external learner has independently used it.
- No repeat use, retention, sharing, payment, or buyer request has been observed.
- Expert-panel approval demonstrates content and implementation quality, not demand.
- Marvellous is a credible first research participant, not proof of a market.

The next release must reduce demand and curriculum uncertainty rather than maximize feature completeness.

## Target Learner

The initial segment is:

> Early-career, customer-facing payments professionals who must recommend payment methods and explain operational outcomes.

The first research cohort must include both account-management and payments-operations profiles. This prevents Relay from silently treating Marvellous's role as representative of every payments learner.

## Status Quo

Target learners currently combine:

- Internal documentation that describes institution-specific procedures
- Shadowing and escalation to experienced colleagues
- Fragmented web articles, videos, and scheme documentation
- Trial and error during live customer or operational work

Relay competes with this workflow as well as formal SWIFT training, specialist ISO 20022 academies, and inexpensive online courses. “Interactive payments education” is not sufficient differentiation. Safe, realistic decision rehearsal is the wedge to test.

## Product Principles

1. **Organize around customer jobs.** Sending, collecting, receiving, scheduling, routing, and investigating are the curriculum spine. Rails and standards are supporting knowledge.
2. **Measure reasoning, not clicks.** API calls, buttons, and opened references are engagement events. They never prove mastery.
3. **Permit defensible alternatives.** Institution capabilities and customer constraints can make more than one recommendation valid.
4. **Expose uncertainty.** Price, timing, tracking, limits, and routing must distinguish system rules from institution configuration, estimates, assumptions, and unknowns.
5. **Never create a gotcha.** Information is classified as supplied, requestable, or genuinely unavailable. Learners are scored for requesting material facts.
6. **Separate support from mastery.** Hints support learning without penalty. Independent transfer is reported separately.
7. **Use synthetic data only.** No real customer, account, transaction, or employer-confidential data enters the research prototype.
8. **Build evidence before infrastructure.** Two case prototypes and their first observed iteration come before a generic case engine, competency profile, account system, or cohort dashboard.

## Curriculum Model

The long-term curriculum, if validated, consists of customer-job case packs.

### Collect Money

Compare Interac Request Money, ordinary Interac receipt, Autodeposit, Canadian EFT debit, US ACH debit, and UK Direct Debit. Teach who initiates, authorization, receipt mechanics, timing, fees, cancellation or dispute considerations, and available evidence.

### Pay One Person or Supplier

Compare Interac e-Transfer, Canadian EFT credit, ACH credit, Same Day ACH, Faster Payments, and cross-border transfer paths. Change the recommendation through geography, currency, amount, urgency, account access, and beneficiary setup.

### Pay Many People

Compare Canadian EFT batch, supported Interac business or bulk capabilities, US ACH batch, Bacs Direct Credit, and repeated individual real-time payments. Teach scheduling, reconciliation, cost, and scale rather than treating “fastest” as universally best.

### Make an Urgent or High-Value Payment

Compare Fedwire, CHAPS, eligible instant-payment options, Same Day ACH where eligible, Canadian high-value arrangements, and cross-border paths. Teach cut-offs, finality, liquidity, access, price, and consequence of delay.

### Send Money Across Borders

Teach currency and destination, beneficiary reachability, direct and correspondent relationships, authoritative SSI sources, intermediaries, OUR/SHA/BEN, value dates, SWIFT messaging, UETR, and institution-owned investigations.

### Find a Missing Payment

Teach how the rail determines available evidence and investigation ownership. Learners distinguish payment initiation, clearing or settlement, beneficiary credit, rejection, return, cancellation, and lack of confirmation. Relay must not present every transfer as having SWIFT-style tracking.

## Reference Library

Existing concept-led material is decomposed into short, searchable references that open without losing case progress:

- BIC, IBAN, routing number, sort code, and Canadian transit and institution numbers
- ACH credit, ACH debit, Same Day ACH, Fedwire, and US instant-payment concepts
- Interac Send, Request Money, Autodeposit, business services, and Canadian EFT
- Faster Payments, Bacs Direct Credit, Bacs Direct Debit, and CHAPS
- SWIFT messaging, correspondent banking, SSI, and intermediaries
- Fees, OUR/SHA/BEN, cut-offs, value dates, and finality
- Confirmation, tracking, UETR, return, and investigation
- MT and ISO 20022 message concepts

References do not have mastery or completion states. MOD-97 remains an optional technical exercise and is not an early progression gate.

## Information Architecture

Case Desk is the primary experience inside the existing **Learn** workspace. Relay keeps its four top-level workspaces: Overview, Learn, Explore, and Operate. It does not add a fifth Cases destination.

```text
Learn
├── Primary action: Start or resume a customer case
├── Customer cases
│   ├── Canadian collection and receipt
│   └── Canada-to-US supplier payment
├── Reference library
│   └── Searchable payment concepts opened in case context
└── Technical labs
    └── Existing concept-led modules, presented as optional deep dives
```

The Learn landing page shows, in order:

1. One dominant start-or-resume case action.
2. The two available research cases and their simple session state: not started, in progress, or completed.
3. A reference-library entry point.
4. A visually quieter Technical Labs section containing the existing curriculum.

Case completion on this page means the experience was finished. The landing page must not label completion as mastery or certification.

The learner-facing state label is exactly **Completed** and means only that the case experience was finished. The case debrief separately reports decision-quality classifications, supported performance, independent transfer, and retention. Do not use **Passed**, **Mastered**, **Certified**, percentage scores, trophies, or progress visuals that imply a credential.

## Customer Case Desk Interaction

The selected interaction is a scenario-first Customer Case Desk. It has three learner-facing phases.

### Workspace Composition

Desktop and tablet use a focused two-region workspace rather than a dashboard grid:

```text
Case header: case title · phase progress · exit case
┌──────────────────────────────────────┬──────────────────────┐
│ PRIMARY TASK AREA                    │ EVIDENCE RAIL        │
│                                      │ Customer request     │
│ Current phase heading                │ Facts supplied       │
│ One active decision or question      │ Facts gathered       │
│ Contextual feedback                  │ Assumptions/unknowns │
│ One dominant next action             │ Source status        │
└──────────────────────────────────────┴──────────────────────┘
```

- The primary task area receives approximately two-thirds of the available width and contains only the current decision.
- The evidence rail receives approximately one-third, remains visible while the task area scrolls, and contains no competing primary action.
- The customer request is the rail's first and strongest item. Gathered facts are grouped separately from assumptions and unavailable facts.
- References open as contextual secondary content and never replace or reset the active task. Desktop opens a sheet aligned to the evidence side of the workspace; mobile opens a full-height sheet.
- The case header shows location and phase, not mastery, score, badges, or celebratory decoration.

At 390px, the task area becomes full-width. A persistent **Evidence** control shows the number of gathered facts and opens a labelled bottom sheet. The sheet preserves document order, traps focus while open, closes with Escape or an explicit close control, and restores focus to the Evidence control. The current customer request remains visible as a compact summary above the active task so the learner is never required to memorize it.

Reference sheets use the same focus and dismissal contract. Their header shows the concept name, jurisdiction or scope, and verification date. The body stays within a 45–75 character reading measure. Closing returns focus to the exact **Reference** control that opened the sheet. Opening a reference is recorded as supported learning, but it neither changes decision quality nor marks case progress.

### Investigate

1. Show a short role-and-stakes briefing.
2. Capture an ungraded baseline recommendation and confidence.
3. Present facts already supplied by the customer.
4. Allow the learner to request additional facts that would be obtainable at work.
5. Require the learner to construct a candidate shortlist before Relay reveals missed or invalid options.

### Recommend

1. Select a rail or route.
2. State the primary reason through structured reasoning controls.
3. Identify required conditions and material risks.
4. Set qualified expectations for price, arrival, finality, and tracking.
5. Produce an optional free-text customer explanation.

### Resolve

1. Present a concise read-only summary of the learner's recommendation and reasoning.
2. Require an explicit **Send recommendation** action; selection changes before this point do not reveal evaluation.
3. Preserve the first submitted attempt and reveal its decision-quality classification, reasoning feedback, and simulated consequence.
4. Ask the learner to diagnose any failure or mismatch.
5. Allow a clearly labelled revision without overwriting the first attempt.
6. Show a concise worked explanation after the learner has reviewed the consequence.
7. Present a close transfer case without the worked example.
8. Deliver a contrast retention case three to seven days later.

The interface progressively removes scaffolding. Later cases require learners to identify candidate rails and material questions with less prompting.

### Draft, Resume, and Revision

- Persist each material action to the existing versioned local-storage layer: requested facts, shortlist, structured reasoning, references opened, current phase, and optional free text.
- The Learn landing page shows **Resume case** for a valid draft and a secondary **Start again** action with confirmation.
- **Exit case** saves the current draft and returns to Learn without an additional confirmation. **Start again** is a separate, secondary action that opens a confirmation naming the case and the draft state that will be cleared. The preserved first submitted attempt remains available in the research record.
- Restore the exact phase and evidence state after refresh, tab closure, or navigation away.
- Never restore transient loading, open sheets, alerts, or focus position.
- Editing an upstream fact or changing a requested fact invalidates every dependent shortlist, recommendation, and outcome. Explain what was cleared and return focus to the first affected decision.
- Preserve the first submitted recommendation separately from the mutable draft so research evidence cannot be overwritten by later revision.
- A corrupt or obsolete draft is discarded safely. Show: “This draft could not be restored. Start the case again.” with one primary restart action.

### Focus and Announcement Contract

- After a successful phase transition, move focus to the new phase heading or outcome heading and expose the same change through a polite live-region announcement.
- After a recommendation is sent, focus the operational-consequence heading before any secondary classification or revision control.
- When an upstream fact change clears dependent decisions, announce what was cleared, move focus to the first affected decision, and keep the explanation adjacent to that control.
- On validation failure, render a concise error summary at the start of the primary task, link each message to its control, and move focus to the summary. Inline messages remain visible beside their fields.
- Evidence-count changes and sheet open/close events use polite announcements without stealing focus. Sheet focus trapping and restoration continue to follow the contract above.
- Respect `prefers-reduced-motion`; state changes must remain understandable without animation, and focus must never depend on a transition completing visually.

### Control Semantics

- Use a native radio group for selecting one rail or route, with a visible legend and a clearly associated error message.
- Use native checkboxes for selecting multiple facts or evidence requests. Do not encode selection state in clickable cards alone.
- Use native buttons for phase actions, sheet controls, revision, restart, and exit. Buttons must communicate disabled, pending, and completed states without changing their accessible name unexpectedly.
- Use labelled native inputs or textareas for confidence, assumptions, and optional customer explanation. Preserve entered text across validation errors.
- Visual enhancements may style these controls as compact options or rows, but must preserve native keyboard order, focus visibility, accessible names, and pointer target sizes.
- Do not require drag-and-drop, hover, double-click, or pointer-only gestures for any case decision.

### Responsive Breakpoints

- Wide desktop uses the two-region composition: primary task at roughly two-thirds of the available width and an evidence rail at roughly one-third.
- At tablet widths where either region would fall below its minimum readable measure, collapse to the task-first composition. Keep the customer request as a compact summary above the task and expose the evidence rail through the persistent Evidence control and labelled sheet.
- Mobile uses the same collapsed composition and sheet behavior. The breakpoint is defined by minimum content widths and tested at 390px, 768px, 1024px, and 1440px rather than by device labels alone.
- The implementation must not produce horizontal scrolling, clipped controls, or a rail that becomes an icon-only affordance without a text label.

## Assessment Model

Case completion means the learner finished the experience. It is not mastery.

Each decision receives an auditable quality classification:

- **Invalid:** violates supplied constraints or scheme eligibility.
- **Possible but poorly justified:** could work, but the reasoning ignores a material trade-off or assumption.
- **Defensible:** fits the supplied facts and acknowledges material conditions.
- **Preferred:** best fits the stated priorities under the disclosed assumptions.

The debrief reports dimensions separately:

| Dimension | Evidence |
|---|---|
| Information gathering | Requested material missing information |
| Rail eligibility | Excluded options that cannot serve the request |
| Recommendation | Chose an invalid, possible, defensible, or preferred path |
| Operational reasoning | Addressed price, timing, finality, tracking, routing, and risk |
| Customer communication | Gave a clear explanation with qualified expectations |
| Independent transfer | Solved a new close case without assistance |
| Retention | Solved a contrast case three to seven days later |

### Research Consent and Export

- Before the first case, offer an optional, plain-language research consent step describing the purpose, synthetic-data boundary, event categories collected, retention period, and withdrawal path.
- A learner may use every case without consenting. Consent is never required for completion, debrief access, or reference-library access.
- Store consent separately from learning progress. Revoking consent stops future research capture and does not delete the learner's local draft unless they explicitly request deletion.
- Provide a separate export/review action that shows the learner what was recorded, including first attempt, revision, hints, references, and timestamps. Export is not required to finish a case.
- Research events are append-only for the session and must not silently overwrite the learner's mutable draft or first submitted recommendation.

Hints do not reduce a learner's score. They distinguish supported performance from independent transfer. Time spent is recorded for UX diagnosis only and never used as competency evidence.

Free-text responses are manually reviewed during research and do not automatically determine completion or mastery.

## User Journey and Feedback Tone

The Case Desk uses calm operational coaching. It should feel like supervised practice with a respected senior colleague, not a game and not a formal disciplinary audit.

| Step | Learner does | Intended feeling | Interface support |
|---|---|---|---|
| Enter Learn | Sees the next available case | Oriented, not overwhelmed | One dominant start-or-resume action; technical labs remain visually secondary |
| Read the brief | Understands role, customer need, and stakes | Curious with appropriate seriousness | Short brief, explicit synthetic-data label, customer request kept visible |
| Give baseline view | Makes an ungraded initial recommendation | Safe enough to commit | “This captures your starting view; it is not scored” appears beside the action |
| Investigate | Requests facts and builds a shortlist | Increasingly in control | Evidence visibly accumulates; unavailable facts explain why; no answer is pre-highlighted |
| Recommend | Reviews and sends reasoning | Deliberate and accountable | Read-only summary, explicit **Send recommendation**, no correctness cues before commitment |
| See consequence | Learns what the decision would cause | Challenged without shame | Feedback leads with consequence, names the reasoning gap, confirms what was sound, and offers one next action |
| Revise | Applies the feedback | Capable of improvement | First attempt stays visible as history; revision language avoids “You failed” framing |
| Review debrief | Sees what was considered and missed | Clear about current ability | Separate supported performance from independent transfer; no grades, streaks, confetti, or celebratory decoration |
| Return later | Opens the second case without guidance | Recognized and independent | Resume context is brief; the new case does not restate the full tutorial |

Feedback copy follows this order:

1. **Operational consequence:** what this recommendation would likely cause.
2. **Decision quality:** invalid, possible, defensible, or preferred under the disclosed assumptions.
3. **Sound reasoning:** the material considerations the learner handled correctly.
4. **Reasoning gap:** one prioritized issue, not a wall of corrections.
5. **Next action:** revise, inspect one reference, or continue to the debrief.

Decision quality is presented as supporting metadata, not as the feedback headline. Lead with a plain-language operational consequence, then show Invalid, Possible, Defensible, or Preferred in the existing `StatusChip` with both text and an accompanying icon. Semantic color reinforces the state but is never its only signal. Do not create custom success/failure result panels or use chip styling as a substitute for the reasoning explanation.

The first five seconds establish role and stakes. The first five minutes establish that requesting information is part of the job rather than a sign of weakness. The long-term relationship is built through trustworthy sourcing, honest uncertainty, and recognition of improved independent reasoning rather than accumulating points.

## Visual Direction

The Case Desk is an **evidence-led operations workspace**, not a conversational simulation, dashboard grid, or sequence of decorative cards. The learner should recognize one coherent working surface organized around a customer request, an accumulating evidence record, and a recommendation that must be defended.

- Treat the customer request as the visual anchor. Give it clear hierarchy without placing it in an oversized promotional card.
- Use the evidence rail as a structured ledger: supplied facts, gathered facts, assumptions, unknowns, and source status are separated by labels and thin dividers rather than individually elevated cards.
- Keep the active decision visually dominant through spacing, type hierarchy, and one primary action. Avoid nested panels, repeated rounded rectangles, ornamental gradients, glass effects, and decorative shadows.
- Use Instrument Sans for interface and explanatory copy and IBM Plex Mono only for identifiers, amounts, dates, route codes, and other operational data.
- Use the established canvas, ink, action blue, border, and semantic-status tokens from `DESIGN.md`; do not introduce a case-specific color system.
- Use `PaymentRoute` only when route topology materially helps the learner understand a cross-border recommendation or consequence. It must reflect the selected or revealed route and must never serve as decorative filler.
- Do not use chat bubbles, assistant avatars, typing indicators, or generated-looking “AI coach” treatments. Coaching appears as concise contextual feedback attached to the learner's decision.
- Preserve quiet space around the current task. Secondary references and evidence may be available, but they must not compete with the dominant next action.

Visual acceptance test: if the customer request, evidence categories, and active decision were removed, the remaining page should not resemble a generic analytics dashboard. If the same component treatment repeats three or more times, verify that the repetition communicates a real operational structure rather than merely filling the layout.

## Fact and Source Governance

Every material payment claim must record:

- Source URL or repository reference
- Source owner
- Verification date
- Jurisdiction and currency
- Claim scope
- Review-by date

The evidence rail shows a compact source status for every material fact, for example **Verified 2026-07-20 · Canada · Scheme rule**. A labelled **View source details** control opens the contextual reference sheet with the full source, owner, claim scope, verification date, and review-by date. Provenance must be visible at the decision point without repeating the complete metadata block inline.

Claim scope is one of:

- Payment-system or scheme rule
- Operator guidance
- Participating-institution configuration
- Disclosed example assumption
- Simulation-only value

Cases use ranges and explicit assumptions when no universal institution-independent answer exists. Expired claims make the affected case unavailable until reviewed; they are not silently presented as current guidance.

An expired case remains visible on Learn with an **Under review** status. Starting and resuming are disabled. The case explains which jurisdictional facts require review, shows its last verification date, and offers one verified reference or relevant technical lab. Existing drafts remain stored and become resumable only after the case is verified again.

## Interaction State Matrix

| Feature | Initial or empty | Loading or pending | Error or unavailable | Success | Partial or recovery |
|---|---|---|---|---|---|
| Learn case list | Two authored cases with not-started status | Stable skeleton matching title, purpose, and action layout when state is being restored | Under-review case remains visible with reason, verification date, and safe alternative | Shows one dominant start-or-resume action and quiet state labels | Corrupt draft offers one restart action without affecting the other case |
| Case draft | Role, stakes, supplied facts, and one obvious first action | Local saves do not block interaction; a brief saved status appears without stealing focus | Restore failure states that the draft could not be recovered and offers **Start case again** | Exact phase, evidence, and editable draft return after navigation or refresh | Upstream edits explain which dependent decisions were cleared and focus the first affected field |
| Fact request | Supplied, requestable, and unavailable facts are visually distinct but unrevealed answers are not preselected | Live enrichment, when used, marks only the requested fact as checking | Specific failure explains that authored case facts remain safe; unavailable facts explain why they cannot be obtained | Requested fact moves into gathered evidence and is announced through a polite live region | Institution-dependent information displays its scope and assumption instead of pretending to be universal |
| Rail shortlist | Search or browse prompt with no recommended rail pre-highlighted | Search results use stable rows rather than a full-page spinner | No match suggests checking spelling or opening the rail directory; expired rail facts cannot be added | Added candidates appear in a reviewable shortlist with remove actions | Invalid candidates remain visible after evaluation with the exclusion reason; missed candidates appear only after commitment |
| Contextual reference | Closed by default; opening control includes the concept name | Reference skeleton preserves heading and reading measure | Missing or expired reference states what is unavailable and returns to the case safely | Sheet shows concept, scope, source owner, and verification date | Closing restores focus and preserves every case answer |
| Recommendation | Editable structured draft with no correctness cues | **Send recommendation** becomes disabled and announces evaluation in progress | Evaluation failure preserves the full draft and offers retry; no first attempt is recorded until evaluation succeeds | First attempt receives invalid, possible, defensible, or preferred feedback plus consequence | Revision is clearly separated and never overwrites the preserved first attempt |
| Outcome and debrief | Hidden until the first recommendation is committed | Consequence region uses a stable pending state if enrichment is required | Missing enrichment is labelled; authored reasoning and safe debrief remain available | Shows decision quality, consequence, what was considered, what was missed, and one next action | Supported and independent performance remain separate; uncertainty categories remain visible |
| Research consent/export | No research events leave the device before consent | Export action shows progress without blocking case review | Failure states that data remains local and offers retry or deletion | Confirms exactly what was exported and offers deletion | Declining telemetry leaves the full learning experience available |

## Research Prototype Scope

The prototype contains two cases, not a complete curriculum.

### Prototype Case A: Canadian Collection and Receipt

A small Canadian business wants to request and receive a customer payment. The learner must distinguish Interac Request Money from sending an e-Transfer, explain Autodeposit and the non-Autodeposit receipt path, identify institution-dependent fees and limits, and distinguish notification or bank support from universal transaction tracing.

### Prototype Case B: Canada-to-US Supplier Payment

A Canadian business wants to pay a US supplier in USD with stated urgency, cost sensitivity, and tracking needs. The learner must determine whether domestic US rails are directly accessible, identify when a cross-border route and intermediary may be involved, obtain valid settlement instructions, qualify fees and arrival, and distinguish UETR tracking from beneficiary credit confirmation.

### Deferred Until Observed Patterns Stabilize

- US ACH, Same Day ACH, and Fedwire case
- UK Bacs, Faster Payments, and CHAPS paired case
- Missing-payment retention case
- Reusable case-package engine
- Persistent competency profile
- Automated free-text grading
- Accounts and cross-device synchronization
- Instructor or cohort dashboard
- Badges and certificates
- Sanctions, FX, reconciliation, and returns tracks

## Prototype Technical Approach

Use existing React, design-system, API, and Learn components to implement the first two cases directly. Do not first build a universal case schema or runtime.

## What Already Exists

The implementation should extend the current frontend rather than introduce a parallel shell or visual language:

| Existing asset | Reuse in the prototype |
|---|---|
| `frontend/src/app-shell/AppShell.tsx` and `AppShell.css` | Keep the four-workspace shell, navigation, responsive frame, and global focus behavior |
| `frontend/src/features/learn/LearnPage.tsx` and `LearnPage.css` | Add the case-first Learn landing order and neutral case states |
| `frontend/src/features/learn/LearnModulePage.tsx` | Reuse the module/page composition patterns for brief, debrief, and optional technical deep dives |
| `frontend/src/design-system/Button.tsx` | Use for all primary, secondary, sheet, exit, restart, and revision actions |
| `frontend/src/design-system/AsyncRegion.tsx` | Provide loading, error, unavailable, and recovery states for evidence and reference content |
| `frontend/src/design-system/StatusChip.tsx` | Render source status and decision-quality metadata with text and icon |
| `frontend/src/design-system/payment-route/PaymentRoute.tsx` | Render only materially useful cross-border route topology |
| `frontend/src/design-system/tokens.css` and `global.css` | Keep typography, spacing, color, focus, target-size, and reduced-motion tokens from `DESIGN.md` |
| `frontend/src/features/learn/useLabCompletion.test.tsx` and existing telemetry services | Adapt event naming and completion semantics without treating engagement as mastery |

Introduce only the case-specific units required by observed flows: `CaseDesk`, `EvidenceRail`, `ReferenceSheet`, `FactRequest`, `RailShortlist`, `RecommendationSummary`, and `CaseDebrief`. Each should have focused tests and use the existing primitives. Do not duplicate `Button`, `StatusChip`, `AsyncRegion`, navigation, or token definitions.

After both cases have been observed and revised, extract only proven common units:

- Role and stakes briefing
- Fact inventory and fact requests
- Learner-created rail shortlist
- Structured recommendation form
- Consequence and uncertainty presentation
- Worked explanation
- Session debrief

The later case-package contract must be derived from repeated behavior in both cases, not designed solely from this document.

The prototype remains usable if a demonstration API fails. Authored synthetic facts and assessment continue; the interface marks live enrichment unavailable and never substitutes invented data.

## Privacy Contract

- Obtain explicit consent before research telemetry.
- Use pseudonymous research IDs.
- Prohibit real customer, account, beneficiary, transaction, and employer-confidential data.
- Store free text locally by default.
- Export only consented structured events and manually selected research notes.
- Provide deletion and export controls.
- Set a short, documented retention period before Round 1 begins.

The retention period is a research-operation setting, not hard-coded product behavior. It must be chosen and written into the participant consent form before any session is recorded.

## Project Sequence

### Stage 0: Validation-Path Trust Gate

Before testing:

- Correct inaccurate domain facts used by the two prototype cases.
- Correct global navigation or progress defects that make the prototype appear broken.
- Remove or hide impossible badge promises and unsupported mastery claims visible from the prototype path.
- Quarantine inaccurate or unverified surfaces instead of fixing the entire backlog.
- Add visible simulation and institution-variation disclosures.

This is not authorization to implement missing tracks or complete every expert-panel recommendation.

### Stage 1: Research Prototype

- Author the two cases from current primary sources.
- Implement structured investigation and reasoning controls with existing components.
- Implement a local session debrief.
- Add consent-based event export.
- Create facilitator, observation, interview, and consent templates.
- Verify mobile, keyboard, screen-reader, failure, and stale-claim states.

### Stage 2: Round 1 Observed Research

Recruit five learners:

- Two customer-facing payments account or relationship professionals
- Two payments-operations professionals
- One person transitioning into either role

Each participant completes:

1. Five-minute baseline
2. One observed prototype case, alternating the Canadian and cross-border cases across the cohort
3. Post-session interview
4. One neutral link to the other prototype case three to seven days later, with no walkthrough or reminder

The facilitator remains silent except for safety, consent, or technical failure. Do not change product behavior between every participant. Review patterns after a small cohort so individual politeness or preference does not dictate the design.

### Stage 3: Extract and Expand

Proceed only if Round 1 establishes that the cases resemble real work and reveals repeatable interaction and misconception patterns.

- Define the versioned case-package schema.
- Extract shared Investigate, Recommend, and Resolve components.
- Refine the decision-quality rubric.
- Add source expiry enforcement.
- Author the US and UK cases.
- Add a delayed retention case.

### Stage 4: Round 2 Unguided Validation

Recruit 10 to 15 comparable learners who receive a direct link without a walkthrough. Measure:

- Independent start
- Recommendation reached
- Reference use
- Transfer-case completion
- Return for another case
- Sharing
- Qualitative feedback

Do not use a single numerical threshold as automatic proof of product-market fit. Review behavior, interview language, segment differences, and repeated requests together.

### Stage 5: Product Decision

- Strong learner pull and public sharing supports an open-source case academy.
- Manager requests for assessment evidence support exploring an employer pilot.
- Predominant reference use supports simplifying Relay into a payments decision guide.
- Weak unguided engagement supports stopping expansion and retaining Relay as a portfolio project.

## Success Criteria

### Round 1 Learning Criteria

- Participants understand the role and task without facilitator explanation.
- Cases resemble decisions participants recognize from work.
- Learners can identify material missing facts instead of guessing.
- The rubric distinguishes invalid, defensible, and preferred decisions without relying on exact text.
- Feedback changes reasoning on the close transfer case.
- Participants can identify which claims they trust, doubt, or need sourced.

### Round 2 Demand Signals

- Learners start without personal facilitation.
- Some learners return for a fresh case without repeated prompting.
- Learners share Relay or request a specific additional case.
- Learners describe a concrete work moment in which they would use it.
- Segment behavior reveals whether the product is stronger for account-management, operations, or transition learners.

Compliments, waitlist entries, and guided completion do not count as demand by themselves.

## Testing and Quality Gates

- Domain review of prototype claims against primary sources
- Unit tests for deterministic eligibility and assessment rules
- Tests proving multiple defensible recommendations can coexist
- Integration tests for Investigate → Recommend → Resolve
- Tests for API failure with authored-case continuity
- Tests for stale and expired facts
- Keyboard-only and screen-reader journeys
- Mobile layout at 390×844 and desktop at 1440×900
- End-to-end coverage for both prototype cases
- Consent, export, and deletion verification
- Facilitator-script rehearsal before the first session

## NOT in scope

- Rebuilding every current lab
- Preserving the current curriculum order
- Shipping the missing badge-promised modules
- Implementing an LMS
- Providing production payment advice
- Selecting real intermediaries for real transactions
- Guaranteeing price, arrival, or traceability
- Issuing credentials or claiming job readiness
- Commercializing before learner behavior creates a credible buyer hypothesis

## Implementation Tasks

- [ ] **T1 (P1, human: ~1d / CC: ~30min)** — Trust gate and source pack — audit both case briefs against primary sources; record scope, owner, verification date, review-by date, assumptions, and jurisdiction; quarantine stale claims and unsupported mastery promises.
  - Surfaced by: Fact and Source Governance; Stage 0 Validation-Path Trust Gate.
  - Files: `frontend/src/features/learn/cases/`, `frontend/src/features/learn/curriculum.ts`, `docs/`.
  - Verify: domain-review checklist and stale-claim tests pass.
- [ ] **T2 (P1, human: ~1d / CC: ~30min)** — Learn entry and case state — add case-first Start, Resume, Completed, and Under review states with neutral completion language.
  - Surfaced by: Information Architecture; Completion state language.
  - Files: `frontend/src/features/learn/LearnPage.tsx`, `frontend/src/features/learn/LearnPage.css`, related tests.
  - Verify: Learn landing and expired-case journeys pass at desktop and mobile widths.
- [ ] **T3 (P1, human: ~2d / CC: ~1h)** — Case Desk shell — build the two-region desktop and task-first tablet/mobile layouts using existing shell, tokens, Button, and AsyncRegion primitives; add request anchor, phase progress, Evidence control, and safe Exit case.
  - Surfaced by: Workspace Composition; Visual Direction; Responsive Breakpoints.
  - Files: `frontend/src/features/learn/cases/CaseDesk.tsx`, `frontend/src/features/learn/cases/CaseDesk.css`, `frontend/src/app-shell/`.
  - Verify: screenshots at 390×844, 768, 1024, and 1440 show no horizontal scroll or competing primary action.
- [ ] **T4 (P1, human: ~2d / CC: ~1h)** — Evidence and reference workflow — implement evidence groupings, compact source status, contextual sheet, focus trap/restore, stale-claim behavior, and loading/error/recovery states.
  - Surfaced by: Evidence Rail; Fact and Source Governance; Source visibility.
  - Files: `frontend/src/features/learn/cases/EvidenceRail.tsx`, `ReferenceSheet.tsx`, `frontend/src/design-system/AsyncRegion.tsx`.
  - Verify: source metadata, unavailable facts, expired claims, Escape, and focus restoration are covered by tests.
- [ ] **T5 (P1, human: ~2d / CC: ~1h)** — Investigation controls — implement native fact-request checkboxes and learner-created rail shortlist with eligibility rules, legends, validation, and draft persistence.
  - Surfaced by: Investigate; Control Semantics.
  - Files: `frontend/src/features/learn/cases/FactRequest.tsx`, `RailShortlist.tsx`, case state module.
  - Verify: keyboard-only selection and invalid/possible option handling pass.
- [ ] **T6 (P1, human: ~2d / CC: ~1h)** — Recommendation and consequence loop — implement structured reasoning, read-only pre-send summary, explicit commit, first-attempt history, operational consequence, decision-quality metadata, worked explanation, and revision.
  - Surfaced by: Recommend/Resolve; Decision-quality presentation.
  - Files: `frontend/src/features/learn/cases/RecommendationSummary.tsx`, `CaseOutcome.tsx`, `CaseDebrief.tsx`.
  - Verify: evaluation is hidden before Send recommendation and the first attempt remains immutable.
- [ ] **T7 (P2, human: ~1d / CC: ~30min)** — Debrief and transfer — report supported performance, independent transfer, and retention separately; implement close and delayed contrast cases without game-like scoring.
  - Surfaced by: Assessment Model; User Journey and Feedback Tone.
  - Files: `frontend/src/features/learn/cases/CaseDebrief.tsx`, retention-case fixtures and tests.
  - Verify: transfer case has reduced scaffolding and no mastery/certification label.
- [ ] **T8 (P1, human: ~2d / CC: ~1h)** — Persistence and research controls — version drafts, invalidate dependent decisions, handle corrupt drafts, add optional consent, append-only export, withdrawal, deletion, and learner review.
  - Surfaced by: Draft, Resume, and Revision; Research Consent and Export; Privacy Contract.
  - Files: `frontend/src/features/learn/cases/caseStore.ts`, `frontend/src/services/telemetry.ts`, consent/export UI and tests.
  - Verify: refresh, tab close, restart confirmation, consent withdrawal, export, and deletion journeys pass.
- [ ] **T9 (P1, human: ~1d / CC: ~30min)** — Accessibility and responsive QA — test breakpoints, keyboard and screen reader journeys, managed focus, announcements, 44px targets, error summaries, no horizontal scroll, and reduced motion.
  - Surfaced by: Focus and Announcement Contract; Responsive Breakpoints; Control Semantics.
  - Files: `frontend/e2e/case-desk.spec.ts`, accessibility fixtures, `frontend/src/design-system/`.
  - Verify: Playwright and axe checks pass at all target viewports.
- [ ] **T10 (P2, human: ~3d / CC: ~1h)** — Observed validation release — prepare facilitator, observation, interview, consent, and export templates; run Round 1 with five learners and review repeatable patterns before extracting shared case units.
  - Surfaced by: Project Sequence; Success Criteria.
  - Files: `docs/research/`, facilitator and consent templates, research export artifacts.
  - Verify: five sessions complete and a decision memo records observed demand, misconceptions, and next product direction.

## Decision Log

- Open-source education is the primary intent; commercialization is conditional on demonstrated pull.
- The selected strategy is a validation release, not a complete academy.
- The selected learning interaction is the Customer Case Desk.
- Customer jobs replace payment concepts as the curriculum spine.
- Case packs replace labs as primary product units; labs may remain optional technical deep dives.
- Two direct case prototypes precede a generic case engine.
- Round 1 is qualitative discovery; Round 2 tests unguided behavior.

## The Assignment

Schedule a 20-minute discovery interview with Marvellous before implementation. Ask for one anonymized Canadian collection question and one Canada-to-US supplier-payment question she has encountered, including what information she needed, whom she asked, and what made the answer difficult. Convert them into synthetic briefs without customer, employer, account, transaction, or confidential details. Reserve the later 30- to 45-minute unassisted session for testing the implemented prototype.

## Source Notes

- [Interac e-Transfer FAQ](https://www.interac.ca/en/resources/personal-resources/personal-faq/interac-e-transfer/)
- [Interac Autodeposit guide](https://www.interac.ca/en/how-to-use/interac-e-transfer/how-to-set-up-interac-e-transfer-autodeposit/)
- [Interac e-Transfer overview](https://www.interac.ca/en/content/life/interac-e-transfer-101-everything-you-need-to-know-about-sending-and-receiving-money/)
- [Bacs Direct Credit introduction](https://www.bacs.co.uk/media/cmuccdew/bdc-introduction.pdf)
- [Bacs Direct Debit guide](https://www.bacs.co.uk/media/ezwlg0dn/little_bacs_guide_to_direct_debit-v2.pdf)
- [Bank of England CHAPS overview](https://www.bankofengland.co.uk/payment-and-settlement/chaps)
- [SWIFT ISO 20022 customer-payment exercises](https://www.swift.com/myswift/services/training/swift-training-catalogue/browse-swift-training-catalogue/customer-payments-using-iso-20022-exercises)
- [DiXiO ISO 20022 operations training](https://dixio.cloud/iso-20022-operations-training-program)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run; office-hours strategy review already established the validation-first direction |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | Required next because this review added substantial interaction, persistence, and accessibility contracts |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | Score: 6/10 → 10/10; 17 decisions resolved; 0 unresolved |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run |

**VERDICT:** DESIGN CLEAR — ready for implementation planning; eng review required before implementation is considered ship-ready.

NO UNRESOLVED DECISIONS
