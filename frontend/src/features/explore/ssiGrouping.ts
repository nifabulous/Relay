import type { SSIRecord } from "../../api/schemas";

export interface CurrencyGroup {
  currency: string;
  records: SSIRecord[];
}

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
 * Currencies are sorted alphabetically; records keep their source order within a
 * currency, which is the order the API returned them in.
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
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, groupRecords]) => ({ currency, records: groupRecords }));
}
