/**
 * Purchase validation schema — B1 & V3 Phase 1
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

export const CreatePurchaseSchema = z
  .object({
    invoiceNumber: z.string().min(1, "Invoice number is required"),
    date: z.coerce.date(),
    supplierName: z.string().min(1, "Supplier name is required"),
    supplierContact: z.string().optional(),
    counterpartyId: z.string().optional(),
    metalId: z.string().min(1, "Metal is required"),
    purityId: z.string().min(1, "Purity is required"),
    weightGrams: positiveDecimalString("Weight"),
    rateStatus: z.enum(["FIXED", "UNFIXED"]).default("FIXED"),
    ratePerGram: z.string().optional().nullable(),
    paymentMode: z
      .enum(["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"])
      .default("CASH"),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.rateStatus === "FIXED") {
      if (!data.ratePerGram || data.ratePerGram.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Rate per gram is required when rate status is FIXED",
          path: ["ratePerGram"],
        });
      } else {
        const n = parseFloat(data.ratePerGram);
        if (isNaN(n) || n <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Rate per gram must be a positive number",
            path: ["ratePerGram"],
          });
        }
      }
    }
  });

export const CancelTransactionSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1, "Cancellation reason is required"),
});

export const FixRateSchema = z.object({
  id: z.string().min(1, "Transaction ID is required"),
  ratePerGram: positiveDecimalString("Rate per gram"),
});

export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>;
export type CancelTransactionInput = z.infer<typeof CancelTransactionSchema>;
export type FixRateInput = z.infer<typeof FixRateSchema>;