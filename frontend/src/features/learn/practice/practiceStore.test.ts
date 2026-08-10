import { describe, it, expect, beforeEach } from "vitest";
import {
  defaultPracticeState,
  loadPracticeState,
  savePracticeState,
  recordDrill,
  dueReviews,
  practicedToday,
  displayStreak,
  dayKey,
  addDays,
} from "./practiceStore";

beforeEach(() => {
  localStorage.clear();
});

describe("dayKey / addDays", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 7, 9))).toBe("2026-08-09");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("recordDrill — streaks", () => {
  it("starts a streak at 1 on the first drill", () => {
    const next = recordDrill(defaultPracticeState, "2026-08-09", [
      { questionId: "q1", correct: true },
    ]);
    expect(next.streak).toBe(1);
    expect(next.bestStreak).toBe(1);
    expect(next.lastPracticeDay).toBe("2026-08-09");
  });

  it("extends the streak on consecutive days", () => {
    let state = recordDrill(defaultPracticeState, "2026-08-09", [{ questionId: "q1", correct: true }]);
    state = recordDrill(state, "2026-08-10", [{ questionId: "q2", correct: true }]);
    expect(state.streak).toBe(2);
    expect(state.bestStreak).toBe(2);
  });

  it("does not change the streak for a second drill on the same day", () => {
    let state = recordDrill(defaultPracticeState, "2026-08-09", [{ questionId: "q1", correct: true }]);
    state = recordDrill(state, "2026-08-09", [{ questionId: "q2", correct: false }]);
    expect(state.streak).toBe(1);
  });

  it("resets the streak after a missed day but keeps bestStreak", () => {
    let state = recordDrill(defaultPracticeState, "2026-08-09", [{ questionId: "q1", correct: true }]);
    state = recordDrill(state, "2026-08-10", [{ questionId: "q2", correct: true }]);
    state = recordDrill(state, "2026-08-13", [{ questionId: "q3", correct: true }]);
    expect(state.streak).toBe(1);
    expect(state.bestStreak).toBe(2);
  });
});

describe("recordDrill — spaced review", () => {
  it("queues wrong answers for review the next day", () => {
    const next = recordDrill(defaultPracticeState, "2026-08-09", [
      { questionId: "q1", correct: false },
      { questionId: "q2", correct: true },
    ]);
    expect(next.missed).toHaveLength(1);
    expect(next.missed[0]).toMatchObject({ questionId: "q1", dueDay: "2026-08-10", misses: 1 });
  });

  it("retires a missed question once answered correctly", () => {
    let state = recordDrill(defaultPracticeState, "2026-08-09", [{ questionId: "q1", correct: false }]);
    state = recordDrill(state, "2026-08-10", [{ questionId: "q1", correct: true }]);
    expect(state.missed).toHaveLength(0);
  });

  it("spaces repeat misses further out (1 → 3 → 7 days)", () => {
    let state = recordDrill(defaultPracticeState, "2026-08-09", [{ questionId: "q1", correct: false }]);
    state = recordDrill(state, "2026-08-10", [{ questionId: "q1", correct: false }]);
    expect(state.missed[0]).toMatchObject({ misses: 2, dueDay: "2026-08-13" });
    state = recordDrill(state, "2026-08-13", [{ questionId: "q1", correct: false }]);
    expect(state.missed[0]).toMatchObject({ misses: 3, dueDay: "2026-08-20" });
  });

  it("dueReviews only returns entries due on or before the day", () => {
    const state = recordDrill(defaultPracticeState, "2026-08-09", [
      { questionId: "q1", correct: false },
    ]);
    expect(dueReviews(state, "2026-08-09")).toHaveLength(0);
    expect(dueReviews(state, "2026-08-10")).toHaveLength(1);
    expect(dueReviews(state, "2026-08-15")).toHaveLength(1);
  });
});

describe("displayStreak / practicedToday", () => {
  it("shows the streak while it is still extendable", () => {
    const state = recordDrill(defaultPracticeState, "2026-08-09", [{ questionId: "q1", correct: true }]);
    expect(displayStreak(state, "2026-08-09")).toBe(1);
    expect(displayStreak(state, "2026-08-10")).toBe(1); // yesterday — still alive
    expect(displayStreak(state, "2026-08-11")).toBe(0); // broken
  });

  it("practicedToday matches only the same day", () => {
    const state = recordDrill(defaultPracticeState, "2026-08-09", [{ questionId: "q1", correct: true }]);
    expect(practicedToday(state, "2026-08-09")).toBe(true);
    expect(practicedToday(state, "2026-08-10")).toBe(false);
  });
});

describe("persistence", () => {
  it("round-trips through localStorage", () => {
    const state = recordDrill(defaultPracticeState, "2026-08-09", [
      { questionId: "q1", correct: false },
    ]);
    savePracticeState(state);
    expect(loadPracticeState()).toEqual(state);
  });

  it("returns defaults for corrupt data", () => {
    localStorage.setItem("relay:practice", "{nope");
    expect(loadPracticeState()).toEqual(defaultPracticeState);
  });

  it("caps history at 30 records", () => {
    let state = defaultPracticeState;
    for (let i = 0; i < 35; i++) {
      state = recordDrill(state, addDays("2026-01-01", i), [{ questionId: `q${i}`, correct: true }]);
    }
    expect(state.history).toHaveLength(30);
    // Newest first
    expect(state.history[0].day).toBe(addDays("2026-01-01", 34));
  });
});
