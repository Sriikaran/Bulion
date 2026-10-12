"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  recordFulfilment,
  getFulfilmentSummary,
} from "@/lib/services/fulfilment-service";
import { CreateFulfilmentSchema } from "@/lib/validations/fulfilment";
import { sanitizeErrorMessage } from "@/lib/utils/errors";
import { serializeForClient } from "@/lib/utils/serialize";

export async function recordFulfilmentAction(formData: unknown) {
  try {
    const user = await requireUser();
    const parsed = CreateFulfilmentSchema.parse(formData);

    const result = await recordFulfilment(user.id, user.role, {
      type: parsed.type,
      transactionId: parsed.transactionId,
      weightGrams: parsed.weightGrams,
      date: parsed.date,
      notes: parsed.notes,
    });

    revalidatePath("/purchases");
    revalidatePath("/sales");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/reports/fulfilment");
    revalidatePath("/reports/purchases");
    revalidatePath("/reports/sales");
    revalidatePath("/reports/stock");
    revalidatePath("/reports/transactions");
    revalidatePath("/dashboard");

    return { success: true, data: serializeForClient(result) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to record physical delivery fulfilment") };
  }
}

export async function getFulfilmentSummaryAction(
  type: "PURCHASE" | "SALE",
  transactionId: string,
) {
  try {
    await requireUser();
    const summary = await getFulfilmentSummary(type, transactionId);
    return { success: true, data: serializeForClient(summary) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to fetch fulfilment summary") };
  }
}
