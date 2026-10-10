/** Number formatting for the landing page. One locale, so counts read the same everywhere. */
const LOCALE = "en-GB";

export function formatCount(value: number): string {
  return value.toLocaleString(LOCALE);
}

export function formatAmount(value: number): string {
  return value.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Minutes as hours with at most one decimal place: 270 -> "4.5", 360 -> "6". */
export function formatHours(minutes: number): string {
  return String(Math.round((minutes / 60) * 10) / 10);
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
