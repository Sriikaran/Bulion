import { z } from "zod";

const positiveDecimalString = (field: string) =>
  z
    .union([z.string(), z.number().transform((n) => n.toString())])
    .pipe(
      z
        .string()
        .min(1, `${field} is required`)
        .refine(
          (v) => {
            const n = parseFloat(v);
            return !isNaN(n) && n > 0;
          },
          { message: `${field} must be a strictly positive number` },
        ),
    );

export const CreateMarketRateSchema = z.object({
  metalId: z.string().min(1, "Metal is required"),
  purityId: z.string().min(1, "Purity is required"),
  unit: z.string().default("GRAM"),
  ratePerGram: positiveDecimalString("Rate per gram"),
  effectiveFrom: z.coerce.date({
    message: "A valid effective date and time is required",
  }),
  source: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreateMarketRateInput = z.infer<typeof CreateMarketRateSchema>;

export const GetMarketRateHistorySchema = z.object({
  metalId: z.string().optional(),
  purityId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  source: z.string().optional(),
});

export type GetMarketRateHistoryInput = z.infer<typeof GetMarketRateHistorySchema>;
