import { apiRequest } from "../../../api/client";

/** One institution shape for every bank-discovery surface. */
export type DirectoryBank = {
  bic: string;
  bank_name: string;
  country_code: string;
  city?: string;
  country_currency?: string;
  capability?: "swift" | "local";
  verified?: boolean;
};

export type BankSearchResponse = {
  query: string;
  results: DirectoryBank[];
  total?: number;
};

export type BankDirectoryQuery = {
  q?: string;
  country?: string;
  capability?: "all" | "swift" | "local";
  verified?: boolean;
  limit?: number;
  offset?: number;
};

export function requestBankDirectory(query: BankDirectoryQuery): Promise<BankSearchResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.country && query.country !== "all") params.set("country", query.country);
  if (query.capability && query.capability !== "all") params.set("capability", query.capability);
  if (typeof query.verified === "boolean") params.set("verified", String(query.verified));
  if (typeof query.limit === "number") params.set("limit", String(query.limit));
  if (typeof query.offset === "number") params.set("offset", String(query.offset));

  return apiRequest<BankSearchResponse>(
    `/api/banks/search?${params.toString()}`,
  );
}
