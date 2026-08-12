/**
 * Deterministic daily drill selection.
 *
 * The same learner, on the same day, with the same progress, always gets the
 * same five questions — so refreshing the page never re-rolls the drill.
 *
 * Selection order:
 *   1. Due spaced-review questions (missed previously, due today) — up to 2.
 *   2. Fresh questions drawn from completed modules, shuffled by a PRNG
 *      seeded from the day key.
 *
 * A learner with no completed modules still gets a drill from Lab 1
 * material, so the practice habit can start on day one.
 */

import type { PracticeQuestion } from "./questionBank";
import { QUESTION_BANK, getQuestionById } from "./questionBank";
import type { MissedEntry } from "./practiceStore";

export const DRILL_SIZE = 5;
const MAX_REVIEW_SLOTS = 2;

/** Deterministic 32-bit hash of a string (FNV-1a). */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function selectDailyQuestions(
  day: string,
  completedModuleIds: readonly string[],
  dueMissed: readonly MissedEntry[],
): PracticeQuestion[] {
  const rand = mulberry32(hashString(day));

  // Eligible pool: completed modules; lab-1 is always in so day-one learners
  // have something to drill.
  const eligibleModules = new Set(["lab-1", ...completedModuleIds]);
  const pool = QUESTION_BANK.filter((q) => eligibleModules.has(q.moduleId));

  // 1. Review slots — oldest due first, but only questions still in the
  //    eligible pool (a question can't be due if its module was never done,
  //    yet guard anyway against bank changes).
  const dueQuestions = [...dueMissed]
    .sort((a, b) => a.dueDay.localeCompare(b.dueDay))
    .map((m) => getQuestionById(m.questionId))
    .filter((q): q is PracticeQuestion => q !== undefined && eligibleModules.has(q.moduleId))
    .slice(0, MAX_REVIEW_SLOTS);

  const picked: PracticeQuestion[] = [...dueQuestions];
  const pickedIds = new Set(picked.map((q) => q.id));

  // 2. Fresh questions fill the rest.
  for (const q of shuffled(pool, rand)) {
    if (picked.length >= DRILL_SIZE) break;
    if (pickedIds.has(q.id)) continue;
    picked.push(q);
    pickedIds.add(q.id);
  }

  return picked;
}
