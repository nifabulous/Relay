import { describe, expect, it } from "vitest";
import {
  loadSearchHistory,
  recordSearchHistory,
  removeSearchHistory,
  type SearchHistoryStorage,
} from "./searchHistory";

function storage(seed?: string): SearchHistoryStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (seed !== undefined) values.set("relay:search-history:v1", seed);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("search history", () => {
  it("normalizes, deduplicates, orders newest first, and caps at five", () => {
    const store = storage();
    recordSearchHistory("  Citibank   N.A. ", store);
    recordSearchHistory("iban", store);
    recordSearchHistory("IBAN", store);
    recordSearchHistory("one", store);
    recordSearchHistory("two", store);
    recordSearchHistory("three", store);
    recordSearchHistory("four", store);

    expect(loadSearchHistory(store)).toEqual(["four", "three", "two", "one", "IBAN"]);
  });

  it("removes a normalized entry case-insensitively", () => {
    const store = storage(JSON.stringify(["IBAN", "Citibank N.A."]));

    removeSearchHistory("  citibank   n.a. ", store);

    expect(loadSearchHistory(store)).toEqual(["IBAN"]);
  });

  it("resets malformed JSON to empty", () => {
    expect(loadSearchHistory(storage("not-json"))).toEqual([]);
  });

  it.each(["getItem", "setItem", "removeItem"] as const)(
    "survives %s storage failures",
    (operation) => {
      const store = storage();
      store[operation] = () => { throw new DOMException("denied", "SecurityError"); };

      expect(() => {
        if (operation === "getItem") loadSearchHistory(store);
        if (operation === "setItem") recordSearchHistory("IBAN", store);
        if (operation === "removeItem") removeSearchHistory("IBAN", store);
      }).not.toThrow();
    },
  );

  it("does not persist when quota or storage access is unavailable", () => {
    const unavailable: SearchHistoryStorage = {
      getItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
      setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
      removeItem: () => { throw new DOMException("denied", "SecurityError"); },
    };

    expect(loadSearchHistory(unavailable)).toEqual([]);
    expect(() => recordSearchHistory("IBAN", unavailable)).not.toThrow();
    expect(() => removeSearchHistory("IBAN", unavailable)).not.toThrow();
  });
});
