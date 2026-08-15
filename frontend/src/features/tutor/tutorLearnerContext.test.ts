import { describe, it, expect } from "vitest";
import { TutorContextSchema } from "../../api/schemas";
import type { PracticeState } from "../learn/practice/practiceStore";
import { QUESTION_BANK } from "../learn/practice/questionBank";
import {
  buildLearnerSummary,
  recommendNextModuleId,
  withLearnerSummary,
} from "./tutorLearnerContext";
import { buildLessonContext } from "./tutorContext";

/**
 * The learner summary is the only thing here that describes a *person* rather
 * than a payment concept. Everything else the tutor receives is curriculum or
 * catalogue data; this is behavioural.
 *
 * So the bar is different: it must carry enough for the tutor to pitch at the
 * right level, and nothing that would let anyone reconstruct what this learner
 * did, when, or how badly.
 */

const PRACTICE: PracticeState = {
  schemaVersion: 1,
  streak: 7,
  bestStreak: 22,
  lastPracticeDay: "2026-08-14",
  missed: [
    { questionId: "l1-bic-country", dueDay: "2026-08-15", misses: 3 },
    { questionId: "l4-nostro-vostro", dueDay: "2026-08-16", misses: 1 },
  ],
  history: [
    { day: "2026-08-14", correct: 3, total: 8 },
    { day: "2026-08-13", correct: 2, total: 8 },
  ],
};

