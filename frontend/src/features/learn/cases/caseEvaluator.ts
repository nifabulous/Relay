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
 *                   reasoning does not yet cover price/arrival/tracking.
 * - `defensible`  — eligible + facts gathered + reasoning covers the three
 *                   expectations with at least one fact-grounded reason.
 * - `preferred`   — defensible AND the selected rail is the best fit under the
 *                   case's disclosed priorities.
 *
 * Eligibility is derived deterministically from the case's corridor facts
 * (destination country / currency) against cues in each rail's authored
 * `eligibility` string. All data is authored by us, so this keyword contract is
 * stable and explainable.
 */

import type {
  CaseDefinition,
  CaseFact,
  CaseOutcome,
  RailOption,
  RecommendationDraft,
} from "./caseTypes";

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

/** True if the rail is explicitly domestic-only in its eligibility text. */
function isDomesticOnlyRail(rail: RailOption): boolean {
  const text = `${rail.eligibility} ${rail.name}`.toLowerCase();
  return /\bdomestic\b|canada only|within canada|cad only|in-country only/.test(text);
}

/** True if the case's destination is the United States. */
function destinationIsUnitedStates(definition: CaseDefinition): boolean {
  const dest = factValueLower(definition, "destination-country");
  return /\bunited states\b|\bu\.?s\.?(a)?\b/.test(dest);
}

/** True if the case's destination currency is USD. */
function destinationIsUsd(definition: CaseDefinition): boolean {
  const ccy = factValueLower(definition, "destination-currency");
  return /\busd\b|u\.?s\.? dollar/.test(ccy);
}

/**
 * A rail is ineligible when it is domestic-only but the case targets the US,
 * OR when its eligibility text calls out a currency the case does not use.
 */
function isRailIneligible(definition: CaseDefinition, rail: RailOption): boolean {
  if (isDomesticOnlyRail(rail) && destinationIsUnitedStates(definition)) {
    return true;
  }
  // Currency-exclusion: "X only" where X is a currency the case does NOT use.
  const caseUsd = destinationIsUsd(definition);
  const eligibility = rail.eligibility.toLowerCase();
  if (/\bcad\b/.test(eligibility) && /\bonly\b/.test(eligibility) && caseUsd) {
    return true;
  }
  if (/\busd\b/.test(eligibility) && /\bonly\b/.test(eligibility) && !caseUsd) {
    return true;
  }
  return false;
}

function findRail(definition: CaseDefinition, id: string): RailOption | undefined {
  return definition.rails.find((r) => r.id === id);
}

/** Required facts for a rail that are still in the `unknown` state. */
function missingRequiredFacts(definition: CaseDefinition, rail: RailOption): string[] {
  return rail.requiredFacts.filter((id) => {
    const fact = findFact(definition, id);
    return !fact || fact.state === "unknown";
  });
}

