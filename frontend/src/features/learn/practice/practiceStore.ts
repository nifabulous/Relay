/**
 * Persistence and streak logic for the daily practice drill.
 *
 * Follows the same versioned-localStorage contract as the rest of Relay
 * (schemaVersion: 1, corrupt data silently replaced with defaults).
 *
 * Retention model:
 * - One drill per day "counts". Completing a drill on consecutive calendar
 *   days extends the streak; missing a day resets it to 1 on the next drill.
 * - Questions answered wrong join the review queue with a due day. Due
 *   questions are re-asked at the start of the next drill (spaced review);
 *   answering one correctly retires it, missing it again pushes it out.
 */

import { loadVersioned, saveVersioned } from "../../../lib/persistence/storage";

const PRACTICE_KEY = "relay:practice";

export interface MissedEntry {
  questionId: string;
  /** Day key (YYYY-MM-DD) from which this question is due for review. */
  dueDay: string;
  /** How many times it has been missed in a row (spaces the review out). */
  misses: number;
}

export interface DrillRecord {
  day: string;
  correct: number;
  total: number;
}

export interface PracticeState {
  schemaVersion: 1;
  streak: number;
  bestStreak: number;
  lastPracticeDay: string | null;
  missed: MissedEntry[];
  history: DrillRecord[]; // newest-first, capped
}

const HISTORY_CAP = 30;

export const defaultPracticeState: PracticeState = {
  schemaVersion: 1,
  streak: 0,
  bestStreak: 0,
  lastPracticeDay: null,
  missed: [],
  history: [],
};

export function loadPracticeState(): PracticeState {
  return loadVersioned(PRACTICE_KEY, defaultPracticeState);
}

export function savePracticeState(state: PracticeState): void {
  saveVersioned(PRACTICE_KEY, state);
}

/** Format a Date as a local-timezone day key, e.g. "2026-08-09". */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The day key N days after the given day key (calendar-safe). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return dayKey(date);
}

function isConsecutive(prevDay: string, day: string): boolean {
  return addDays(prevDay, 1) === day;
}

/** Review intervals: first miss → next day, second → 3 days, then weekly. */
function reviewInterval(misses: number): number {
  if (misses <= 1) return 1;
  if (misses === 2) return 3;
  return 7;
}

export interface AnswerOutcome {
  questionId: string;
  correct: boolean;
}

/**
 * Fold a completed drill into the practice state. Pure function.
 *
 * Streak: first drill of the day extends/starts the streak; repeat drills on
 * the same day change history and the review queue but never the streak.
 */
export function recordDrill(
  state: PracticeState,
  day: string,
  outcomes: AnswerOutcome[],
): PracticeState {
  // ── Streak ──
  let streak = state.streak;
  if (state.lastPracticeDay !== day) {
    if (state.lastPracticeDay && isConsecutive(state.lastPracticeDay, day)) {
      streak = state.streak + 1;
    } else {
      streak = 1;
    }
  }
  const bestStreak = Math.max(state.bestStreak, streak);

  // ── Review queue ──
  const missed = new Map(state.missed.map((m) => [m.questionId, m]));
  for (const outcome of outcomes) {
    if (outcome.correct) {
      missed.delete(outcome.questionId);
    } else {
      const prior = missed.get(outcome.questionId);
      const misses = (prior?.misses ?? 0) + 1;
      missed.set(outcome.questionId, {
        questionId: outcome.questionId,
        misses,
        dueDay: addDays(day, reviewInterval(misses)),
      });
    }
  }

  // ── History ──
  const correct = outcomes.filter((o) => o.correct).length;
  const history = [
    { day, correct, total: outcomes.length },
    ...state.history,
  ].slice(0, HISTORY_CAP);

  return {
    schemaVersion: 1,
    streak,
    bestStreak,
    lastPracticeDay: day,
    missed: Array.from(missed.values()),
    history,
  };
}

/** Questions due for review on or before the given day. */
export function dueReviews(state: PracticeState, day: string): MissedEntry[] {
  return state.missed.filter((m) => m.dueDay <= day);
}

/** True when today's drill has already been completed. */
export function practicedToday(state: PracticeState, day: string): boolean {
  return state.lastPracticeDay === day;
}

/**
 * The streak to DISPLAY today: a streak whose last practice day is before
 * yesterday is already broken even though no drill has recorded it yet.
 */
export function displayStreak(state: PracticeState, day: string): number {
  if (!state.lastPracticeDay) return 0;
  if (state.lastPracticeDay === day) return state.streak;
  if (isConsecutive(state.lastPracticeDay, day)) return state.streak;
  return 0;
}
