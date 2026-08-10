/**
 * Pure case evaluator (Task 1).
 *
 * This module scores a learner's `RecommendationDraft` against a
 * `CaseDefinition`. It has NO dependencies on storage, network, the system
 * clock, or React. The same inputs always produce the same output.
 *
 * Quality tiers (disclosed to the learner upfront):
 * - `invalid`     — selected rail ineligible, or required facts unknown,
 *                   or no rail selected at all.
 * - `possible`    — selected rail is eligible and facts are gathered, but the
 *                   reasoning does not yet include a substantive reason and
 *                   customer expectation.
 * - `defensible`  — eligible + facts gathered + reasoning covers the
 *                   consolidated customer expectation with a substantive
 *                   primary reason.
 * - `preferred`   — defensible AND the selected rail is the best fit under the
 *                   case's disclosed priorities.
 *
 * Eligibility is derived deterministically from the case's corridor facts
 * (destination country / currency) against cues in each rail's authored
 * `eligibility` string. All data is authored by us, so this keyword contract is
 * stable and explainable.
 *
 * ─── Load-bearing investigation (T1) ─────────────────────────────────────────
 * The evaluator takes a `requestedFactIds: Set<string>` argument representing
 * the facts the learner ACTUALLY gathered. A requestable fact (e.g.
 * `tracking-need`, `price-sensitivity`) is treated as "unknown for scoring
 * purposes" if its id is NOT in `requestedFactIds`, even though its authored
 * `value` is present in the catalog. This makes the investigation load-bearing:
 * a learner who skips it cannot reach `preferred` (or `defensible`/`possible`
 * for rails whose `requiredFacts` include un-requested requestable facts).
 *
 * The catalog ships requestable facts as `state: "unknown"`, so this gating is
 * the only thing that turns a requestable fact "known" for scoring. Supplied
 * (non-requestable) facts (destination, currency, amount, urgency,
 * beneficiary-bank) are always gathered — they are the given context.
 *
 * ─── Load-bearing reasoning (T1b) ────────────────────────────────────────────
 * The Primary reason must clear a substantive threshold (`isSubstantiveReason`)
 * — not just `isNonEmpty`. A learner who types filler ("x", "asdf", "fast") in
 * the reason field must NOT reach `defensible`/`preferred`. The threshold is a
 * tunable length + word-count floor; see `MIN_REASON_CHARS` /
 * `MIN_REASON_WORDS`. The consolidated customer expectation keeps the lighter
 * `isNonEmpty` bar — it is shorter by nature and the contract is "did the
 * learner articulate something," not "did they reason."
 */

import type {
  CaseDefinition,
  CaseFact,
  CaseOutcome,
  RailEligibilityRule,
  RailOption,
  RecommendationDraft,
} from "./caseTypes";
import { customerExpectationFor } from "./caseDraft";

// ─── T1b: substantive-reason threshold ──────────────────────────────────────
// The Primary reason is the load-bearing reasoning control. `isNonEmpty` alone
// accepts "x" — filler that lets a learner reach `preferred` without reasoning.
// The threshold below rejects filler ("x", "asdf", "fast", "a b") while
// accepting any genuine one-sentence reason (the real sentence the existing
// RecommendationFlow test types is 62 chars / 7 words; well clear).
//
// Why length AND word count:
//   - char floor rejects short gibberish tokens ("asdf", 4 chars).
//   - word floor rejects a single long gibberish run and any one-word answer.
//   - the two together accept the shortest plausible real reason ("It meets
//     the deadline." = 21 chars / 4 words) while rejecting every filler shape
//     we've seen.
// Keep both tunable as named constants so future tuning is one edit + a test.
export const MIN_REASON_CHARS = 20;
export const MIN_REASON_WORDS = 3;

// ─── Helpers ────────────────────────────────────────────────────────────────

function findFact(definition: CaseDefinition, id: string): CaseFact | undefined {
  return definition.facts.find((f) => f.id === id);
}

function factValueLower(definition: CaseDefinition, id: string): string {
  return (findFact(definition, id)?.value ?? "").toLowerCase();
}

function hasWord(text: string, pattern: RegExp): boolean {
  return pattern.test(text.toLowerCase());
}

