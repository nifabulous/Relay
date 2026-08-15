import type { TutorContext } from "../../api/schemas";
import { getNextModule } from "../learn/curriculum";
import type { PracticeState } from "../learn/practice/practiceStore";
import { QUESTION_BANK } from "../learn/practice/questionBank";

/**
 * A bounded description of where a learner is, for the tutor to pitch against.
 *
 * This is the only thing the tutor receives that describes a *person* rather
 * than a payment concept, so the bar is different from every other context
 * builder. It has to carry enough for the tutor to know what has already been
 * covered, and nothing that would let anyone reconstruct what this learner did,
 * when, or how badly.
 *
 * **Modules, never questions.** `PracticeState.missed` holds question IDs — the
 * exact items this person got wrong, which is a behavioural profile. The module
 * is the useful abstraction: it tells the tutor what to pitch differently and
 * carries none of that detail.
 *
 * **Never scores, streaks, or dates.** `history` is a day-by-day record of how
 * someone performed. It has no bearing on explaining a payment concept, and a
 * model provider has no reason to hold it.
 *
 * **Never a claim about what was answered.** Relay records *that* a question was
 * missed — not the answer given, and not a rubric. A summary phrased as "the
 * learner answered X incorrectly" would push the model into diagnosing
 * reasoning it has no evidence for. The wording stays at "worth revisiting".
 */

/** Enough for the tutor to adjust; small enough that it cannot fill the prompt. */
const MAX_REVISIT_MODULES = 3;
const MAX_SUMMARY_LENGTH = 600;

export interface LearnerSummaryInput {
  completedModuleIds: string[];
  practice: PracticeState;
  currentModuleId?: string;
}

function moduleIdForQuestion(questionId: string): string | undefined {
  return QUESTION_BANK.find((question) => question.id === questionId)?.moduleId;
}

/**
 * Module IDs worth revisiting, most-missed first.
 *
 * Sorted by miss count and then by ID: a stable order matters because an
 * unstable summary changes the prompt between two otherwise identical turns,
 * which makes a tutor answer impossible to reproduce in a bug report.
 */
function revisitModuleIds(practice: PracticeState): string[] {
  const missesByModule = new Map<string, number>();
  for (const entry of practice.missed) {
    const moduleId = moduleIdForQuestion(entry.questionId);
    if (!moduleId) continue;
    missesByModule.set(moduleId, (missesByModule.get(moduleId) ?? 0) + entry.misses);
  }
  return [...missesByModule.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_REVISIT_MODULES)
    .map(([moduleId]) => moduleId);
}

export function buildLearnerSummary(input: LearnerSummaryInput): string | undefined {
  const completed = [...new Set(input.completedModuleIds)].sort();
  const revisit = revisitModuleIds(input.practice);

  // A first-time learner has no progress to describe, and "has completed 0
  // modules" is noise that costs prompt budget and tells the tutor nothing.
  if (completed.length === 0 && revisit.length === 0) return undefined;

  const parts: string[] = [];
  if (completed.length > 0) {
    parts.push(`Learner has completed ${completed.length} Relay modules`);
  }
  if (revisit.length > 0) {
    parts.push(`modules worth revisiting: ${revisit.join(", ")}`);
  }

  /*
   * The recommendation is computed, not inferred.
   *
   * "What should I learn next?" is a progress question, not a knowledge one.
   * Left to the model it would be answered from whichever lesson cards happened
   * to be retrieved — plausible, and unconnected to what this learner has
   * actually finished. Handing over the deterministic answer as a fact means
   * the model explains a recommendation rather than inventing one.
   */
  const next = recommendNextModuleId(completed);
  if (next) {
    parts.push(`next unlocked module: ${next}`);
  }

  return `${parts.join("; ")}.`.slice(0, MAX_SUMMARY_LENGTH);
}

/**
 * The next module to suggest, from deterministic progress data alone.
 *
 * Delegates to the curriculum's own `getNextModule` rather than reimplementing
 * it. Two answers to "what comes next" would drift, and the Learn pages and the
 * tutor disagreeing about that is worse than either being wrong.
 */
export function recommendNextModuleId(completedModuleIds: string[]): string | null {
  return getNextModule(completedModuleIds)?.id ?? null;
}

/**
 * Attach the learner summary to a context, if there is one and there is room.
 *
 * An existing `result_summary` is left alone. On the tracking surface it already
 * holds the timeline the learner is looking at, and replacing that with progress
 * data would answer a question about *this payment* using facts about their
 * homework.
 */
export function withLearnerSummary(
  context: TutorContext,
  input: LearnerSummaryInput,
): TutorContext {
  if (context.result_summary) return context;
  const summary = buildLearnerSummary(input);
  if (!summary) return context;
  return { ...context, result_summary: summary };
}
