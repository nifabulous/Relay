/**
 * Search types for the Relay Explore workspace.
 * Results are grouped by type and keyboard navigable.
 */

export type SearchResultType = "bank" | "lesson" | "glossary" | "scheme" | "tool";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  label: string;
  /** Secondary text — definition, country, or description */
  subtitle: string;
  href: string;
}

export interface SearchGroup {
  type: SearchResultType;
  label: string;
  results: SearchResult[];
}
