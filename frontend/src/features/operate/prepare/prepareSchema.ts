import { z } from "zod";

/**
 * Input validation for the Prepare Payment form.
 * Matches app/schemas.py PreparePaymentRequest constraints.
 */
export const preparePaymentInputSchema = z.object({
  beneficiary_iban: z
    .string()
    .min(15, "IBAN must be at least 15 characters")
    .max(34, "IBAN must be at most 34 characters")
    .regex(/^[A-Z]{2}[0-9A-Z]+$/i, "IBAN must start with a 2-letter country code"),
  beneficiary_name: z
    .string()
    .min(1, "Beneficiary name is required")
    .max(200, "Name is too long"),
  beneficiary_bic: z
    .string()
    .max(11, "BIC must be at most 11 characters")
    .optional()
    .or(z.literal("")),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter code")
    .regex(/^[A-Z]{3}$/, "Currency must be 3 uppercase letters"),
  amount: z
    .number({ message: "Amount must be a number" })
    .positive("Amount must be greater than 0")
    .max(1_000_000_000, "Amount is too large"),
  strictness: z.enum(["lenient", "standard", "strict"]),
});

export type PreparePaymentInput = z.infer<typeof preparePaymentInputSchema>;
