"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { setOpeningStock } from "@/lib/services/opening-stock-service";
import {
  createAdjustment,
  cancelAdjustment,
} from "@/lib/services/adjustment-service";
import {
  CreateAdjustmentSchema,
  SetOpeningStockSchema,
} from "@/lib/validations/adjustment";
import { CancelTransactionSchema } from "@/lib/validations/purchase";
import { sanitizeErrorMessage } from "@/lib/utils/errors";
import { serializeForClient } from "@/lib/utils/serialize";

export async function setOpeningStockAction(formData: unknown) {
  try {
    const admin = await requireAdmin();
    const parsed = SetOpeningStockSchema.parse(formData);

    const opening = await setOpeningStock(admin.id, admin.role, {
      metalId: parsed.metalId,
      purityId: parsed.purityId,
      weightGrams: parsed.weightGrams,
      effectiveDate: parsed.effectiveDate,
      notes: parsed.notes,
    });

    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(opening) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to set opening stock") };
  }
}

export async function createAdjustmentAction(formData: unknown) {
  try {
    const admin = await requireAdmin();
    const parsed = CreateAdjustmentSchema.parse(formData);

    const adj = await createAdjustment(admin.id, admin.role, {
      date: parsed.date,
      metalId: parsed.metalId,
      purityId: parsed.purityId,
      direction: parsed.direction,
      weightGrams: parsed.weightGrams,
      reason: parsed.reason,
      notes: parsed.notes,
    });

    revalidatePath("/adjustments");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(adj) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to record adjustment") };
  }
}

export async function cancelAdjustmentAction(formData: unknown) {
  try {
    const admin = await requireAdmin();
    const parsed = CancelTransactionSchema.parse(formData);

    const cancelled = await cancelAdjustment(
      admin.id,
      admin.role,
      parsed.id,
      parsed.reason,
    );

    revalidatePath("/adjustments");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(cancelled) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to cancel adjustment") };
  }
}

export async function getAvailableStockAction(metalId: string, purityId: string) {
  try {
    const { getCurrentStock } = await import("@/lib/services/stock-service");
    const stock = await getCurrentStock(metalId, purityId);
    return { success: true, availableGrams: stock.toString() };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch stock";
    return { success: false, error: message, availableGrams: "0.0000" };
  }
}

export async function getBucketMovementsAction(metalId: string, purityId: string) {
  try {
    const { getBucketMovements } = await import("@/lib/services/stock-service");
    const movements = await getBucketMovements(metalId, purityId);
    const serialized = movements.map((m) => ({
      id: m.id,
      movementType: m.movementType,
      weightGrams: m.weightGrams.toString(),
      reference: m.reference,
      createdAt: m.createdAt.toISOString(),
      createdByName: m.createdBy.name,
    }));
    return { success: true, movements: serialized };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch movements";
    return { success: false, error: message, movements: [] };
  }
}
