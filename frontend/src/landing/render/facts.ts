/**
 * The landing facts contract. scripts/export_landing_facts.py writes it at
 * landing-build time; the renderer parses it here and fails the build on any
 * drift. Strict objects reject unknown keys, so a renamed field cannot pass.
 */
import { z } from "zod";

const count = z.number().int().nonnegative();
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const yearMonth = z.string().regex(/^\d{4}-\d{2}$/);

const place = z.strictObject({
  city: z.string().min(1),
  country: z.string().regex(/^[A-Z]{2}$/),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const scheme = z.strictObject({
  name: z.string().min(1),
  speed: z.string().min(1),
  limit: z.string().min(1),
  cost: z.string().min(1),
});

export const LandingFactsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  directory: z.strictObject({ banks: count, countries: count }),
  ssi: z.strictObject({
    rows: count,
    settleableRows: count,
    beneficiaryBanks: count,
    correspondents: count,
  }),
  atlas: z.strictObject({ beneficiaryCountries: count }),
  corridorRules: z.strictObject({ rows: count, corridors: count }),
  rails: z.strictObject({
    currencyCount: count,
    domesticSchemeCount: count,
    totalRailCount: count,
    currencies: z
      .array(
        z.strictObject({
          code: currencyCode,
          country: z.string().min(1),
          verifiedAsOf: yearMonth,
          schemes: z.array(scheme).min(1),
        }),
      )
      .min(1),
    international: z.strictObject({
      name: z.string().min(1),
      speed: z.string().min(1),
      limit: z.string().min(1),
      cost: z.string().min(1),
      verifiedAsOf: yearMonth,
    }),
  }),
  tools: z.strictObject({
    verdicts: count,
    watchlistEntries: count,
    holidayCalendars: count,
    settlementLagDays: z.strictObject({ min: count, max: count }),
    stpRules: count,
  }),
  corridors: z
    .array(
      z.strictObject({
        currency: currencyCode,
        origin: place,
        destination: place,
        source: z.enum(["case", "rule"]),
      }),
    )
    .min(1)
    .max(8),
});

export type LandingFacts = z.infer<typeof LandingFactsSchema>;
export type RailCurrency = LandingFacts["rails"]["currencies"][number];
export type Corridor = LandingFacts["corridors"][number];

export function parseLandingFacts(value: unknown): LandingFacts {
  return LandingFactsSchema.parse(value);
}
