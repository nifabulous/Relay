/**
 * MOD-97 IBAN checksum algorithm — pure domain logic for Lab 2.
 *
 * The IBAN checksum works by:
 * 1. Moving the first 4 characters (country + check digits) to the end
 * 2. Converting each letter to its numeric value (A=10, B=11, ..., Z=35)
 * 3. Computing mod 97 of the resulting large number
 * 4. If the remainder is 1, the IBAN is valid
 *
 * JavaScript's Number type can't handle 30+ digit integers precisely,
 * so we use iterative chunked modulo (process 9 digits at a time).
 */

/**
 * Normalize an IBAN string: uppercase, remove spaces and non-alphanumeric chars.
 */
export function normalizeIban(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * Convert an IBAN to its numeric string representation for MOD-97.
 *
 * Steps:
 * 1. Move the first 4 characters (country code + check digits) to the end
 * 2. Convert each letter to a two-digit number (A=10, B=11, ..., Z=35)
 */
export function ibanToNumericString(iban: string): string {
  const normalized = normalizeIban(iban);
  if (normalized.length < 5) return "";

  // Step 1: rearrange — first 4 chars go to the end
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);

  // Step 2: convert letters to numbers
  let numeric = "";
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      // Digit 0-9
      numeric += char;
    } else if (code >= 65 && code <= 90) {
      // Letter A-Z → 10-35
      numeric += (code - 55).toString();
    }
  }

  return numeric;
}

/**
 * Compute the MOD-97 remainder of an IBAN.
 *
 * Uses chunked modulo to avoid JavaScript integer overflow:
 * Process the numeric string 9 digits at a time, carrying the remainder
 * forward as a prefix to the next chunk.
 *
 * @returns The remainder (1 = valid IBAN)
 * @throws Error if the input contains non-alphanumeric characters
 */
export function mod97Remainder(iban: string): number {
  const normalized = normalizeIban(iban);

  const numeric = ibanToNumericString(normalized);

  if (numeric.length === 0) {
    throw new Error("IBAN is too short to validate");
  }

  // Chunked MOD-97: process up to 9 digits at a time
  // Because 999999999 * 100 < 2^53 (safe integer range),
  // we can safely prepend the remainder to the next chunk.
  let remainder = 0;
  let position = 0;

  while (position < numeric.length) {
    // Take up to 9 digits, prepended with the current remainder
    const chunkSize = Math.min(9 - remainder.toString().length, numeric.length - position);
    const chunk = remainder.toString() + numeric.slice(position, position + chunkSize);
    remainder = Number(chunk) % 97;
    position += chunkSize;
  }

  return remainder;
}

export interface Mod97Steps {
  normalized: string;
  rearranged: string;
  numeric: string;
  chunks: { chunk: string; remainderAfter: number }[];
  remainder: number;
  valid: boolean;
}

/**
 * Produce the intermediate artifacts of the MOD-97 computation for teaching:
 * the rearrangement, the letter-to-number expansion, and the chunked-modulo
 * trace. Mirrors mod97Remainder's chunking exactly so the displayed remainder
 * matches the validator.
 */
export function mod97Steps(iban: string): Mod97Steps {
  const normalized = normalizeIban(iban);
  const rearranged = normalized.length >= 5
    ? normalized.slice(4) + normalized.slice(0, 4)
    : "";
  const numeric = ibanToNumericString(normalized);

  const chunks: { chunk: string; remainderAfter: number }[] = [];
  let remainder = 0;
  let position = 0;
  while (position < numeric.length) {
    const chunkSize = Math.min(9 - remainder.toString().length, numeric.length - position);
    const chunk = remainder.toString() + numeric.slice(position, position + chunkSize);
    remainder = Number(chunk) % 97;
    chunks.push({ chunk, remainderAfter: remainder });
    position += chunkSize;
  }

  return { normalized, rearranged, numeric, chunks, remainder, valid: remainder === 1 };
}
