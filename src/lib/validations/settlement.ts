import { z } from "zod";

export const CreatePaymentSchema = z
  .object({
    type: z.enum(["PAYMENT", "RECEIPT"]),
    date: z.coerce.date(),
    amount: z.coerce.number().positive("Amount must be strictly greater than 0"),
    paymentMode: z.enum(["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"]),
    referenceNumber: z.string().trim().max(100).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    purchaseId: z.string().trim().optional().nullable(),
    saleId: z.string().trim().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.type === "PAYMENT") return !!data.purchaseId;
      if (data.type === "RECEIPT") return !!data.saleId;
      return false;
    },
    {
      message: "Purchase reference is required for PAYMENT, and Sale reference is required for RECEIPT",
      path: ["type"],
    },
  );

export const CancelPaymentSchema = z.object({
  id: z.string().min(1, "Payment ID is required"),
  reason: z.string().trim().min(3, "Cancellation reason must be at least 3 characters"),
});

export const OutstandingsFilterSchema = z.object({
  counterpartyId: z.string().optional().nullable(),
  type: z.enum(["ALL", "SUPPLIER", "CUSTOMER", "BOTH"]).optional().default("ALL"),
  status: z.enum(["ALL", "OUTSTANDING_ONLY", "SETTLED"]).optional().default("ALL"),
  search: z.string().optional().nullable(),
});

export const CounterpartyLedgerFilterSchema = z.object({
  counterpartyId: z.string().min(1, "Counterparty ID is required"),
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
});
