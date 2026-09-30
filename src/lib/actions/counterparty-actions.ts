"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import {
  createCounterparty,
  updateCounterparty,
  setCounterpartyActive,
} from "@/lib/services/counterparty-service";
import {
  CreateCounterpartySchema,
  UpdateCounterpartySchema,
} from "@/lib/validations/counterparty";
import { sanitizeErrorMessage } from "@/lib/utils/errors";
import { serializeForClient } from "@/lib/utils/serialize";

export async function createCounterpartyAction(formData: unknown) {
  try {
    const admin = await requireAdmin();
    const parsed = CreateCounterpartySchema.parse(formData);

    const cp = await createCounterparty(admin.id, admin.role, {
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email,
      address: parsed.address,
      type: parsed.type,
      notes: parsed.notes,
    });

    revalidatePath("/counterparties");
    return { success: true, data: serializeForClient(cp) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to create counterparty") };
  }
}

export async function updateCounterpartyAction(id: string, formData: unknown) {
  try {
    const admin = await requireAdmin();
    const parsed = UpdateCounterpartySchema.parse(formData);

    const cp = await updateCounterparty(admin.id, admin.role, id, {
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email,
      address: parsed.address,
      type: parsed.type,
      notes: parsed.notes,
    });

    revalidatePath("/counterparties");
    return { success: true, data: serializeForClient(cp) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to update counterparty") };
  }
}

export async function toggleCounterpartyActiveAction(id: string, isActive: boolean) {
  try {
    const admin = await requireAdmin();
    const cp = await setCounterpartyActive(admin.id, admin.role, id, isActive);
    revalidatePath("/counterparties");
    return { success: true, data: serializeForClient(cp) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to change counterparty status") };
  }
}