function isNonEmpty(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * Determine the case's disclosed priorities from its facts. Returns a set of
 * priority tags the best-fit rail can be matched against. Conservative and
 * case-shaped: only flags a priority when the corresponding fact is present and
 * (for requestable facts) actually gathered.
 *
 * Exported so the catalog↔evaluator keyword contract is directly testable: a
 * catalog test can assert "this case discloses urgency+tracking+cost" without
 * going through the full tier scoring.
 */
export function disclosedPriorities(definition: CaseDefinition): Set<"urgency" | "tracking" | "cost"> {
  const priorities = new Set<"urgency" | "tracking" | "cost">();
  const urgency = findFact(definition, "urgency");
  if (urgency && urgency.state !== "unknown" && hasWord(urgency.value, /business day|urgent|asap|deadline|time-critical|within \d/)) {
    priorities.add("urgency");
  }
  const tracking = findFact(definition, "tracking-need");
  if (tracking && tracking.state !== "unknown" && hasWord(tracking.value, /track|tracking|uetr|confirmation of credit|confirm/)) {
    priorities.add("tracking");
  }
  const price = findFact(definition, "price-sensitivity");
  if (price && price.state !== "unknown" && hasWord(price.value, /fee|cost|cheap|price|sensitivity|budget|willing to pay/)) {
    priorities.add("cost");
  }
  return priorities;
}

/** A rail satisfies a priority if its authored reasons mention the relevant cue. */
function railSatisfies(rail: RailOption, priority: "urgency" | "tracking" | "cost"): boolean {
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
 * Exported so the catalog↔evaluator contract is directly testable: a catalog
 * test can assert "swift-fedwire is the best-fit rail for this case" without
 * building a full draft and tracing it through tier scoring.
 */
export function bestFitRailId(definition: CaseDefinition): string | undefined {
  const priorities = disclosedPriorities(definition);
  if (priorities.size === 0) return undefined;

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
 * Unknown shortlist ids are ignored (they cannot be scored and are surfaced
 * downstream as part of the selection review).
 */
export function validateShortlist(
  definition: CaseDefinition,
  draft: RecommendationDraft,
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
    for (const factId of missingRequiredFacts(definition, rail)) {
      missing.add(factId);
    }
  }

  return {
    invalidRailIds,
    missingFactIds: Array.from(missing),
  };
}

// ─── evaluateRecommendation ─────────────────────────────────────────────────
// NOTE: the consequence/nextAction prose below assumes the CA→US/USD corridor
// (the only case in Phase 1). The grading LOGIC is corridor-agnostic, but the
// human-readable copy hardcodes "USD" and "United States". Generalize the copy
// when Phase 2 adds a second case.

function emptyOutcome(): CaseOutcome {
  return {
    quality: "invalid",
    consequence: "",
    soundReasoning: [],
    reasoningGap: null,
    nextAction: "",
    invalidRailIds: [],
    missingFactIds: [],
  };
}

/**
 * Score a learner's recommendation against the case's disclosed facts and rail
 * eligibility. Pure and deterministic.
 */
export function evaluateRecommendation(
  definition: CaseDefinition,
  draft: RecommendationDraft,
): CaseOutcome {
  // 1) No selection at all.
  if (draft.selectedRail === null) {
    return {
      ...emptyOutcome(),
      consequence:
        "No rail was selected, so the synthetic customer's supplier payment cannot be released.",
      reasoningGap: "Select a payment rail to recommend.",
      nextAction: "Shortlist at least one eligible rail and pick one to recommend.",
    };
  }

  const rail = findRail(definition, draft.selectedRail);
  if (!rail) {
    return {
      ...emptyOutcome(),
      consequence:
        "The recommended rail is not part of this case, so the synthetic customer's payment cannot be released.",
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
        `Recommending ${rail.name} would not deliver the synthetic customer's USD payment to the United States; ` +
        "this rail does not serve that corridor.",
      reasoningGap: `Confirm the rail's eligibility: ${rail.eligibility}`,
      nextAction: "Re-shortlist using a rail whose eligibility matches USD to the United States.",
    };
  }

  // 3) Missing required facts → cannot responsibly recommend yet.
  const missing = missingRequiredFacts(definition, rail);
  if (missing.length > 0) {
    return {
      ...emptyOutcome(),
      missingFactIds: missing,
      consequence:
        `Recommending ${rail.name} before the required facts are gathered could mislead the synthetic customer; ` +
        "key information is still unknown.",
      reasoningGap: `Gather the required facts before recommending: ${missing.join(", ")}`,
      nextAction: "Request the missing facts, then re-evaluate this rail.",
    };
  }

  // 4) Eligible + facts gathered. Now grade the reasoning.
  const expectationsCovered = {
    price: isNonEmpty(draft.priceExpectation),
    arrival: isNonEmpty(draft.arrivalExpectation),
    tracking: isNonEmpty(draft.trackingExpectation),
  };
  const hasReasons = draft.reasons.some((r) => isNonEmpty(r));

  const soundReasoning: string[] = [];
  if (hasReasons) {
    soundReasoning.push("Gave at least one reason for the recommendation.");
  }
  if (expectationsCovered.price) soundReasoning.push("Articulated a price expectation.");
  if (expectationsCovered.arrival) soundReasoning.push("Articulated an arrival expectation.");
  if (expectationsCovered.tracking) soundReasoning.push("Articulated a tracking expectation.");

  const coveredCount =
    Number(expectationsCovered.price) +
    Number(expectationsCovered.arrival) +
    Number(expectationsCovered.tracking);

  // possible: eligible + facts, but reasoning is thin.
  if (!hasReasons || coveredCount < 3) {
    const gaps: string[] = [];
    if (!hasReasons) gaps.push("state at least one reason");
    if (!expectationsCovered.price) gaps.push("give a price expectation");
    if (!expectationsCovered.arrival) gaps.push("give an arrival expectation");
    if (!expectationsCovered.tracking) gaps.push("give a tracking expectation");
    const reasoningGap = `Strengthen the reasoning: ${gaps.join(", ")}.`;
    return {
      quality: "possible",
      consequence:
        `${rail.name} is eligible and its prerequisites are gathered, but the recommendation is not yet fully reasoned; ` +
        "the synthetic customer would need clearer expectations before proceeding.",
      soundReasoning,
      reasoningGap,
      nextAction: "Fill in the price, arrival, and tracking expectations with fact-grounded reasons.",
      invalidRailIds: [],
      missingFactIds: [],
    };
  }

  // 5) defensible: eligible + gathered + full expectations + reasons.
  const bestId = bestFitRailId(definition);
  const isBestFit = bestId !== undefined && bestId === rail.id;

  if (!isBestFit) {
    const preferredName = bestId ? findRail(definition, bestId)?.name ?? bestId : undefined;
    const fitClause = preferredName
      ? ` ${preferredName} is the better fit under the case's disclosed priorities.`
      : "";
    return {
      quality: "defensible",
      consequence:
        `${rail.name} would plausibly deliver the synthetic customer's USD payment with the gathered facts, ` +
        `but it is not the best fit under the disclosed priorities.${fitClause}`,
      soundReasoning,
      reasoningGap: preferredName
        ? `Consider ${preferredName}, which better matches the case's urgency and tracking priorities.`
        : "Re-check whether another eligible rail better matches the case's priorities.",
      nextAction: "Either commit to this rail with justification, or re-recommend the best-fit rail.",
      invalidRailIds: [],
      missingFactIds: [],
    };
  }

  // 6) preferred: defensible AND best fit under disclosed priorities.
  return {
    quality: "preferred",
    consequence:
      `${rail.name} is the best-fit rail under the case's disclosed urgency and tracking priorities and would deliver ` +
      "the synthetic customer's USD supplier payment on time with confirmation of credit.",
    soundReasoning,
    reasoningGap: null,
    nextAction: "Release the payment and share the tracking expectation with the synthetic customer.",
    invalidRailIds: [],
    missingFactIds: [],
  };
}
