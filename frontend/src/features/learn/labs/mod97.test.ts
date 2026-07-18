import { describe, it, expect } from "vitest";
import { normalizeIban, ibanToNumericString, mod97Remainder } from "./mod97";

describe("normalizeIban", () => {
  it("removes spaces and uppercases", () => {
    expect(normalizeIban("gb29 nwbk 6016 1331 9268 19")).toBe("GB29NWBK60161331926819");
  });

  it("handles already-normalized input", () => {
    expect(normalizeIban("DE89370400440532013000")).toBe("DE89370400440532013000");
  });

  it("handles empty input", () => {
    expect(normalizeIban("")).toBe("");
  });
});

describe("ibanToNumericString", () => {
  it("moves country+checksum to end and converts letters to numbers", () => {
    // GB29 → move to end → NWBK60161331926819GB29
    // N=14, W=23, B=11, K=20 → "14231120..."
    // The full numeric string should be: NWBK60161331926819 + GB + 29
    const result = ibanToNumericString("GB29NWBK60161331926819");
    // Should end with the country code checksum: G=16, B=11, then 29
    expect(result).toMatch(/^\d+$/);
    expect(result).toContain("1611"); // G=16, B=11
    expect(result).toContain("29"); // Checksum digits
  });

  it("converts German IBAN correctly", () => {
    const result = ibanToNumericString("DE89370400440532013000");
    expect(result).toMatch(/^\d+$/);
    // D=13, E=14 → should contain "1314" + "89" at the end
    expect(result).toContain("1314");
    expect(result).toContain("89");
  });
});

describe("mod97Remainder", () => {
  it("returns 1 for a valid UK IBAN", () => {
    // GB29NWBK60161331926819 is a real valid IBAN
    expect(mod97Remainder("GB29NWBK60161331926819")).toBe(1);
  });

  it("returns 1 for a valid German IBAN", () => {
    expect(mod97Remainder("DE89370400440532013000")).toBe(1);
  });

  it("returns non-1 for a corrupted IBAN", () => {
    // Flip the last digit
    expect(mod97Remainder("GB29NWBK60161331926818")).not.toBe(1);
  });

  it("returns non-1 for a completely wrong checksum", () => {
    expect(mod97Remainder("GB99NWBK60161331926819")).not.toBe(1);
  });

  it("handles lowercase input", () => {
    expect(mod97Remainder("gb29nwbk60161331926819")).toBe(1);
  });

  it("handles IBAN with spaces", () => {
    expect(mod97Remainder("GB29 NWBK 6016 1331 9268 19")).toBe(1);
  });

  it("strips non-alphanumeric characters before computing", () => {
    // Hyphens and special chars are stripped by normalizeIban
    expect(mod97Remainder("GB29-NWBK-6016-1331-9268-19")).toBe(1);
  });

  it("handles very long IBANs without integer overflow", () => {
    // Longest IBAN is 34 chars. This tests the chunked modulo approach.
    // A real 34-char IBAN: MT84MALT011000012345MTLCAST001S
    expect(() => mod97Remainder("MT84MALT011000012345MTLCAST001S")).not.toThrow();
    expect(mod97Remainder("MT84MALT011000012345MTLCAST001S")).toBe(1);
  });
});
