import { format } from "./formatters";

export function archivedBand(archived: number, total: number): "none" | "light" | "heavy" {
  if (total <= 0 || archived / total < 0.25) return "none";
  return archived / total < 0.75 ? "light" : "heavy";
}
export function denominatorText(value: number, denominator: number, noun: string): string {
  return `${format(value)} of ${format(denominator)} ${noun}`;
}

export type CoverageCounts = {
  neverCollected: number;
  outOfScope: number;
  inScope: number;
  unmapped: string[];
  outOfScopeCodes: string[];
};

/** Classify corpus observations against the active scope and drawable map ids. */
export function coverageCounts(
  observedCodes: string[],
  scopedRows: Array<{ iso2: string; value: number }>,
  drawableCodes: Set<string>,
  knownUnresolvable: Set<string>,
): CoverageCounts {
  const scopedByCode = new Map(scopedRows.map((item) => [item.iso2.toUpperCase(), item.value]));
  const unmapped = observedCodes
    .map((code) => code.toUpperCase())
    .filter((code) => !drawableCodes.has(code) && knownUnresolvable.has(code))
    .sort();
  const drawableObserved = [...new Set(observedCodes.map((code) => code.toUpperCase()))]
    .filter((code) => drawableCodes.has(code));
  const outOfScopeCodes = drawableObserved.filter((code) => (scopedByCode.get(code) ?? 0) === 0).sort();
  const inScope = drawableObserved.filter((code) => (scopedByCode.get(code) ?? 0) > 0).length;
  return {
    neverCollected: Math.max(0, drawableCodes.size - drawableObserved.length),
    outOfScope: outOfScopeCodes.length,
    inScope,
    unmapped,
    outOfScopeCodes,
  };
}

export function coverageState(
  collected: boolean,
  rowsInScope: number,
  scope: "all" | "settleable",
): "never-collected" | "out-of-scope" | "in-scope" {
  if (!collected) return "never-collected";
  if (scope === "settleable" && rowsInScope === 0) return "out-of-scope";
  return "in-scope";
}
