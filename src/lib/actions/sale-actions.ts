"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  createSale,
  postSale,
  cancelSale,
  fixSaleRate,
} from "@/lib/services/sale-service";
import {
  CreateSaleSchema,
  FixRateSchema,
} from "@/lib/validations/sale";
import { CancelTransactionSchema } from "@/lib/validations/purchase";
import { sanitizeErrorMessage } from "@/lib/utils/errors";
import { serializeForClient } from "@/lib/utils/serialize";

export async function createSaleDraftAction(formData: unknown) {
  try {
    const user = await requireUser();
    const parsed = CreateSaleSchema.parse(formData);

    const sale = await createSale(user.id, user.role, {
      invoiceNumber: parsed.invoiceNumber,
      date: parsed.date,
      buyerName: parsed.buyerName,
      buyerContact: parsed.buyerContact,
      counterpartyId: parsed.counterpartyId || undefined,
      metalId: parsed.metalId,
      purityId: parsed.purityId,
      weightGrams: parsed.weightGrams,
      rateStatus: parsed.rateStatus,
      ratePerGram: parsed.ratePerGram,
      paymentMode: parsed.paymentMode,
      notes: parsed.notes,
    });

    revalidatePath("/sales");
    revalidatePath("/stock");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(sale) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to create sale draft") };
  }
}

export async function postSaleAction(saleId: string) {
  try {
    const user = await requireUser();
    const sale = await postSale(user.id, user.role, saleId);

    revalidatePath("/sales");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(sale) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to post sale") };
  }
}

export async function createAndPostSaleAction(formData: unknown) {
  try {
    const user = await requireUser();
    const parsed = CreateSaleSchema.parse(formData);

    // 1. Create draft
    const draft = await createSale(user.id, user.role, {
      invoiceNumber: parsed.invoiceNumber,
      date: parsed.date,
      buyerName: parsed.buyerName,
      buyerContact: parsed.buyerContact,
      counterpartyId: parsed.counterpartyId || undefined,
      metalId: parsed.metalId,
      purityId: parsed.purityId,
      weightGrams: parsed.weightGrams,
      rateStatus: parsed.rateStatus,
      ratePerGram: parsed.ratePerGram,
      paymentMode: parsed.paymentMode,
      notes: parsed.notes,
    });

    // 2. Post immediately (atomic stock check and movement inside tx)
    const posted = await postSale(user.id, user.role, draft.id);

    revalidatePath("/sales");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(posted) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to record sale") };
  }
}

export async function fixSaleRateAction(formData: unknown) {
  try {
    const user = await requireUser();
    const parsed = FixRateSchema.parse(formData);

    const updated = await fixSaleRate(
      user.id,
      user.role,
      parsed.id,
      parsed.ratePerGram,
    );

    revalidatePath("/sales");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/settlement");
    revalidatePath("/reports/sales");
    revalidatePath("/reports/ledger");
    revalidatePath("/reports/outstandings");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(updated) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to fix sale rate") };
  }
}

export async function cancelSaleAction(formData: unknown) {
  try {
    const user = await requireUser();
    const parsed = CancelTransactionSchema.parse(formData);

    const cancelled = await cancelSale(
      user.id,
      user.role,
      parsed.id,
      parsed.reason,
    );

    revalidatePath("/sales");
    revalidatePath("/stock");
    revalidatePath("/transactions");
    revalidatePath("/settlement");
    revalidatePath("/reports/sales");
    revalidatePath("/reports/ledger");
    revalidatePath("/reports/outstandings");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(cancelled) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to cancel sale") };
  }
}

export async function closeSaleAction(formData: unknown) {
  try {
    const user = await requireUser();
    const { z } = await import("zod");
    const schema = z.object({ saleId: z.string().min(1, "Sale ID required") });
    const parsed = schema.parse(formData);

    const { closeSale } = await import("@/lib/services/sale-service");
    const closed = await closeSale(user.id, user.role, parsed.saleId);

    revalidatePath("/sales");
    revalidatePath(`/sales/${parsed.saleId}`);
    revalidatePath("/reports/sales");
    revalidatePath("/reports/ledger");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(closed) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to close sale deal") };
  }
}
