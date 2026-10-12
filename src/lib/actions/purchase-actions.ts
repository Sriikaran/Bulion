"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  createPurchase,
  postPurchase,
  cancelPurchase,
  fixPurchaseRate,
} from "@/lib/services/purchase-service";
import {
  CreatePurchaseSchema,
  CancelTransactionSchema,
  FixRateSchema,
} from "@/lib/validations/purchase";
import { sanitizeErrorMessage } from "@/lib/utils/errors";
import { serializeForClient } from "@/lib/utils/serialize";

export async function createPurchaseDraftAction(formData: unknown) {
  try {
    const user = await requireUser();
    const parsed = CreatePurchaseSchema.parse(formData);

    const purchase = await createPurchase(user.id, user.role, {
      invoiceNumber: parsed.invoiceNumber,
      date: parsed.date,
      supplierName: parsed.supplierName,
      supplierContact: parsed.supplierContact,
      counterpartyId: parsed.counterpartyId || undefined,
      metalId: parsed.metalId,
      purityId: parsed.purityId,
      weightGrams: parsed.weightGrams,
      rateStatus: parsed.rateStatus,
      ratePerGram: parsed.ratePerGram,
      paymentMode: parsed.paymentMode,
      notes: parsed.notes,
    });

    revalidatePath("/purchases");
    revalidatePath("/stock");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(purchase) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to create purchase draft") };
  }
}

export async function postPurchaseAction(purchaseId: string) {
  try {
    const user = await requireUser();
    const purchase = await postPurchase(user.id, user.role, purchaseId);

    revalidatePath("/purchases");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(purchase) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to post purchase") };
  }
}

export async function createAndPostPurchaseAction(formData: unknown) {
  try {
    const user = await requireUser();
    const parsed = CreatePurchaseSchema.parse(formData);

    // 1. Create draft
    const draft = await createPurchase(user.id, user.role, {
      invoiceNumber: parsed.invoiceNumber,
      date: parsed.date,
      supplierName: parsed.supplierName,
      supplierContact: parsed.supplierContact,
      counterpartyId: parsed.counterpartyId || undefined,
      metalId: parsed.metalId,
      purityId: parsed.purityId,
      weightGrams: parsed.weightGrams,
      rateStatus: parsed.rateStatus,
      ratePerGram: parsed.ratePerGram,
      paymentMode: parsed.paymentMode,
      notes: parsed.notes,
    });

    // 2. Post immediately
    const posted = await postPurchase(user.id, user.role, draft.id);

    revalidatePath("/purchases");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(posted) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to record purchase") };
  }
}

export async function fixPurchaseRateAction(formData: unknown) {
  try {
    const user = await requireUser();
    const parsed = FixRateSchema.parse(formData);

    const updated = await fixPurchaseRate(
      user.id,
      user.role,
      parsed.id,
      parsed.ratePerGram,
    );

    revalidatePath("/purchases");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/settlement");
    revalidatePath("/reports/purchases");
    revalidatePath("/reports/ledger");
    revalidatePath("/reports/outstandings");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(updated) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to fix purchase rate") };
  }
}

export async function cancelPurchaseAction(formData: unknown) {
  try {
    const user = await requireUser();
    const parsed = CancelTransactionSchema.parse(formData);

    const cancelled = await cancelPurchase(
      user.id,
      user.role,
      parsed.id,
      parsed.reason,
    );

    revalidatePath("/purchases");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/settlement");
    revalidatePath("/reports/purchases");
    revalidatePath("/reports/ledger");
    revalidatePath("/reports/outstandings");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(cancelled) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to cancel purchase") };
  }
}

export async function closePurchaseAction(formData: unknown) {
  try {
    const user = await requireUser();
    const { z } = await import("zod");
    const schema = z.object({ purchaseId: z.string().min(1, "Purchase ID required") });
    const parsed = schema.parse(formData);

    const { closePurchase } = await import("@/lib/services/purchase-service");
    const closed = await closePurchase(user.id, user.role, parsed.purchaseId);

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${parsed.purchaseId}`);
    revalidatePath("/reports/purchases");
    revalidatePath("/reports/ledger");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(closed) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to close purchase deal") };
  }
}
