import { z } from "zod";
import Decimal from "decimal.js";

export const CalculateQuoteSchema = z.object({
  metalId: z.string().min(1, "Metal is required"),
  purityId: z.string().min(1, "Purity is required"),
  direction: z.enum(["BUY", "SELL"], {
    message: "Direction must be BUY or SELL",
  }),
  weightGrams: z
    .union([z.string(), z.number()])
    .refine((val) => {
      try {
        const d = new Decimal(val.toString());
        return !d.isNaN() && d.greaterThan(0);
      } catch {
        return false;
      }
    }, "Weight in grams must be strictly positive")
    .transform((val) => val.toString()),
  asOf: z.coerce.date().optional(),
});

export type CalculateQuoteInput = z.infer<typeof CalculateQuoteSchema>;

export const CreateQuoteSchema = z.object({
  metalId: z.string().min(1, "Metal is required"),
  purityId: z.string().min(1, "Purity is required"),
  direction: z.enum(["BUY", "SELL"], {
    message: "Direction must be BUY or SELL",
  }),
  weightGrams: z
    .union([z.string(), z.number()])
    .refine((val) => {
      try {
        const d = new Decimal(val.toString());
        return !d.isNaN() && d.greaterThan(0);
      } catch {
        return false;
      }
    }, "Weight in grams must be strictly positive")
    .transform((val) => val.toString()),
  validUntilMinutes: z.number().int().positive().default(30).optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().optional().nullable(),
});

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;

export const ConsumeQuoteSchema = z.object({
  quoteId: z.string().min(1, "Quote ID is required"),
  purchaseId: z.string().optional().nullable(),
  saleId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type ConsumeQuoteInput = z.infer<typeof ConsumeQuoteSchema>;

export const CancelQuoteSchema = z.object({
  quoteId: z.string().min(1, "Quote ID is required"),
  reason: z.string().optional().nullable(),
});

export type CancelQuoteInput = z.infer<typeof CancelQuoteSchema>;

export const ConvertQuoteToDealSchema = z.object({
  quoteId: z.string().min(1, "Quote ID is required"),
  counterpartyId: z.string().min(1, "Counterparty is required"),
  invoiceNumber: z.string().optional().nullable(),
  partyName: z.string().optional().nullable(),
  partyContact: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type ConvertQuoteToDealInput = z.infer<typeof ConvertQuoteToDealSchema>;

export const GetQuotesFilterSchema = z.object({
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  quoteNumber: z.string().optional(),
  direction: z.enum(["BUY", "SELL", "ALL"]).optional(),
  metalId: z.string().optional(),
  purityId: z.string().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "CONSUMED", "CANCELLED", "ALL"]).optional(),
  search: z.string().optional(),
});

export type GetQuotesFilterInput = z.infer<typeof GetQuotesFilterSchema>;
