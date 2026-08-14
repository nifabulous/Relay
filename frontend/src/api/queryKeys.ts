/**
 * TanStack Query key factory for the Relay API.
 *
 * Keys are stable tuples (immutable `as const`) so they can be used as React
 * Query cache keys directly. Parameterized keys include their arguments so
 * that distinct inputs (e.g. different BICs or currencies) never collide.
 *
 * Usage:
 *   useQuery({ queryKey: apiKeys.validate(iban), queryFn: ... });
 *   queryClient.invalidateQueries({ queryKey: apiKeys.ssi.all });
 */

/**
 * Hierarchical, scope-able query keys.
 *
 * Each method returns a readonly tuple suitable for use as a `queryKey`.
 * Where a resource is parameterized, a `.all` sibling is also provided so a
 * caller can invalidate every entry of that kind at once, e.g.
 * `invalidateQueries({ queryKey: apiKeys.ssi.all })`.
 */
export const apiKeys = {
  health: ["health"] as const,

  validate: Object.assign(
    (value: string) => ["validate", value] as const,
    {
      all: ["validate"] as const,
    },
  ),

  lookup: Object.assign(
    (bic: string) => ["lookup", bic] as const,
    {
      all: ["lookup"] as const,
    },
  ),

  route: Object.assign(
    (bic: string, currency: string) => ["route", bic, currency] as const,
    {
      all: ["route"] as const,
    },
  ),

  ssi: Object.assign(
    (bic: string, currency: string) => ["ssi", bic, currency] as const,
    {
      all: ["ssi"] as const,
    },
  ),

  schemes: Object.assign(
    (currency: string) => ["schemes", currency] as const,
    {
      all: ["schemes"] as const,
    },
  ),

  // Whole-catalogue entry for the international / SWIFT rail. Scoped under
  // ["schemes"] so apiKeys.schemes.all invalidates it alongside the domestic
  // catalogue; "international" is not a currency code, so it can never collide
  // with a parameterized currency key.
  internationalSchemes: ["schemes", "international"] as const,

  vop: Object.assign(
    (iban: string) => ["vop", iban] as const,
    {
      all: ["vop"] as const,
    },
  ),

  prepare: Object.assign(
    (key: string) => ["prepare", key] as const,
    {
      all: ["prepare"] as const,
    },
  ),

  fee: Object.assign(
    (key: string) => ["fee", key] as const,
    {
      all: ["fee"] as const,
    },
  ),

  screen: Object.assign(
    (key: string) => ["screen", key] as const,
    {
      all: ["screen"] as const,
    },
  ),

  track: Object.assign(
    (uetr: string) => ["track", uetr] as const,
    {
      all: ["track"] as const,
    },
  ),

  progress: ["progress"] as const,
} as const;

/** Tuple type of every top-level key factory (useful for typing helpers). */
export type ApiKeyFactory = typeof apiKeys;
