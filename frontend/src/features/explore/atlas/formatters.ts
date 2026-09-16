export function format(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function percent(numerator: number, denominator: number): string {
  return denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "0%";
}
