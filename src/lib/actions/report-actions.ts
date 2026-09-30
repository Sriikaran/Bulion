"use server";

import { requireUser, requireAdmin } from "@/lib/auth/session";
import { ReportFilterSchema } from "@/lib/validations/report";
import {
  getPurchaseRegisterReport,
  getSalesRegisterReport,
  getCurrentStockReport,
  getSupplierWisePurchaseReport,
  getBuyerWiseSalesReport,
  getPurchaseVsSalesReport,
  getBullionProfitReport,
  getTransactionHistoryReport,
} from "@/lib/services/report-service";
import type { MovementType } from "@prisma/client";
import { sanitizeErrorMessage } from "@/lib/utils/errors";

/** Serializes Decimal instances and Dates to strings for safe JSON payload delivery */
function serializeReport<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, val) => {
      if (typeof val === "object" && val !== null && typeof val.toFixed === "function") {
        return val.toString();
      }
      return val;
    }),
  );
}

export async function getPurchaseRegisterAction(rawFilters: unknown) {
  try {
    await requireUser();
    const filters = ReportFilterSchema.parse(rawFilters ?? {});
    const result = await getPurchaseRegisterReport(filters);
    return { success: true, data: serializeReport(result) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to load purchase register") };
  }
}

export async function getSalesRegisterAction(rawFilters: unknown) {
  try {
    await requireUser();
    const filters = ReportFilterSchema.parse(rawFilters ?? {});
    const result = await getSalesRegisterReport(filters);
    return { success: true, data: serializeReport(result) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to load sales register") };
  }
}

export async function getCurrentStockReportAction(rawFilters: unknown) {
  try {
    await requireUser();
    const filters = ReportFilterSchema.parse(rawFilters ?? {});
    const result = await getCurrentStockReport({
      metalId: filters.metalId,
      purityId: filters.purityId,
      search: filters.search,
    });
    return { success: true, data: serializeReport(result) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to load stock report") };
  }
}

export async function getSupplierWisePurchaseAction(rawFilters: unknown) {
  try {
    await requireUser();
    const filters = ReportFilterSchema.parse(rawFilters ?? {});
    const result = await getSupplierWisePurchaseReport(filters);
    return { success: true, data: serializeReport(result) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to load supplier report") };
  }
}

export async function getBuyerWiseSalesAction(rawFilters: unknown) {
  try {
    await requireUser();
    const filters = ReportFilterSchema.parse(rawFilters ?? {});
    const result = await getBuyerWiseSalesReport(filters);
    return { success: true, data: serializeReport(result) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to load buyer report") };
  }
}

export async function getPurchaseVsSalesAction(rawFilters: unknown) {
  try {
    await requireUser();
    const filters = ReportFilterSchema.parse(rawFilters ?? {});
    const result = await getPurchaseVsSalesReport({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      metalId: filters.metalId,
      purityId: filters.purityId,
    });
    return { success: true, data: serializeReport(result) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to load comparative report") };
  }
}

export async function getBullionProfitAction(rawFilters: unknown) {
  try {
    // ADMIN-only RBAC check for profit report
    await requireAdmin();
    const filters = ReportFilterSchema.parse(rawFilters ?? {});
    const result = await getBullionProfitReport({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      metalId: filters.metalId,
      purityId: filters.purityId,
    });
    return { success: true, data: serializeReport(result) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to load profit report") };
  }
}

export async function getTransactionHistoryReportAction(rawFilters: unknown) {
  try {
    await requireUser();
    const filters = ReportFilterSchema.parse(rawFilters ?? {});
    const result = await getTransactionHistoryReport({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      metalId: filters.metalId,
      purityId: filters.purityId,
      movementType: (filters.movementType as MovementType) || undefined,
      search: filters.search,
    });
    return { success: true, data: serializeReport(result) };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err, "Failed to load transaction history report") };
  }
}
