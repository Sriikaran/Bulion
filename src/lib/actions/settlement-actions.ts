"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin } from "@/lib/auth/session";
import {
  recordPayment,
  cancelPayment,
  getInvoiceSettlement,
  getCounterpartyOutstandingsReport,
  getCounterpartyLedgerReport,
} from "@/lib/services/settlement-service";
import {
  CreatePaymentSchema,
  CancelPaymentSchema,
  OutstandingsFilterSchema,
  CounterpartyLedgerFilterSchema,
} from "@/lib/validations/settlement";
import { sanitizeErrorMessage } from "@/lib/utils/errors";
import { serializeForClient } from "@/lib/utils/serialize";

export async function recordPaymentAction(formData: unknown) {
  try {
    const user = await requireUser();
    const parsed = CreatePaymentSchema.parse(formData);

    const payment = await recordPayment(user.id, user.role, {
      type: parsed.type,
      date: parsed.date,
      amount: parsed.amount,
      paymentMode: parsed.paymentMode,
      referenceNumber: parsed.referenceNumber,
      notes: parsed.notes,
      purchaseId: parsed.purchaseId,
      saleId: parsed.saleId,
    });

    revalidatePath("/purchases");
    revalidatePath("/sales");
    revalidatePath("/reports/outstandings");
    revalidatePath("/reports/ledger");
    revalidatePath("/dashboard");

    return { success: true, data: serializeForClient(payment) };
  } catch (err: unknown) {
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Failed to record financial transaction"),
    };
  }
}

export async function cancelPaymentAction(formData: unknown) {
  try {
    const admin = await requireAdmin();
    const parsed = CancelPaymentSchema.parse(formData);

    const payment = await cancelPayment(
      admin.id,
      admin.role,
      parsed.id,
      parsed.reason,
    );

    revalidatePath("/purchases");
    revalidatePath("/sales");
    revalidatePath("/reports/outstandings");
    revalidatePath("/reports/ledger");
    revalidatePath("/dashboard");

    return { success: true, data: serializeForClient(payment) };
  } catch (err: unknown) {
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Failed to cancel financial transaction"),
    };
  }
}

export async function getInvoiceSettlementAction(
  type: "PURCHASE" | "SALE",
  invoiceId: string,
) {
  try {
    await requireUser();
    const settlement = await getInvoiceSettlement(type, invoiceId);
    return { success: true, data: serializeForClient(settlement) };
  } catch (err: unknown) {
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Failed to fetch invoice settlement details"),
    };
  }
}

export async function getCounterpartyOutstandingsAction(rawFilters: unknown) {
  try {
    await requireUser();
    const filters = OutstandingsFilterSchema.parse(rawFilters ?? {});
    const result = await getCounterpartyOutstandingsReport(filters);
    return { success: true, data: serializeForClient(result) };
  } catch (err: unknown) {
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Failed to generate outstandings report"),
    };
  }
}

export async function getCounterpartyLedgerAction(rawFilters: unknown) {
  try {
    await requireUser();
    const filters = CounterpartyLedgerFilterSchema.parse(rawFilters ?? {});
    const result = await getCounterpartyLedgerReport(filters.counterpartyId, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });
    return { success: true, data: serializeForClient(result) };
  } catch (err: unknown) {
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Failed to generate counterparty ledger"),
    };
  }
}
