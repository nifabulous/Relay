/** Currency codes the operate flow can route through the simulation. */
export const SUPPORTED_CURRENCY_CODES = [
  "AED", "AUD", "BHD", "BRL", "CAD", "CHF", "CNY", "DKK", "EUR", "GBP",
  "HKD", "IDR", "INR", "JPY", "KES", "KRW", "KWD", "LKR", "MXN", "MYR",
  "NGN", "NOK", "NZD", "OMR", "PHP", "PKR", "QAR", "SAR", "SEK", "SGD",
  "THB", "TRY", "TWD", "USD", "XOF", "ZAR",
] as const;

const SUPPORTED_CURRENCY_SET = new Set<string>(SUPPORTED_CURRENCY_CODES);

/** Keep API-provided currency context inside the same catalogue as the form. */
export function normalizeSupportedCurrency(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? "";
  return SUPPORTED_CURRENCY_SET.has(normalized) ? normalized : "";
}

/** Normalize and remove API-provided currencies outside the operate catalogue. */
export function filterSupportedCurrencies(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeSupportedCurrency).filter(Boolean))];
}
