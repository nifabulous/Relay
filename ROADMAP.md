# Roadmap: SWIFT Routing Lab — An Interactive Payment Sandbox

> **Goal:** A place where a complete beginner can learn how international
> payments actually work — not by reading slides, but by doing each step
> themselves and seeing the results.

---

## Who this is for

| Audience | What they get |
|---|---|
| **Fintech engineers** new to payments | Understand the domain before building payment features |
| **Payment operations staff** | Hands-on feel for BICs, Nostro/Vostro, SSI, VoP |
| **Students / bootcampers** | A concrete playground instead of abstract theory |
| **Product managers** | Understand what happens "under the hood" of a transfer |

**Assumed knowledge:** None. The curriculum starts from "what is a SWIFT code?"

---

## The learning philosophy

1. **Show, don't tell.** Every concept has a live demo you can run.
2. **One concept per page.** Each lab teaches one thing, then links to the next.
3. **Real relationships, safe placeholders.** 210 real banks, 301 SSI records reflecting real correspondent relationships, 18,000+ Fedwire entries. The bank/BIC/correspondent relationships are real public directory facts; account numbers are illustrative `ACCT-` placeholders — never wire funds using seed data.
4. **Make mistakes safely.** Try a wrong name → see NO_MATCH. Try a bad IBAN → see the checksum fail. Learn by breaking things without consequence.
5. **Follow the money.** The curriculum mirrors the actual lifecycle: validate → verify → route → settle → track.

---

## The curriculum (6 labs, progressive)

Each lab maps to a real phase of a cross-border payment:

```
Lab 1          Lab 2          Lab 3          Lab 4          Lab 5          Lab 6
Identify       Validate       Verify         Route &        Settle         Track
the banks      the details    the payee      choose path    the payment    the payment
─────────────────────────────────────────────────────────────────────────────────
BICs/IBANs  →  format check → name match  → intermediaries→ SSI accounts → UETR timeline
```

### Lab 1: "Who's who in global banking" (BIC & IBAN basics)
**Teaches:** BIC/SWIFT codes, IBAN structure, country codes, checksums
**Hands-on:** Type any bank name or IBAN → see it decomposed: bank code, country, branch, checksum
**Status:** ✅ Engine exists (`/api/validate`, `/api/lookup`) — needs the *explainer UI*

### Lab 2: "Is this account number even real?" (Validation & checksums)
**Teaches:** MOD-97 IBAN checksum, BIC format rules, why payments fail at this stage
**Hands-on:** Break an IBAN on purpose → see exactly which check failed and why
**Status:** ✅ Engine exists — needs a *visual checksum explainer*

### Lab 3: "Are you paying the right person?" (Verification of Payee)
**Teaches:** VoP/CoP, name matching, the MATCH/CLOSE_MATCH/NO_MATCH decision, fraud prevention
**Hands-on:** Enter a name with a typo → watch it score 0.84 → see the real name returned for review
**Status:** ✅ Engine + UI exists — needs *guided exercises*

### Lab 4: "How does the money actually move?" (Correspondent routing)
**Teaches:** Nostro/Vostro, intermediary banks, correspondent chains, corridor rules
**Hands-on:** Pick a sender bank + beneficiary bank → see the full chain visualized hop-by-hop
**Status:** ✅ Engine exists (`/api/route`) — needs a *visual chain diagram*

### Lab 5: "Where exactly do I send the money?" (SSI — Settlement Instructions)
**Teaches:** Standard Settlement Instructions, Nostro account numbers, charge codes (OUR/SHA/BEN)
**Hands-on:** Look up SSI for Emirates NBD → see the correspondent chain (Citibank, Standard Chartered, BNY Mellon) and the placeholder Nostro account numbers
**Status:** ✅ Engine + UI + 301 real records exist — needs *contextual explanations*

### Lab 6: "Did it arrive?" (UETR tracking)
**Teaches:** UETR, SWIFT gpi, status timeline, fees deducted at each hop
**Hands-on:** Create a tracked payment → watch the simulated timeline unfold
**Status:** ✅ Engine exists (simulated) — needs *clear "this is simulated" framing*

### Capstone: "Send a payment end-to-end" (Prepare Payment)
**Teaches:** How all five phases combine into one decision: PROCEED / REVIEW / STOP
**Hands-on:** Fill in one form → see all four checks run → get a recommendation
**Status:** ✅ Engine + UI exists — needs *step-by-step walkthrough mode*

---

## Current state (what's built)

