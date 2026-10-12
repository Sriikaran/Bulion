import { z } from "zod";
import Decimal from "decimal.js";

export const CreateMarginRuleSchema = z.object({
  metalId: z.string().min(1, "Metal is required"),
  purityId: z.string().min(1, "Purity is required"),
  direction: z.enum(["BUY", "SELL"], {
    message: "Direction must be BUY or SELL",
  }),
  marginType: z.enum(["PERCENTAGE", "FIXED_PER_GRAM"], {
    message: "Margin type must be PERCENTAGE or FIXED_PER_GRAM",
  }),
  marginValue: z
    .union([z.string(), z.number()])
    .refine((val) => {
      try {
        const d = new Decimal(val.toString());
        return !d.isNaN() && d.greaterThan(0);
      } catch {
        return false;
      }
    }, "Margin value must be a strictly positive number")
    .transform((val) => val.toString()),
  effectiveFrom: z.coerce.date({
    message: "Effective from date is invalid",
  }),
  effectiveTo: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreateMarginRuleInput = z.infer<typeof CreateMarginRuleSchema>;

export const GetMarginRulesFilterSchema = z.object({
  metalId: z.string().optional(),
  purityId: z.string().optional(),
  direction: z.enum(["BUY", "SELL", "ALL"]).optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});

export type GetMarginRulesFilterInput = z.infer<typeof GetMarginRulesFilterSchema>;
