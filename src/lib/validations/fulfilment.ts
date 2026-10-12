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

export const CreateFulfilmentSchema = z.object({
  type: z.enum(["PURCHASE", "SALE"]),
  transactionId: z.string().min(1, "Transaction ID is required"),
  weightGrams: positiveDecimalString("Fulfilment weight"),
  date: z.coerce.date().default(() => new Date()),
  notes: z.string().optional().nullable(),
});

export type CreateFulfilmentInput = z.infer<typeof CreateFulfilmentSchema>;