function ruleMatches(definition: CaseDefinition, rule: RailEligibilityRule): boolean {
  const actual = factValueLower(definition, rule.factId);
  const expected = rule.value.toLowerCase();
  return rule.operator === "equals" ? actual === expected : actual.includes(expected);
}

/** Legacy fallback for older authored rails that do not yet have explicit rules. */
function isDomesticOnlyRailByText(rail: RailOption): boolean {
  const text = `${rail.eligibility} ${rail.name}`.toLowerCase();
  return /\bdomestic\b|canada only|within canada|cad only|in-country only/.test(text);
}

/** Legacy fallback for older authored rails that do not yet have explicit rules. */
function destinationIsUnitedStatesByText(definition: CaseDefinition): boolean {
  const dest = factValueLower(definition, "destination-country");
  return /\bunited states\b|\bu\.?s\.?(a)?\b/.test(dest);
}

/** Legacy fallback for older authored rails that do not yet have explicit rules. */
function destinationIsUsdByText(definition: CaseDefinition): boolean {
  const ccy = factValueLower(definition, "destination-currency");
  return /\busd\b|u\.?s\.? dollar/.test(ccy);
}

function isRailIneligibleByLegacyText(definition: CaseDefinition, rail: RailOption): boolean {
  if (isDomesticOnlyRailByText(rail) && destinationIsUnitedStatesByText(definition)) {
    return true;
  }
  const caseUsd = destinationIsUsdByText(definition);
  const eligibility = rail.eligibility.toLowerCase();
  if (/\bcad\b/.test(eligibility) && /\bonly\b/.test(eligibility) && caseUsd) {
    return true;
  }
  if (/\busd\b/.test(eligibility) && /\bonly\b/.test(eligibility) && !caseUsd) {
    return true;
  }
  return false;
}

function isRailIneligible(definition: CaseDefinition, rail: RailOption): boolean {
  const rules = rail.eligibilityRules ?? [];
  if (rules.length === 0) return isRailIneligibleByLegacyText(definition, rail);

  if (rules.some((rule) => rule.outcome === "ineligible" && ruleMatches(definition, rule))) {
    return true;
  }

  const eligibleRules = rules.filter((rule) => rule.outcome === "eligible");
  if (eligibleRules.length === 0) return false;

  return eligibleRules.some((rule) => !ruleMatches(definition, rule));
}

function findRail(definition: CaseDefinition, id: string): RailOption | undefined {
  return definition.rails.find((r) => r.id === id);
}

// ─── T1: effective fact state from requestedFactIds ─────────────────────────
// A requestable fact counts as "gathered for scoring" ONLY if the learner
// actually requested it. Non-requestable supplied facts always count. This is
// the single place that decision is made; every other helper consumes it.

/**
 * True if the fact is effectively gathered for scoring purposes.
 *
 * - Non-requestable facts: gathered unless their authored state is `unknown`.
 *   Supplied facts (destination, currency, amount, urgency, beneficiary-bank)
 *   ship `supplied`, so this is always true for them.
 * - Requestable facts: gathered only if the learner REQUESTED them — i.e. their
 *   id is in `requestedFactIds`. The catalog ships requestable facts as
 *   `unknown`, so without an entry in `requestedFactIds` they are NOT gathered.
 *
 * `requestedFactIds` defaults to an empty set so callers that genuinely don't
 * know the requested set (none in production, but defensive) get the strict
 * "investigation skipped" behaviour rather than silently treating requestable
 * facts as gathered.
 */
function isFactGathered(fact: CaseFact | undefined, requestedFactIds: Set<string>): boolean {
  if (!fact) return false;
  if (fact.requestable) return requestedFactIds.has(fact.id);
  return fact.state !== "unknown";
}

/**
 * Required facts for a rail that are NOT gathered given what the learner
 * actually requested. A requestable required fact the learner did not request
 * is missing — even though its authored value is present in the catalog.
 */
function missingRequiredFacts(
  definition: CaseDefinition,
  rail: RailOption,
  requestedFactIds: Set<string>,
): string[] {
  return rail.requiredFacts.filter((id) => !isFactGathered(findFact(definition, id), requestedFactIds));
}