| Capability | Status | Count |
|---|---|---|
| Bank directory (curated + SSI-sourced) | ✅ | 210 banks |
| IBAN/BIC validation | ✅ | Full MOD-97 + format checking |
| US bank directory (Fedwire/FedACH) | ✅ | 25,891 banks |
| SSI settlement instructions | ✅ | 301 records (293 real) |
| Verification of Payee | ✅ | 11 test accounts |
| Corridor routing | ✅ | 66 rules, 28+ currencies |
| Payment tracking (simulated) | ✅ | UETR + timeline |
| Combined prepare-payment | ✅ | Recommendation engine |
| Admin UI | ✅ | 7 pages |
| Tests | ✅ | 416 passing |

---

## What's missing (the gaps)

### Gap 1: No guided learning path
The UI is a *dashboard* for someone who already knows what they're doing. A newbie landing on `/ui` sees 7 nav items and doesn't know where to start.

**Need:** A "Start here" guided mode that walks through Lab 1 → 6 in order.

### Gap 2: No visual explanations
The data is correct but presented as tables. A beginner can't *see* the payment flowing through the correspondent chain.

**Need:** Visual diagrams — the payment chain as an animated flow, the IBAN decomposed into labeled parts.

### Gap 3: No contextual teaching
Each page shows data but doesn't explain *why* it matters. There's no "What is a Nostro account?" tooltip next to the SSI account number.

**Need:** Inline explainers, glossary tooltips, and "why this matters" callouts.

### Gap 4: No guided exercises
A learner needs prompts: "Try entering this IBAN with a wrong checksum. What happens?"

**Need:** Pre-built exercises with expected outcomes and explanations.

### Gap 5: No payment-flow simulation with visual feedback
The tracking timeline is text-based. A visual timeline showing money moving between banks would be far more instructive.

**Need:** Animated payment chain showing each hop with delays.

---

## Phased build roadmap

### Phase 1: Guided Learning Mode (the "tour")
*Estimated effort: 2-3 days*

Transform the admin dashboard into a structured learning experience.

**1.1 — Add a `/learn` route with progressive labs**
- A landing page that shows the 6 labs as a numbered path
- Each lab page has: concept explanation → live demo → "try it yourself" exercise → "next lab" link
- Track progress (localStorage: which labs completed)

**1.2 — Lab 1: IBAN/BIC Explorer (interactive decomposition)**
- Type an IBAN → see it split into labeled parts (country, checksum, bank code, account)
- Type a BIC → see bank code, country code, location code, branch code
- Visual: colored segments showing what each part means
- Exercise: "Find the BIC for a bank in Japan. What country code do you see?"

**1.3 — Lab 2: Checksum Breaker**
- Show the MOD-97 math visually: "Here are the digits. Here's the checksum. Watch it verify."
- Let the user flip a digit → watch the checksum fail → explain why
- Exercise: "Change one digit in this IBAN. Which check catches it?"

**1.4 — Lab 3: Name Match Playground**
- Pre-loaded with 5 scenarios: exact match, typo, completely wrong, accent variation, name order swap
- Each scenario shows the score + outcome + what the payer would see
- Exercise: "Find a name that scores between 0.75 and 0.90. What outcome does it get?"

### Phase 2: Visual Payment Flow
*Estimated effort: 3-4 days*

Make the invisible visible — show money moving through the banking network.

**2.1 — Animated correspondent chain diagram**
- Given a sender + beneficiary, draw the chain: Sender → Intermediary 1 → Intermediary 2 → Beneficiary
- SVG-based flow diagram with bank nodes connected by arrows
- Animate the "payment" (a dot) traveling through the chain with a delay at each hop
- Show the fee deduction at each hop (amount shrinks)

**2.2 — Interactive Nostro/Vostro visualization**
- Show two columns: Bank A's perspective (Nostro) vs Bank B's perspective (Vostro)
- Animate: "Payment debits Bank A's Nostro account at Intermediary. Balance changes."
- Make the accounting explicit: who debits, who credits, which account

**2.3 — Payment timeline (enhanced tracking)**
- Instead of a text table, show a vertical timeline with bank logos/icons
- Each hop: bank name, status, timestamp, amount after fees
- Color-code: green = credited, amber = processing, red = rejected

### Phase 3: Contextual Teaching Layer
*Estimated effort: 2-3 days*

Add the "why" behind every piece of data.

**3.1 — Glossary system**
- A `glossary.json` with 40-50 terms (BIC, IBAN, Nostro, Vostro, SSI, UETR, VoP, MT103, pacs.008, OUR/SHA/BEN, etc.)
- Auto-link terms in the UI to tooltip definitions
- Each glossary entry: definition + "see it in action" link to the relevant lab

**3.2 — Inline explainers on every page**
- Next to each SSI account number: "This is the Nostro account. The intermediary holds this account ON BEHALF of the beneficiary bank."
- Next to each confidence badge: "High confidence means this correspondent relationship is well-documented."
- Next to the recommendation: "PROCEED means all four checks passed. Here's what each check verified."

