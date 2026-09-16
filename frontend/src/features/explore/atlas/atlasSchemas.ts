import { z } from "zod";

const status = z.enum(["unverified", "archived", "illustrative", "published"]);
const count = z.number().int().nonnegative();

export const AtlasStatusTierSchema = z.object({
  status,
  bic_only: z.boolean(),
  count,
}).strict();

export const AtlasTotalsSchema = z.object({
  ssi_rows: count,
  beneficiary_banks: count,
  correspondents: count,
  currencies: count,
}).strict();

export const AtlasEvidenceSchema = AtlasStatusTierSchema;

export const AtlasSpokeSchema = z.object({
  iso2: z.string().length(2),
  beneficiary_banks: count,
  rows: count,
  evidence: z.array(AtlasEvidenceSchema),
}).strict();

export const AtlasHubCountrySchema = z.object({
  iso2: z.string().length(2),
  banks_served: count,
  currencies: count,
  correspondents: count,
}).strict();

export const AtlasHubSchema = z.object({
  bic: z.string().min(1),
  name: z.string().min(1),
  iso2: z.string().length(2),
  banks_served: count,
  currencies: count,
}).strict();

export const AtlasNetworkSchema = z.object({
  scope: z.enum(["all", "settleable"]),
  totals: AtlasTotalsSchema,
  by_status_and_tier: z.array(AtlasStatusTierSchema),
  spokes: z.array(AtlasSpokeSchema),
  hub_countries: z.array(AtlasHubCountrySchema),
  hubs: z.array(AtlasHubSchema),
  observed_beneficiary_country_codes: z.array(z.string().length(2)),
  observed_intermediary_country_codes: z.array(z.string().length(2)),
  disclaimer: z.string().min(1),
}).strict();

export const AtlasCountryCountsSchema = z.object({
  beneficiary_banks: count,
  beneficiary_banks_total: count,
  rows: count,
  ssi_rows_total: count,
}).strict();

export const AtlasDisclosureSchema = z.object({
  beneficiary_bic: z.string().min(1),
  beneficiary_bank_name: z.string().min(1),
  status,
  bic_only: z.boolean(),
  row_count: count,
}).strict();

export const AtlasCountryCorrespondentSchema = z.object({
  bic: z.string().min(1),
  name: z.string().min(1),
  iso2: z.string().length(2),
  beneficiary_banks: count,
  currencies: z.array(z.string()),
  disclosures: z.array(AtlasDisclosureSchema),
}).strict();

export const AtlasCountrySchema = z.object({
  scope: z.enum(["all", "settleable"]),
  iso2: z.string().length(2),
  collected: z.boolean(),
  in_scope: AtlasCountryCountsSchema,
  all_scopes: AtlasCountryCountsSchema,
  correspondents: z.array(AtlasCountryCorrespondentSchema),
  disclaimer: z.string().min(1),
}).strict();

export type AtlasNetwork = z.infer<typeof AtlasNetworkSchema>;
export type AtlasSpoke = z.infer<typeof AtlasSpokeSchema>;
export type AtlasHubCountry = z.infer<typeof AtlasHubCountrySchema>;
export type AtlasHub = z.infer<typeof AtlasHubSchema>;
export type AtlasCountry = z.infer<typeof AtlasCountrySchema>;
export type AtlasCountryCorrespondent = z.infer<typeof AtlasCountryCorrespondentSchema>;
export type AtlasScope = z.infer<typeof AtlasNetworkSchema>["scope"];