/**
 * Return the facts that must be gathered before a specific rail can be
 * recommended. The Case Desk uses this as its pre-submit workflow gate so the
 * learner gets a useful direction back to investigation instead of reaching
 * the evaluator's "should have waited" outcome.
 */
export function missingRequiredFactsForRail(
  definition: CaseDefinition,
  railId: string,
  requestedFactIds: Set<string> = new Set(),
): string[] {
  const rail = findRail(definition, railId);
  return rail ? missingRequiredFacts(definition, rail, requestedFactIds) : [];
}

function isNonEmpty(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * T1b: the Primary reason's substantive threshold. Rejects filler ("x",
 * "asdf", "fast") by requiring both a minimum character count AND a minimum
 * word count. Genuine one-sentence reasons clear both. Exported so the
 * threshold is directly testable and the catalog/UI can reference the same
 * contract.
 */
export function isSubstantiveReason(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_REASON_CHARS) return false;
  // Whitespace-delimited token count. A real sentence clears MIN_REASON_WORDS
  // easily; one-word answers and "a b"-style filler do not.
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  return words.length >= MIN_REASON_WORDS;
}

/**
 * Determine the case's disclosed priorities from its facts AND what the learner
 * actually requested. Returns a set of priority tags the best-fit rail can be
 * matched against. Conservative and case-shaped: only flags a priority when the
 * corresponding fact is present and effectively gathered (see `isFactGathered`).
 *
 * T1 composition: priorities derived from requestable facts (price-sensitivity
 * → cost; tracking-need → tracking) only fire once the learner REQUESTS them.
 * Urgency is non-requestable and supplied, so it fires regardless of the
 * investigation. A learner who skips the investigation therefore cannot unlock
 * the tracking + cost priorities the best-fit matcher needs to select
 * swift-fedwire — so `preferred` is structurally unreachable without
 * investigating.
 *
 * Exported so the catalog↔evaluator keyword contract is directly testable: a
 * catalog test can assert "this case discloses urgency+tracking+cost ONCE the
 * relevant facts are requested" without going through the full tier scoring.
 */
export function disclosedPriorities(
  definition: CaseDefinition,
  requestedFactIds: Set<string> = new Set(),
): Set<"urgency" | "tracking" | "cost"> {
  const priorities = new Set<"urgency" | "tracking" | "cost">();
  if (!definition.recommendation?.priorityFactIds) {
    const urgency = findFact(definition, "urgency");
    if (
      urgency &&
      isFactGathered(urgency, requestedFactIds) &&
      hasWord(urgency.value, /business day|urgent|asap|deadline|time-critical|within \d/)
    ) {
      priorities.add("urgency");
    }
    const tracking = findFact(definition, "tracking-need");
    if (
      tracking &&
      isFactGathered(tracking, requestedFactIds) &&
      hasWord(tracking.value, /track|tracking|uetr|confirmation of credit|confirm/)
    ) {
      priorities.add("tracking");
    }
    const price = findFact(definition, "price-sensitivity");
    if (
      price &&
      isFactGathered(price, requestedFactIds) &&
      hasWord(price.value, /fee|cost|cheap|price|sensitivity|budget|willing to pay/)
    ) {
      priorities.add("cost");
    }
    return priorities;
  }

  for (const [priority, factId] of Object.entries(
    definition.recommendation.priorityFactIds,
  ) as Array<["urgency" | "tracking" | "cost", string | undefined]>) {
    if (!factId) continue;
    const fact = findFact(definition, factId);
    if (fact && isFactGathered(fact, requestedFactIds) && isNonEmpty(fact.value)) {
      priorities.add(priority);
    }
  }
  return priorities;
}

/** A rail satisfies a priority when the authored fit tags mark it that way. */
function railSatisfies(rail: RailOption, priority: "urgency" | "tracking" | "cost"): boolean {
  return rail.fitTags?.includes(priority) ?? false;
}

