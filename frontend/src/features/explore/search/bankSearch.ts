import { apiRequest } from "../../../api/client";

export type BankSearchResponse = {
  query: string;
  results: Array<{
    bic: string;
    bank_name: string;
    country_code: string;
    city?: string;
    country_currency?: string;
  }>;
};

export function requestBankSearch(query: string): Promise<BankSearchResponse> {
  return apiRequest<BankSearchResponse>(
    `/api/banks/search?q=${encodeURIComponent(query)}`,
  );
}
