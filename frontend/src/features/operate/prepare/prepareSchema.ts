import { z } from "zod";

/**
 * Input validation for the Prepare Payment form.
 * Matches app/schemas.py PreparePaymentRequest constraints.
 *
 * The IBAN is NOT always required: USD (and other non-IBAN corridors) settle
 * with a BIC + account number. The backend already treats a non-IBAN value in
 * `beneficiary_iban` as a domestic account number and passes validation when a
 * valid BIC is supplied. The "IBAN or BIC is required" rule is enforced in the
 * form via the field's `validate` callback (cross-field rules belong in the
 * form, not the schema — zodResolver drops schema-level `superRefine` custom
 * issues before they reach the field).
 */
export const preparePaymentInputSchema = z.object({
  beneficiary_iban: z.string().max(34, "IBAN or account number must be at most 34 characters"),
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
    .regex(/^[A-Za-z]{3}$/, "Currency must be 3 letters")
    .transform((v) => v.toUpperCase()),
  amount: z
    .number({ message: "Amount must be a number" })
    .positive("Amount must be greater than 0")
    .max(1_000_000_000, "Amount is too large"),
  strictness: z.enum(["lenient", "standard", "strict"]),
});

export type PreparePaymentInput = z.infer<typeof preparePaymentInputSchema>;