**3.3 — "Real world example" callouts**
- Pull from news/public cases: "In 2023, a misdirected payment of $620M went to the wrong account because VoP wasn't used. Here's how VoP would have caught it."
- Link each concept to a real incident or common practice

### Phase 4: Exercise Library
*Estimated effort: 2 days*

Structured exercises with self-checking answers.

**4.1 — Exercise engine**
- Each exercise: prompt → input → expected outcome → explanation
- Auto-check: "Did you get NO_MATCH? Correct! Here's why."
- Hints available on demand

**4.2 — 20+ guided exercises across all labs**
- Lab 1: "Decode this IBAN: DE89370400440532013000. Which bank is it?"
- Lab 2: "This IBAN has a bad checksum. Which digit is wrong?"
- Lab 3: "Enter a name that scores CLOSE_MATCH. What name was returned?"
- Lab 4: "Route a payment from NYC to Lagos. How many intermediaries?"
- Lab 5: "Look up the SSI for Emirates NBD in USD. Which intermediary has account 6550286074?"
- Lab 6: "Create a payment that gets REJECTED. What was the reason?"

### Phase 5: The Capstone Simulation
*Estimated effort: 3-4 days*

A complete end-to-end payment experience that ties everything together.

**5.1 — "Send a payment" guided wizard**
- Step 1: Enter beneficiary details (IBAN, name, bank) → see validation
- Step 2: See VoP result → decide whether to proceed
- Step 3: See the routing chain → understand the intermediary hops
- Step 4: See the SSI → understand where the money actually lands
- Step 5: Get the recommendation → "send" or "stop"
- Step 6: If sent → watch the UETR timeline unfold
- Each step pauses and explains before proceeding

**5.2 — Scenarios library**
- "The typo trap": Close name match → what do you do?
- "The fraud stop": Completely wrong name → caught by VoP
- "The exotic currency": Payment to a currency with no SSI → blocked
- "The fee surprise": SHA vs OUR → see how much the beneficiary actually receives
- "The compliance reject": Payment blocked at an intermediary → understand why

**5.3 — Achievement / progress tracking**
- Complete all 6 labs → "Payment Fundamentals" badge
- Complete the capstone → "Cross-Border Payment Certified"
- Shareable completion summary

### Phase 6: Polish & Accessibility
*Estimated effort: 2 days*

**6.1 — Mobile-responsive UI** (currently desktop-only sidebar layout)
**6.2 — Accessibility**: screen-reader labels, keyboard navigation, high-contrast mode
**6.3 — Performance**: lazy-load bank directory, paginate large tables
**6.4 — Internationalization**: at least English + French (for Francophone Africa corridors)

---

## Priority order (what to build first)

If time is limited, build in this order — each delivers standalone value:

| Priority | Phase | Why first |
|---|---|---|
| 🥇 | **Phase 1 (Guided Labs)** | Without a learning path, the system is a toolbox, not a teacher |
| 🥈 | **Phase 2 (Visual Flow)** | The animated chain is the "aha moment" — most powerful teaching tool |
| 🥉 | **Phase 3 (Context)** | Explanations turn data into knowledge |
| 4 | Phase 4 (Exercises) | Practice cements understanding |
| 5 | Phase 5 (Capstone) | Ties it all together — most impressive but depends on 1-4 |
| 6 | Phase 6 (Polish) | Quality-of-life improvements |

---

## Technical approach

**No new backend services needed.** The API is complete. All teaching features are frontend-only:

- **No new dependencies beyond what exists.** The UI is plain HTML/JS/CSS.
- **One new route: `/learn`** that serves the guided experience alongside `/ui` (the admin dashboard).
- **Glossary as JSON** — no database changes.
- **Exercises as JSON** — static prompt/answer pairs.
- **Animations: pure SVG + CSS** — no animation library needed.
- **Progress: localStorage** — no authentication or user accounts.

This keeps the teaching layer cleanly separable from the API — someone could take just the API and build a completely different teaching UI on top.

---

## Success metrics

How we'll know it's working:

| Metric | Target |
|---|---|
| A complete beginner completes Lab 1 | < 10 minutes |
| A learner can explain what a Nostro account is | After Lab 4 |
| A learner can identify a fraudulent payment | After Lab 3 |
| A learner completes the full capstone | < 45 minutes total |
| "I understand how international payments work" | Self-reported at end |

---

## What this is NOT

- **Not a production payment system.** No real money moves. Every "payment" is simulated.
- **Not a SWIFT replacement.** We don't connect to the SWIFT network.
- **Not a licensed financial advice tool.** It's educational.
- **Not a replacement for SWIFTRef/Accuity.** The data is real but curated, not comprehensive.

The SSI account numbers are illustrative `ACCT-` placeholders. The bank and correspondent relationships are real (sourced from bank-published pages), but account numbers are masked so no synthetic number can be mistaken for real. The system is for learning — not for wiring actual funds.
