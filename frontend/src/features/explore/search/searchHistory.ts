export const SEARCH_HISTORY_KEY = "relay:search-history:v1";
export const SEARCH_HISTORY_LIMIT = 5;

export interface SearchHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): SearchHistoryStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueHistory(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = normalizeSearch(value);
    const identity = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(identity)) continue;
    seen.add(identity);
    result.push(normalized);
    if (result.length === SEARCH_HISTORY_LIMIT) break;
  }
  return result;
}

export function loadSearchHistory(storage = defaultStorage()): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return uniqueHistory(parsed);
    try { storage.removeItem(SEARCH_HISTORY_KEY); } catch { /* unavailable storage */ }
    return [];
  } catch {
    try { storage.removeItem(SEARCH_HISTORY_KEY); } catch { /* unavailable storage */ }
    return [];
  }
}

function persist(history: string[], storage = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage can be disabled or full; history is an enhancement, not a blocker.
  }
}

export function recordSearchHistory(value: string, storage = defaultStorage()): string[] {
  const normalized = normalizeSearch(value);
  if (!normalized) return loadSearchHistory(storage);
  const history = uniqueHistory([normalized, ...loadSearchHistory(storage)]);
  persist(history, storage);
  return history;
}

export function removeSearchHistory(value: string, storage = defaultStorage()): string[] {
  const identity = normalizeSearch(value).toLocaleLowerCase();
  const history = loadSearchHistory(storage).filter((entry) => entry.toLocaleLowerCase() !== identity);
  persist(history, storage);
  return history;
}
