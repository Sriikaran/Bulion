import { z } from "zod";

export const CreateMetalSchema = z.object({
  code: z
    .string()
    .min(1, "Metal code is required")
    .transform((v) => v.toUpperCase()),
  name: z.string().min(1, "Metal name is required"),
  type: z.enum(["GOLD", "SILVER"]),
});

export const UpdateMetalSchema = z.object({
  name: z.string().min(1, "Metal name is required"),
});

export const CreatePuritySchema = z.object({
  metalId: z.string().min(1, "Metal is required"),
  label: z.string().min(1, "Purity label is required"),
  fineness: z
    .string()
    .min(1, "Fineness is required")
    .refine(
      (v) => {
        const n = parseFloat(v);
        return !isNaN(n) && n > 0 && n <= 1;
      },
      { message: "Fineness must be a fraction between 0 and 1.0000" },
    ),
  displayInfo: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

export const UpdatePuritySchema = z.object({
  label: z.string().min(1, "Purity label is required").optional(),
  fineness: z
    .string()
    .refine(
      (v) => {
        const n = parseFloat(v);
        return !isNaN(n) && n > 0 && n <= 1;
      },
      { message: "Fineness must be a fraction between 0 and 1.0000" },
    )
    .optional(),
  displayInfo: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
});

export type CreateMetalInput = z.infer<typeof CreateMetalSchema>;
export type UpdateMetalInput = z.infer<typeof UpdateMetalSchema>;
export type CreatePurityInput = z.infer<typeof CreatePuritySchema>;
export type UpdatePurityInput = z.infer<typeof UpdatePuritySchema>;
