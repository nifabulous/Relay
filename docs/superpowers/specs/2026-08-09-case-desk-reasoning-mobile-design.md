# Case Desk Reasoning and Mobile Layout Design

## Goal

Reduce the amount of information the learner must enter in the Canada → US supplier case while keeping the reasoning assessment meaningful, and make the customer request visible before the task controls on mobile.

## Approved interaction

The reasoning section has three prompts:

1. **Why this rail?** — the substantive primary reason used by the evaluator.
2. **Key risk or trade-off?** — a concise optional risk statement stored as the draft conditions.
3. **What should the customer expect?** — one guided textarea asking the learner to cover cost, timing, tracking, and the customer-facing explanation in a single response.

The separate price expectation, arrival expectation, tracking expectation, and customer explanation inputs are removed from the learner-facing form. The evaluator treats the single customer expectation as the expectation-quality signal. The recommendation summary shows the single expectation rather than repeating four separate fields.

## Draft compatibility

New drafts store `customerExpectation`. Existing persisted drafts that only have legacy price/arrival/tracking/customer-explanation fields remain readable by deriving a display fallback from their non-empty legacy values. New writes use the consolidated field. No learner progress or completed attempt is discarded.

## Mobile layout

On desktop widths, the task and evidence remain side-by-side with the task on the left and evidence on the right. Below the split breakpoint, the customer-request anchor is rendered before the task controls, followed by fact gathering, rail selection, and reasoning. The remaining evidence ledger stays after the task controls; the request anchor is not duplicated.

## Data flow and scoring

The Case Desk owns the controlled fields and persists edits through the existing draft update path. `customerExpectation` is passed into the pure evaluator. A non-empty expectation contributes one expectation signal; a substantive primary reason plus the expectation can reach the defensible tier when rail eligibility and required facts are satisfied. Outcome copy and sound-reasoning labels use the consolidated expectation language. The existing `customerExplanation` field remains only as a legacy compatibility input and is not rendered for new drafts.

## Accessibility and verification

All three prompts retain explicit labels and keyboard-focusable controls. The expectation textarea keeps the existing character limit and live character counter. Tests cover the reduced field set, compatibility fallback, evaluator scoring, mobile DOM order, and the full existing case flow. The frontend test suite and production build must pass.
