import { z } from "zod";

export const CreateCounterpartySchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().or(z.literal("")).nullable(),
  address: z.string().optional().nullable(),
  type: z.enum(["SUPPLIER", "CUSTOMER", "BOTH"]),
  notes: z.string().optional().nullable(),
});

export const UpdateCounterpartySchema = CreateCounterpartySchema.partial();

export type CreateCounterpartyInput = z.infer<typeof CreateCounterpartySchema>;
export type UpdateCounterpartyInput = z.infer<typeof UpdateCounterpartySchema>;
