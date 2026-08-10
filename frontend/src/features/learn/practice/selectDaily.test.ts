import { describe, it, expect } from "vitest";
import { selectDailyQuestions, DRILL_SIZE } from "./selectDaily";
import { QUESTION_BANK, questionsForModules } from "./questionBank";
import { CURRICULUM } from "../curriculum";

const ALL_MODULES = CURRICULUM.map((m) => m.id);

describe("question bank", () => {
  it("has unique question ids", () => {
    const ids = QUESTION_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has exactly one correct option per question", () => {
    for (const q of QUESTION_BANK) {
      expect(q.options.filter((o) => o.correct)).toHaveLength(1);
    }
  });

  it("only references real curriculum module ids", () => {
    const valid = new Set(ALL_MODULES);
    for (const q of QUESTION_BANK) {
      expect(valid.has(q.moduleId), `${q.id} references unknown module ${q.moduleId}`).toBe(true);
    }
  });

  it("covers every technical lab and the fees-fx module", () => {
    const covered = new Set(QUESTION_BANK.map((q) => q.moduleId));
    for (const id of ALL_MODULES.filter((m) => m !== "capstone")) {
      expect(covered.has(id), `no questions for ${id}`).toBe(true);
    }
  });

  it("questionsForModules filters by module", () => {
    const qs = questionsForModules(["lab-1"]);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.moduleId === "lab-1")).toBe(true);
  });
});

describe("selectDailyQuestions", () => {
  it("is deterministic for the same day and progress", () => {
    const a = selectDailyQuestions("2026-08-09", ALL_MODULES, []);
    const b = selectDailyQuestions("2026-08-09", ALL_MODULES, []);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it("differs between days (with a full pool)", () => {
    const a = selectDailyQuestions("2026-08-09", ALL_MODULES, []);
    const b = selectDailyQuestions("2026-08-10", ALL_MODULES, []);
    expect(a.map((q) => q.id)).not.toEqual(b.map((q) => q.id));
  });

  it("returns DRILL_SIZE questions when the pool is large enough", () => {
    const qs = selectDailyQuestions("2026-08-09", ALL_MODULES, []);
    expect(qs).toHaveLength(DRILL_SIZE);
  });

  it("only asks about completed modules (plus lab-1 for newcomers)", () => {
    const qs = selectDailyQuestions("2026-08-09", ["lab-2"], []);
    for (const q of qs) {
      expect(["lab-1", "lab-2"]).toContain(q.moduleId);
    }
  });

  it("gives a fresh learner a drill from lab-1 material", () => {
    const qs = selectDailyQuestions("2026-08-09", [], []);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.moduleId === "lab-1")).toBe(true);
  });

  it("puts due review questions first, capped at two", () => {
    const due = [
      { questionId: "l2-why-97", dueDay: "2026-08-08", misses: 1 },
      { questionId: "l3-close-match", dueDay: "2026-08-07", misses: 2 },
      { questionId: "l4-nostro", dueDay: "2026-08-09", misses: 1 },
    ];
    const qs = selectDailyQuestions("2026-08-09", ALL_MODULES, due);
    // Oldest due first: l3 (08-07) then l2 (08-08); l4 doesn't fit the review cap
    expect(qs[0].id).toBe("l3-close-match");
    expect(qs[1].id).toBe("l2-why-97");
    expect(qs).toHaveLength(DRILL_SIZE);
    // No duplicates
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
  });

  it("ignores due questions from modules the learner hasn't completed", () => {
    const due = [{ questionId: "l9-autodeposit", dueDay: "2026-08-01", misses: 1 }];
    const qs = selectDailyQuestions("2026-08-09", ["lab-1"], due);
    expect(qs.some((q) => q.id === "l9-autodeposit")).toBe(false);
  });
});
