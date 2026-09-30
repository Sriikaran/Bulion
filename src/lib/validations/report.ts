import { z } from "zod";

export const ReportFilterSchema = z.object({
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
  metalId: z.string().optional().nullable(),
  purityId: z.string().optional().nullable(),
  counterpartyId: z.string().optional().nullable(),
  status: z.enum(["ALL", "DRAFT", "POSTED", "CANCELLED"]).optional().default("ALL"),
  movementType: z.string().optional().nullable(),
  search: z.string().optional().nullable(),
});

export type ReportFilterInput = z.infer<typeof ReportFilterSchema>;
