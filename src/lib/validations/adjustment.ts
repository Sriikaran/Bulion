/**
 * Adjustment validation schema — B1
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

export const CreateAdjustmentSchema = z.object({
  date: z.coerce.date(),
  metalId: z.string().min(1, "Metal is required"),
  purityId: z.string().min(1, "Purity is required"),
  direction: z.enum(["INCREASE", "DECREASE"]),
  weightGrams: positiveDecimalString("Weight"),
  reason: z.string().min(1, "Reason is required"),
  notes: z.string().optional(),
});

export type CreateAdjustmentInput = z.infer<typeof CreateAdjustmentSchema>;

export const SetOpeningStockSchema = z.object({
  metalId: z.string().min(1, "Metal is required"),
  purityId: z.string().min(1, "Purity is required"),
  weightGrams: z
    .string()
    .min(1, "Weight is required")
    .refine(
      (v) => {
        const n = parseFloat(v);
        return !isNaN(n) && n >= 0;
      },
      { message: "Weight must be zero or positive" },
    ),
  effectiveDate: z.coerce.date(),
  notes: z.string().optional(),
});

export type SetOpeningStockInput = z.infer<typeof SetOpeningStockSchema>;