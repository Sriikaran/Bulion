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

export const CreateRateReservationSchema = z
  .object({
    type: z.enum(["PURCHASE", "SALE"]),
    transactionId: z.string().optional().nullable(),
    counterpartyId: z.string().optional().nullable(),
    metalId: z.string().optional().nullable(),
    purityId: z.string().optional().nullable(),
    referenceRatePerGram: z.string().optional().nullable(),
    marginType: z.enum(["PERCENTAGE", "FIXED_PER_GRAM"]).optional().nullable(),
    marginValue: z.string().optional().nullable(),
    weightGrams: positiveDecimalString("Reserved weight"),
    reservedRatePerGram: positiveDecimalString("Reserved rate per gram"),
    expiresAt: z.coerce.date().refine(
      (d) => d.getTime() > Date.now(),
      { message: "Expiry time must be in the future" },
    ),
    notes: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.transactionId && data.transactionId.trim()) return true;
      return Boolean(data.counterpartyId && data.metalId && data.purityId);
    },
    { message: "Either transactionId or (counterpartyId, metalId, purityId) must be provided for rate reservation" },
  );

export type CreateRateReservationInput = z.infer<typeof CreateRateReservationSchema>;

export const CancelRateReservationSchema = z.object({
  reservationId: z.string().min(1, "Reservation ID is required"),
  reason: z.string().optional().nullable(),
});

export type CancelRateReservationInput = z.infer<typeof CancelRateReservationSchema>;

export const ConsumeRateReservationSchema = z.object({
  reservationId: z.string().min(1, "Reservation ID is required"),
  invoiceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type ConsumeRateReservationInput = z.infer<typeof ConsumeRateReservationSchema>;