describe("buildLearnerSummary", () => {
  it("says what the learner has covered and what to revisit", () => {
    const summary = buildLearnerSummary({
      completedModuleIds: ["lab-1", "lab-2"],
      practice: PRACTICE,
      currentModuleId: "lab-4",
    });
    expect(summary).toContain("2");
    expect(summary?.toLowerCase()).toContain("revisit");
  });

  it("names modules to revisit, never the questions that were missed", () => {
    /*
     * A list of missed question IDs is a behavioural profile: which exact
     * items this person got wrong. The module is the useful abstraction — it
     * tells the tutor what to pitch differently — and it carries none of that.
     */
    const summary = buildLearnerSummary({
      completedModuleIds: [],
      practice: PRACTICE,
      currentModuleId: "lab-4",
    });
    expect(summary).not.toContain("l1-bic-country");
    expect(summary).not.toContain("l4-nostro-vostro");
    expect(summary).toContain("lab-1");
  });

  it("never carries scores, streaks, or dates", () => {
    // Drill history is a day-by-day record of how someone performed. It has no
    // bearing on explaining a payment concept, and a model provider has no
    // reason to hold it.
    const summary = buildLearnerSummary({
      completedModuleIds: ["lab-1"],
      practice: PRACTICE,
      currentModuleId: "lab-4",
    }) as string;
    for (const leak of ["2026-08-14", "2026-08-13", "streak", "7", "22", "3/8"]) {
      expect(summary.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  it("never implies it knows what the learner actually answered", () => {
    /*
     * Relay records *that* a question was missed, not the answer given or the
     * rubric. A summary saying "the learner answered X incorrectly" would push
     * the model into explaining reasoning it has no evidence for — a confident
     * diagnosis of a mistake nobody recorded.
     */
    const summary = (buildLearnerSummary({
      completedModuleIds: [],
      practice: PRACTICE,
      currentModuleId: "lab-4",
    }) as string).toLowerCase();
    for (const overclaim of ["answered", "said", "chose", "got wrong", "mistake"]) {
      expect(summary).not.toContain(overclaim);
    }
  });

  it("caps the revisit list so one struggling learner cannot fill the prompt", () => {
    // Every real question in the bank, missed. Real IDs matter here: an
    // unrecognised ID resolves to no module and is dropped, so a fixture of
    // invented IDs would produce an empty summary and prove nothing.
    const many: PracticeState = {
      ...PRACTICE,
      missed: QUESTION_BANK.map((question) => ({
        questionId: question.id,
        dueDay: "2026-08-15",
        misses: 1,
      })),
    };
    const summary = buildLearnerSummary({
      completedModuleIds: [],
      practice: many,
      currentModuleId: "lab-1",
    }) as string;
    expect(summary.length).toBeLessThanOrEqual(600);
    // Three modules named, not the dozen the learner actually struggled with.
    expect(summary.split(",").length).toBeLessThanOrEqual(3);
  });

  it("drops a missed question that is not in the bank", () => {
    // Fail closed: an ID from an older build resolves to no module rather than
    // being passed through as an opaque string.
    const stale: PracticeState = {
      ...PRACTICE,
      missed: [{ questionId: "removed-in-a-past-release", dueDay: "2026-08-15", misses: 9 }],
    };
    expect(
      buildLearnerSummary({
        completedModuleIds: [],
        practice: stale,
        currentModuleId: "lab-1",
      }),
    ).toBeUndefined();
  });

  it("returns nothing for a learner with no history at all", () => {
    // A first-time learner has no progress to describe, and "the learner has
    // completed 0 modules" is noise that costs prompt budget.
    expect(
      buildLearnerSummary({
        completedModuleIds: [],
        practice: { ...PRACTICE, missed: [], history: [] },
        currentModuleId: undefined,
      }),
    ).toBeUndefined();
  });

  it("is stable for the same progress state", () => {
    // An unstable summary would change the prompt between two identical turns,
    // making a tutor answer impossible to reproduce in a bug report.
    const options = {
      completedModuleIds: ["lab-2", "lab-1"],
      practice: PRACTICE,
      currentModuleId: "lab-4",
    };
    expect(buildLearnerSummary(options)).toBe(buildLearnerSummary(options));
  });

  it("does not depend on the order modules were completed in", () => {
    const first = buildLearnerSummary({
      completedModuleIds: ["lab-1", "lab-2"],
      practice: PRACTICE,
      currentModuleId: "lab-4",
    });
    const second = buildLearnerSummary({
      completedModuleIds: ["lab-2", "lab-1"],
      practice: PRACTICE,
      currentModuleId: "lab-4",
    });
    expect(first).toBe(second);
  });
});

describe("recommendNextModuleId", () => {
  it("recommends the first unlocked module that is not complete", () => {
    expect(recommendNextModuleId([])).toBe("lab-1");
  });

  it("moves on once a module is complete", () => {
    expect(recommendNextModuleId(["lab-1"])).toBe("lab-2");
  });

  it("never recommends a module whose prerequisites are unmet", () => {
    // Recommending a locked module sends the learner somewhere they cannot go,
    // which reads as the tutor not knowing what Relay does.
    const next = recommendNextModuleId(["lab-1", "lab-2"]);
    expect(next).not.toBe("capstone");
  });

  it("returns null when everything is complete", () => {
    const everything = [
      "lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6", "lab-7", "lab-8",
      "lab-9", "gbp-eur-rails", "cad-rails", "fees-fx", "sanctions",
      "exceptions-returns", "ops-repair", "capstone",
    ];
    expect(recommendNextModuleId(everything)).toBeNull();
  });

  it("is deterministic — the same progress always gives the same recommendation", () => {
    expect(recommendNextModuleId(["lab-1"])).toBe(recommendNextModuleId(["lab-1"]));
  });
});

describe("withLearnerSummary", () => {
  it("attaches the summary without disturbing the rest of the context", () => {
    const base = buildLessonContext({ moduleId: "lab-4", moduleTitle: "Routing" });
    const enriched = withLearnerSummary(base, {
      completedModuleIds: ["lab-1"],
      practice: PRACTICE,
      currentModuleId: "lab-4",
    });
    expect(enriched.surface).toBe("lesson");
    expect(enriched.module_id).toBe("lab-4");
    expect(enriched.result_summary).toBeTruthy();
    expect(() => TutorContextSchema.parse(enriched)).not.toThrow();
  });

  it("leaves an existing result summary alone rather than overwriting it", () => {
    /*
     * On the tracking surface `result_summary` already holds the timeline the
     * learner is looking at. Replacing it with progress data would answer a
     * question about *this payment* using facts about the learner's homework.
     */
    const tracking = {
      surface: "tracking" as const,
      result_summary: "Visible status: In progress.",
    };
    const enriched = withLearnerSummary(tracking, {
      completedModuleIds: ["lab-1"],
      practice: PRACTICE,
      currentModuleId: undefined,
    });
    expect(enriched.result_summary).toBe("Visible status: In progress.");
  });

  it("returns the context unchanged for a learner with no history", () => {
    const base = buildLessonContext({ moduleId: "lab-1", moduleTitle: "Identifiers" });
    const enriched = withLearnerSummary(base, {
      completedModuleIds: [],
      practice: { ...PRACTICE, missed: [], history: [] },
      currentModuleId: "lab-1",
    });
    expect(enriched.result_summary).toBeUndefined();
  });
});

describe("the recommended next module rides in the summary", () => {
  it("names the next module so the recommendation is deterministic, not invented", () => {
    /*
     * "What should I learn next?" is a progress question, not a knowledge one.
     * Letting the model infer it from retrieved lesson cards would produce a
     * plausible answer unconnected to what this learner has actually finished.
     * The answer is computed here and handed over as a fact.
     */
    const summary = buildLearnerSummary({
      completedModuleIds: ["lab-1", "lab-2"],
      practice: PRACTICE,
      currentModuleId: "lab-3",
    }) as string;
    expect(summary).toContain("lab-3");
    expect(summary.toLowerCase()).toContain("next");
  });

  it("says nothing about what is next once everything is complete", () => {
    const everything = [
      "lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6", "lab-7", "lab-8",
      "lab-9", "gbp-eur-rails", "cad-rails", "fees-fx", "sanctions",
      "exceptions-returns", "ops-repair", "capstone",
    ];
    const summary = buildLearnerSummary({
      completedModuleIds: everything,
      practice: { ...PRACTICE, missed: [] },
      currentModuleId: undefined,
    }) as string;
    expect(summary.toLowerCase()).not.toContain("next");
  });
});
