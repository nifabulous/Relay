import type { SSIRecord } from "../../api/schemas";

export interface CurrencyGroup {
  currency: string;
  records: SSIRecord[];
}

/**
 * Global settlement-currency importance. The major settlement currencies
 * lead (USD first — the currency most payments are traced in — then EUR,
 * GBP, CAD, JPY, AUD, CHF); every other currency sorts alphabetically
 * after them. Keeps the currencies a learner is most likely to trace from
 * being buried under the A–C range.
 */
export const CURRENCY_IMPORTANCE = [
  "USD", "EUR", "GBP", "CAD", "JPY", "AUD", "CHF",
];

/**
 * Group settlement instructions by their own `currency` field.
 *
 * A bank commonly holds Nostro accounts with several correspondents in the SAME
 * currency — State Bank of India has four USD intermediaries — so the grouping
 * is one currency to many records, and flattening would hide that.
 *
 * Never group on SSIResponse.currency: when the request omits a currency the
 * endpoint sets that field to the sentinel string "ALL", which is not a currency.
 *
 * Currencies sort by CURRENCY_IMPORTANCE, then alphabetically; records keep
 * their source order within a currency, which is the order the API returned
 * them in.
 */
export function groupByCurrency(records: SSIRecord[]): CurrencyGroup[] {
  const byCurrency = new Map<string, SSIRecord[]>();

  for (const record of records) {
    if (!record.currency) continue;
    const existing = byCurrency.get(record.currency);
    if (existing) {
      existing.push(record);
    } else {
      byCurrency.set(record.currency, [record]);
    }
  }

  return [...byCurrency.entries()]
    .sort(([a], [b]) => {
      const rankA = CURRENCY_IMPORTANCE.indexOf(a);
      const rankB = CURRENCY_IMPORTANCE.indexOf(b);
      if (rankA !== -1 || rankB !== -1) {
        if (rankA === -1) return 1;
        if (rankB === -1) return -1;
        return rankA - rankB;
      }
      return a.localeCompare(b);
    })
    .map(([currency, groupRecords]) => ({ currency, records: groupRecords }));
}
