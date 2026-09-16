/** ISO 3166 numeric identifiers used by the world-atlas topology. */
export const ISO_NUMERIC: Record<string, string> = {
  AE: "784", AG: "028", AL: "008", AM: "051", AO: "024", AR: "032", AT: "040",
  AU: "036", AW: "533", AZ: "031", BA: "070", BB: "052", BD: "050", BE: "056",
  BF: "854", BG: "100", BH: "048", BI: "108", BJ: "204", BM: "060", BN: "096",
  BO: "068", BQ: "535", BR: "076", BS: "044", BT: "064", BW: "072", BY: "112",
  CA: "124", CH: "756", CI: "384", CL: "152", CM: "120", CN: "156", CO: "170",
  CR: "188", CW: "531", CY: "196", CZ: "203", DE: "276", DJ: "262", DK: "208",
  DO: "214", DZ: "012", EC: "218", EE: "233", EG: "818", ES: "724", ET: "231",
  FI: "246", FJ: "242", FR: "250", GB: "826", GD: "308", GE: "268", GH: "288",
  GN: "324", GR: "300", GT: "320", GY: "328", HK: "344", HN: "340", HR: "191",
  HU: "348", ID: "360", IE: "372", IL: "376", IN: "356", IS: "352", IT: "380",
  JM: "388", JO: "400", JP: "392", KE: "404", KG: "417", KH: "116", KN: "659",
  KR: "410", KW: "414", KY: "136", KZ: "398", LC: "662", LI: "438", LK: "144",
  LR: "430", LS: "426", LT: "440", LU: "442", LV: "428", MA: "504", MD: "498",
  ME: "499", MG: "450", MK: "807", MN: "496", MO: "446", MT: "470", MU: "480",
  MV: "462", MW: "454", MX: "484", MY: "458", MZ: "508", NA: "516", NC: "540",
  NG: "566", NI: "558", NL: "528", NO: "578", NP: "524", NZ: "554", OM: "512",
  PA: "591", PE: "604", PH: "608", PK: "586", PL: "616", PR: "630", PT: "620",
  PY: "600", QA: "634", RO: "642", RS: "688", RU: "643", RW: "646", SA: "682",
  SE: "752", SG: "702", SI: "705", SK: "703", SM: "674", SN: "686", SS: "728",
  SV: "222", SX: "534", SZ: "748", TC: "796", TG: "768", TH: "764", TJ: "762",
  TN: "788", TR: "792", TT: "780", TW: "158", TZ: "834", UA: "804", UG: "800",
  US: "840", UY: "858", UZ: "860", VG: "092", VN: "704", ZA: "710", ZM: "894",
  ZW: "716",
};

/** Reviewed exceptions are explicit rather than silently dropping a country. */
export const KNOWN_UNRESOLVABLE: Record<string, string> = {
  BQ: "world-atlas 2.0.2 omits the Caribbean constituent country feature",
};

export function numericIdForIso2(iso2: string): string | undefined {
  return ISO_NUMERIC[iso2.toUpperCase()];
}

const ISO2_BY_NUMERIC = new Map(Object.entries(ISO_NUMERIC).map(([iso2, numeric]) => [numeric, iso2]));

export function iso2ForNumericId(id: string | number | undefined): string | undefined {
  if (id == null) return undefined;
  return ISO2_BY_NUMERIC.get(String(id).padStart(3, "0"));
}