function railSatisfiesByLegacyText(
  rail: RailOption,
  priority: "urgency" | "tracking" | "cost",
): boolean {
  const text = `${rail.reasons.join(" ")} ${rail.eligibility}`.toLowerCase();
  switch (priority) {
    case "urgency":
      return /\bfast\b|same-day|same day|instant|urgent|priority|value today|real-time/.test(text);
    case "tracking":
      return /\btrack|uetr|gpi|confirmation of credit/.test(text);
    case "cost":
      return /\blow fee|low cost|cheap|no fee|budget|economical|fewer fees/.test(text);
  }
}

/**
 * The single rail that best satisfies ALL disclosed priorities, preferring
 * rails that satisfy more priorities. Returns undefined when no eligible rail
 * covers the (urgency+tracking) bundle the case emphasizes.
 *
 * T1: takes `requestedFactIds` so the disclosed priorities reflect what the
 * learner actually gathered. Without the investigation, no best-fit rail is
 * selected → `preferred` is unreachable.
 *
 * Exported so the catalog↔evaluator contract is directly testable: a catalog
 * test can assert "swift-fedwire is the best-fit rail for this case ONCE the
 * investigation is complete" without building a full draft and tracing it
 * through tier scoring.
 */
export function bestFitRailId(
  definition: CaseDefinition,
  requestedFactIds: Set<string> = new Set(),
): string | undefined {
  const priorities = disclosedPriorities(definition, requestedFactIds);
  if (priorities.size === 0) return undefined;

  if (!definition.recommendation) {
    const eligible = definition.rails.filter((r) => !isRailIneligible(definition, r));
    let bestId: string | undefined;
    let bestScore = 0;
    for (const rail of eligible) {
      let score = 0;
      for (const priority of priorities) {
        if (railSatisfiesByLegacyText(rail, priority)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestId = rail.id;
      }
    }
    const mustCover = priorities.has("urgency") || priorities.has("tracking");
    if (mustCover && bestScore === 0) return undefined;
    return bestId;
  }

  const priorityFactIds = Object.values(definition.recommendation.priorityFactIds).filter(
    (factId): factId is string => Boolean(factId),
  );
  const allPriorityFactsGathered =
    priorityFactIds.length > 0 &&
    priorityFactIds.every((factId) =>
      isFactGathered(findFact(definition, factId), requestedFactIds),
    );
  const preferredRail = findRail(definition, definition.recommendation.preferredRailId);
  if (
    allPriorityFactsGathered &&
    preferredRail &&
    !isRailIneligible(definition, preferredRail)
  ) {
    return preferredRail.id;
  }

  const eligible = definition.rails.filter((r) => !isRailIneligible(definition, r));
  let bestId: string | undefined;
  let bestScore = 0;
  for (const rail of eligible) {
    let score = 0;
    for (const p of priorities) if (railSatisfies(rail, p)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestId = rail.id;
    }
  }
  // Require a strong fit: must cover at least the urgency or tracking priority
  // when those are disclosed (this is what makes "preferred" selective).
  const mustCover = priorities.has("urgency") || priorities.has("tracking");
  if (mustCover && bestScore === 0) return undefined;
  return bestId;
}

// ─── validateShortlist ──────────────────────────────────────────────────────

export interface ShortlistValidation {
  invalidRailIds: string[];
  missingFactIds: string[];
}

/**
 * Inspect a learner's shortlist against the case's facts and rail eligibility.
 *
 * - `invalidRailIds`: shortlisted rails that are ineligible given the case
 *   facts (e.g. a domestic-only rail on a cross-border case).
 * - `missingFactIds`: union of still-unknown required facts across the
 *   shortlisted eligible rails.
 *
 * T1: a requestable required fact the learner did NOT request counts as
 * missing — the shortlist surfaces it so the learner sees the gap before
 * committing.
 *
 * Unknown shortlist ids are ignored (they cannot be scored and are surfaced
 * downstream as part of the selection review).
 */
export function validateShortlist(
  definition: CaseDefinition,
  draft: RecommendationDraft,
  requestedFactIds: Set<string> = new Set(),
): ShortlistValidation {
  const invalidRailIds: string[] = [];
  const missing = new Set<string>();

  for (const id of draft.shortlist) {
    const rail = findRail(definition, id);
    if (!rail) continue;
    if (isRailIneligible(definition, rail)) {
      // De-dupe: the shortlist is advisory and may contain repeats; never leak
      // duplicate ids out to callers that render them.
      if (!invalidRailIds.includes(id)) invalidRailIds.push(id);
      continue;
    }
    for (const factId of missingRequiredFacts(definition, rail, requestedFactIds)) {
      missing.add(factId);
    }
  }

  return {
    invalidRailIds,
    missingFactIds: Array.from(missing),
  };
}

// ─── evaluateRecommendation ─────────────────────────────────────────────────
// Outcome prose is authored per case through its recommendation profile, so
// adding a corridor does not require another evaluator branch.

function emptyOutcome(): CaseOutcome {
  return {
    quality: "invalid",
    consequence: "",
    soundReasoning: [],
    reasoningGap: null,
    nextAction: "",
    invalidRailIds: [],
    missingFactIds: [],
    // No worked example for invalid/ineligible/missing-facts outcomes — the
    // learner hasn't reached a recommendation that warrants one.
    workedExplanation: null,
  };
}

function paymentContext(definition: CaseDefinition): {
  corridorLabel: string;
  corridorLabelLower: string;
  paymentLabel: string;
  paymentLabelLower: string;
} {
  const corridorLabel =
    definition.recommendation?.corridorLabel ??
    findFact(definition, "destination-country")?.value ??
    definition.title ??
    definition.id;
  const paymentLabel =
    definition.recommendation?.paymentLabel ??
    "payment";
  return {
    corridorLabel,
    corridorLabelLower: corridorLabel.toLowerCase(),
    paymentLabel,
    paymentLabelLower: paymentLabel.toLowerCase(),
  };
}

/**
 * Score a learner's recommendation against the case's disclosed facts and rail
 * eligibility. Pure and deterministic.
 *
 * T1: `requestedFactIds` is the set of facts the learner actually gathered.
 * A requestable fact not in this set is treated as unknown for scoring (see
 * `isFactGathered`).
 */
export function evaluateRecommendation(
  definition: CaseDefinition,
  draft: RecommendationDraft,
  requestedFactIds: Set<string> = new Set(),
): CaseOutcome {
  const { corridorLabel, corridorLabelLower, paymentLabelLower } = paymentContext(definition);

  // 1) No selection at all.
  if (draft.selectedRail === null) {
    return {
      ...emptyOutcome(),
      consequence: `No rail was selected, so the synthetic customer's ${paymentLabelLower} on ${corridorLabelLower} cannot be released.`,
      reasoningGap: "Select a payment rail to recommend.",
      nextAction: "Shortlist at least one eligible rail and pick one to recommend.",
    };
  }

  const rail = findRail(definition, draft.selectedRail);
  if (!rail) {
    return {
      ...emptyOutcome(),
      consequence:
        `The recommended rail is not part of this case, so the synthetic customer's ${paymentLabelLower} on ${corridorLabelLower} cannot be released.`,
      reasoningGap: `Choose a rail defined for the ${definition.id} case.`,
      nextAction: "Pick a rail from the case's available options.",
      invalidRailIds: [draft.selectedRail],
    };
  }

  // 2) Ineligible selection (by case facts / rail eligibility).
  if (isRailIneligible(definition, rail)) {
    return {
      ...emptyOutcome(),
      invalidRailIds: [rail.id],
      consequence:
        `Recommending ${rail.name} would not deliver the synthetic customer's ${paymentLabelLower} on ${corridorLabel}; ` +
        "this rail does not serve that corridor.",
      reasoningGap: `Confirm the rail's eligibility: ${rail.eligibility}`,
      nextAction:
        `Re-shortlist using a rail whose eligibility matches the ${paymentLabelLower} requirements for ${corridorLabel}.`,
    };
  }

  // 3) Missing required facts → cannot responsibly recommend yet. T1: a
  //    requestable required fact the learner did not request is missing here.
  const missing = missingRequiredFacts(definition, rail, requestedFactIds);
  if (missing.length > 0) {
    return {
      ...emptyOutcome(),
      missingFactIds: missing,
      consequence:
        `Recommending ${rail.name} before the required facts are gathered could mislead the synthetic customer about the ${paymentLabelLower}; ` +
        "key information is still unknown.",
      reasoningGap: `Gather the required facts before recommending: ${missing.join(", ")}`,
      nextAction: "Request the missing facts, then re-evaluate this rail.",
    };
  }

  // 4) Eligible + facts gathered. Now grade the reasoning.
  //    T1b: the Primary reason must be SUBSTANTIVE (not just non-empty). The
  //    three expectations keep the lighter isNonEmpty bar (they're shorter by
  //    nature and the contract is "did the learner articulate something").
  //
  //    workedExplanation (spec L191): the rail's authored worked example is
  //    surfaced onto the outcome for EVERY eligible tier (possible/
  //    defensible/preferred). It is revealed in the resolve phase after the
  //    learner reviews the consequence, regardless of how well they reasoned —
  //    the worked example teaches the rail, not the score.
  const workedExplanation = rail.workedExplanation ?? null;
  const hasCustomerExpectation = isNonEmpty(customerExpectationFor(draft));
  const hasSubstantiveReason = draft.reasons.some((r) => isSubstantiveReason(r));

  const soundReasoning: string[] = [];
  if (hasSubstantiveReason) {
    soundReasoning.push("Gave a substantive reason for the recommendation.");
  }
  if (hasCustomerExpectation) soundReasoning.push("Articulated a customer expectation.");

  // possible: eligible + facts, but reasoning is thin OR filler.
  if (!hasSubstantiveReason || !hasCustomerExpectation) {
    const gaps: string[] = [];
    if (!hasSubstantiveReason) {
      gaps.push(
        `state a substantive primary reason (at least ${MIN_REASON_CHARS} characters and ${MIN_REASON_WORDS} words)`,
      );
    }
    if (!hasCustomerExpectation) gaps.push("give a customer expectation");
    const reasoningGap = `Strengthen the reasoning: ${gaps.join(", ")}.`;
    return {
      quality: "possible",
      consequence:
        `${rail.name} is eligible for ${corridorLabelLower} and its prerequisites are gathered, but the recommendation is not yet fully reasoned; ` +
        "the synthetic customer would need clearer expectations before proceeding.",
      soundReasoning,
      reasoningGap,
      nextAction:
        `Describe what the customer should expect for timing, fees, and confirmation on the ${paymentLabelLower}.`,
      invalidRailIds: [],
      missingFactIds: [],
      workedExplanation,
    };
  }

  // 5) defensible: eligible + gathered + full expectations + substantive reason.
  //    T1: best-fit selection reflects what the learner actually gathered.
  const bestId = bestFitRailId(definition, requestedFactIds);
  const isBestFit = bestId !== undefined && bestId === rail.id;

  if (!isBestFit) {
    const preferredName = bestId ? findRail(definition, bestId)?.name ?? bestId : undefined;
    const fitClause = preferredName
      ? ` ${preferredName} is the better fit under the case's disclosed priorities.`
      : "";
    return {
      quality: "defensible",
      consequence:
        `${rail.name} would plausibly deliver the synthetic customer's ${paymentLabelLower} on ${corridorLabelLower} with the gathered facts, ` +
        `but it is not the best fit under the disclosed priorities.${fitClause}`,
      soundReasoning,
      reasoningGap: preferredName
        ? `Consider ${preferredName}, which better matches the case's disclosed priorities for the ${paymentLabelLower}.`
        : "Re-check whether another eligible rail better matches the case's priorities.",
      nextAction:
        `Either commit to this rail with justification, or re-recommend the best-fit rail for the ${paymentLabelLower}.`,
      invalidRailIds: [],
      missingFactIds: [],
      workedExplanation,
    };
  }

  // 6) preferred: defensible AND best fit under disclosed priorities.
  return {
    quality: "preferred",
    consequence:
      `${rail.name} is the best-fit rail for the synthetic customer's ${paymentLabelLower} on ${corridorLabelLower} and would deliver the expected outcome under the disclosed priorities.`,
    soundReasoning,
    reasoningGap: null,
    nextAction:
      `Release the ${paymentLabelLower} and share the customer expectation for ${corridorLabel}.`,
    invalidRailIds: [],
    missingFactIds: [],
    workedExplanation,
  };
}
