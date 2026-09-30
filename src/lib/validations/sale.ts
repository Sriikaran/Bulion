/**
 * Sale validation schema — B1
 *
 * Weight and rate are validated as STRINGS and passed as strings to the
 * service layer, which constructs Decimal objects.
 */
import { z } from "zod";

const positiveDecimalString = (field: string) =>
  z
    .string()
    .min(1, `${field} is required`)
    .refine(
      (v) => {
        const n = parseFloat(v);
        return !isNaN(n) && n > 0;
      },
      { message: `${field} must be a positive number` },
    );

export const CreateSaleSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  date: z.coerce.date(),
  buyerName: z.string().min(1, "Buyer name is required"),
  buyerContact: z.string().optional(),
  counterpartyId: z.string().optional(),
  metalId: z.string().min(1, "Metal is required"),
  purityId: z.string().min(1, "Purity is required"),
  weightGrams: positiveDecimalString("Weight"),
  ratePerGram: positiveDecimalString("Rate per gram"),
  paymentMode: z
    .enum(["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"])
    .default("CASH"),
  notes: z.string().optional(),
});

export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;