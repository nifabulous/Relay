import type { AuthoredCaseDefinition } from "./caseTypes";
import type { CaseSession } from "./caseStore";

export interface CaseEntrySnapshot {
  definition: AuthoredCaseDefinition;
  session: CaseSession | null;
  index: number;
}

function timestampValue(session: CaseSession): number | null {
  const value = session.updatedAt?.trim();
  if (!value) return null;

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function newestByStatus(
  entries: readonly CaseEntrySnapshot[],
  status: CaseSession["status"],
): CaseEntrySnapshot | null {
  let newest: CaseEntrySnapshot | null = null;
  let newestTimestamp: number | null = null;

  for (const entry of entries) {
    if (entry.session?.status !== status) continue;

    const timestamp = timestampValue(entry.session);
    if (
      newest === null ||
      (timestamp !== null && (newestTimestamp === null || timestamp > newestTimestamp)) ||
      (timestamp === newestTimestamp && entry.index < newest.index)
    ) {
      newest = entry;
      newestTimestamp = timestamp;
    }
  }

  return newest;
}

export function selectDominantCase(entries: readonly CaseEntrySnapshot[]): CaseEntrySnapshot | null {
  if (entries.length === 0) return null;

  const inProgress = newestByStatus(
    entries.filter((entry) => entry.definition.reviewStatus !== "under_review"),
    "in_progress",
  );
  if (inProgress) return inProgress;

  const fresh = entries
    .filter(
      (entry) =>
        entry.definition.reviewStatus !== "under_review" &&
        (entry.session === null || entry.session.status === "not_started"),
    )
    .reduce<CaseEntrySnapshot | null>(
      (selected, entry) => (selected === null || entry.index < selected.index ? entry : selected),
      null,
    );
  if (fresh) return fresh;

  return newestByStatus(entries, "completed");
}
