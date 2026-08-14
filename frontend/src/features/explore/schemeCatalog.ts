/**
 * Payment Schemes catalogue tabs (plan task 3.1).
 *
 * The catalogue is organized by currency tabs with the whole-catalogue
 * International / SWIFT rail LAST. Labels are the display text; lookupCode is
 * the API currency code (null for the international rail, which is fetched
 * from /api/schemes/international, not a per-currency lookup).
 */

export interface SchemeTab {
  /** Stable id used for ARIA wiring (tab ids, panel ids). */
  id: string;
  /** Display label. */
  label: string;
  /** API currency lookup code, or null for the whole-catalogue rail. */
  lookupCode: string | null;
}

export const SCHEME_TAB_ORDER: readonly SchemeTab[] = [
  { id: "usd", label: "USD", lookupCode: "USD" },
  { id: "gbp", label: "GBP", lookupCode: "GBP" },
  { id: "eur", label: "EUR", lookupCode: "EUR" },
  { id: "cad", label: "CAD", lookupCode: "CAD" },
  { id: "ngn", label: "NGN", lookupCode: "NGN" },
  { id: "kes", label: "KES", lookupCode: "KES" },
  { id: "inr", label: "INR", lookupCode: "INR" },
  { id: "aud", label: "AUD", lookupCode: "AUD" },
  { id: "jpy", label: "JPY", lookupCode: "JPY" },
  { id: "aed", label: "AED", lookupCode: "AED" },
  { id: "international", label: "International / SWIFT", lookupCode: null },
] as const;

/** The tab selected on first load (USD — the settlement major). */
export const DEFAULT_SCHEME_TAB_ID = "usd";
