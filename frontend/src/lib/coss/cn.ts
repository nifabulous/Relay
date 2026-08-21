type ClassName = string | false | null | undefined;

export function cn(...inputs: ClassName[]): string {
  return inputs.filter(Boolean).join(" ");
}
