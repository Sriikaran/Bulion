"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import {
  createMetal,
  updateMetal,
  setMetalActive,
  createPurity,
  updatePurity,
  setPurityActive,
} from "@/lib/services/master-service";
import {
  CreateMetalSchema,
  UpdateMetalSchema,
  CreatePuritySchema,
  UpdatePuritySchema,
} from "@/lib/validations/master";
import { sanitizeErrorMessage } from "@/lib/utils/errors";
import { serializeForClient } from "@/lib/utils/serialize";

export async function createMetalAction(formData: unknown) {
  try {
    const admin = await requireAdmin();
    const parsed = CreateMetalSchema.parse(formData);

    const metal = await createMetal(admin.id, admin.role, {
      code: parsed.code,
      name: parsed.name,
      type: parsed.type,
    });

    revalidatePath("/masters");
    return { success: true, data: serializeForClient(metal) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to create metal") };
  }
}

export async function updateMetalAction(metalId: string, formData: unknown) {
  try {
    const admin = await requireAdmin();
    const parsed = UpdateMetalSchema.parse(formData);

    const metal = await updateMetal(admin.id, admin.role, metalId, {
      name: parsed.name,
    });

    revalidatePath("/masters");
    return { success: true, data: serializeForClient(metal) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to update metal") };
  }
}

export async function toggleMetalActiveAction(metalId: string, isActive: boolean) {
  try {
    const admin = await requireAdmin();
    const metal = await setMetalActive(admin.id, admin.role, metalId, isActive);
    revalidatePath("/masters");
    return { success: true, data: serializeForClient(metal) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to change metal status") };
  }
}

export async function createPurityAction(formData: unknown) {
  try {
    const admin = await requireAdmin();
    const parsed = CreatePuritySchema.parse(formData);

    const purity = await createPurity(admin.id, admin.role, {
      metalId: parsed.metalId,
      label: parsed.label,
      fineness: parsed.fineness,
      displayInfo: parsed.displayInfo ?? undefined,
      sortOrder: parsed.sortOrder,
    });

    revalidatePath("/masters");
    return { success: true, data: serializeForClient(purity) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to create purity") };
  }
}

export async function updatePurityAction(purityId: string, formData: unknown) {
  try {
    const admin = await requireAdmin();
    const parsed = UpdatePuritySchema.parse(formData);

    const purity = await updatePurity(admin.id, admin.role, purityId, {
      label: parsed.label,
      fineness: parsed.fineness,
      displayInfo: parsed.displayInfo ?? undefined,
      sortOrder: parsed.sortOrder,
    });

    revalidatePath("/masters");
    return { success: true, data: serializeForClient(purity) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to update purity") };
  }
}

export async function togglePurityActiveAction(purityId: string, isActive: boolean) {
  try {
    const admin = await requireAdmin();
    const purity = await setPurityActive(admin.id, admin.role, purityId, isActive);
    revalidatePath("/masters");
    return { success: true, data: serializeForClient(purity) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to change purity status") };
  }
}
