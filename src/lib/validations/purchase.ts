/**
 * Purchase validation schema — B1
 *
 * Weight and rate are validated as STRINGS and passed as strings to the
 * service layer, which constructs Decimal objects. This avoids floating-point
 * loss that would occur with z.coerce.number().
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

export const CreatePurchaseSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  date: z.coerce.date(),
  supplierName: z.string().min(1, "Supplier name is required"),
  supplierContact: z.string().optional(),
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

export const CancelTransactionSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1, "Cancellation reason is required"),
});

export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>;
export type CancelTransactionInput = z.infer<typeof CancelTransactionSchema>;