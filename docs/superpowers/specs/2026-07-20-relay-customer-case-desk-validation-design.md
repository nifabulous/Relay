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

## Customer Case Desk Interaction

The selected interaction is a scenario-first Customer Case Desk. It has three learner-facing phases.

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

1. Reveal the simulated consequence and its certainty category.
2. Ask the learner to diagnose any failure or mismatch.
3. Show a concise worked explanation.
4. Present a close transfer case without the worked example.
5. Deliver a contrast retention case three to seven days later.

The interface progressively removes scaffolding. Later cases require learners to identify candidate rails and material questions with less prompting.

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

Hints do not reduce a learner's score. They distinguish supported performance from independent transfer. Time spent is recorded for UX diagnosis only and never used as competency evidence.

Free-text responses are manually reviewed during research and do not automatically determine completion or mastery.

## Fact and Source Governance

Every material payment claim must record:

- Source URL or repository reference
- Source owner
- Verification date
- Jurisdiction and currency
- Claim scope
- Review-by date

Claim scope is one of:

- Payment-system or scheme rule
- Operator guidance
- Participating-institution configuration
- Disclosed example assumption
- Simulation-only value

Cases use ranges and explicit assumptions when no universal institution-independent answer exists. Expired claims make the affected case unavailable until reviewed; they are not silently presented as current guidance.

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

## Explicit Non-Goals

- Rebuilding every current lab
- Preserving the current curriculum order
- Shipping the missing badge-promised modules
- Implementing an LMS
- Providing production payment advice
- Selecting real intermediaries for real transactions
- Guaranteeing price, arrival, or traceability
- Issuing credentials or claiming job readiness
- Commercializing before learner behavior creates a credible buyer hypothesis

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
