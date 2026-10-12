/**
 * ReportService — Bullion Phase B3
 *
 * Dedicated authoritative reporting service for the Bullion platform.
 *
 * CORE INVARIANTS:
 * 1. REPORTS RECONCILE WITH UNDERLYING TRANSACTIONS:
 *    - All figures derive from authoritative domain tables (Purchase, Sale, StockMovement).
 * 2. CANCELLATION ISOLATION:
 *    - Cancelled transactions (status === "CANCELLED") do NOT contribute to active purchase
 *      or sales totals, nor to supplier/buyer summaries or profit calculations.
 *    - Reversal movements remain visible in audit logs, transaction history, and stock ledger.
 * 3. DECIMAL PRECISION:
 *    - All financial values, rates, weights, averages, cost basis, and margins are computed
 *      strictly with Decimal.js to prevent IEEE-754 floating-point inaccuracies.
 * 4. WEIGHTED AVERAGES:
 *    - Weighted Average Rate = Total Value / Total Weight.
 *    - Handled safely when Total Weight = 0 (defaults to 0, never produces NaN or Infinity).
 * 5. PROFIT METHODOLOGY:
 *    - Transparently documented as "Weighted Average Cost Basis".
 */

import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import type { Prisma, MovementType } from "@prisma/client";
import { getDetailedStockPositions } from "./stock-service";

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export interface BaseReportFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  metalId?: string | null;
  purityId?: string | null;
  counterpartyId?: string | null;
  status?: string | null;
  search?: string | null;
}

export interface DateRange {
  gte?: Date;
  lte?: Date;
}

/**
 * Robust date boundary parser.
 * Given YYYY-MM-DD strings, produces UTC start-of-day (00:00:00.000)
 * and UTC end-of-day (23:59:59.999) to ensure transactions occurring
 * at any time on the boundary dates are accurately included.
 */
export function parseDateRange(
  dateFrom?: string | null,
  dateTo?: string | null,
): DateRange | undefined {
  if (!dateFrom && !dateTo) return undefined;

  const range: DateRange = {};

  if (dateFrom && dateFrom.trim()) {
    const parts = dateFrom.trim().split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      range.gte = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
    }
  }

  if (dateTo && dateTo.trim()) {
    const parts = dateTo.trim().split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      range.lte = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999));
    }
  }

  return Object.keys(range).length > 0 ? range : undefined;
}

// ---------------------------------------------------------------------------
// 1. Purchase Register
// ---------------------------------------------------------------------------

export interface PurchaseRegisterRow {
  id: string;
  invoiceNumber: string;
  date: Date;
  supplierName: string;
  supplierContact: string | null;
  counterpartyId: string | null;
  metalId: string;
  metalCode: string;
  metalName: string;
  purityId: string;
  purityLabel: string;
  rateStatus: "FIXED" | "UNFIXED";
  weightGrams: Decimal;
  ratePerGram: Decimal | null;
  totalAmount: Decimal | null;
  rateFixedAt?: Date | null;
  fulfilmentStatus: "PENDING" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED";
  fulfilledWeightGrams: Decimal;
  remainingWeightGrams: Decimal;
  paymentMode: string;
  status: "DRAFT" | "POSTED" | "CLOSED" | "CANCELLED";
  cancelReason: string | null;
  cancelledAt: Date | null;
  notes: string | null;
}

export interface PurchaseRegisterSummary {
  totalPurchaseWeightGrams: Decimal;
  totalPurchaseAmount: Decimal;
  weightedAverageRate: Decimal;
  totalPurchasesCount: number;
  postedCount: number;
  closedCount: number;
  cancelledCount: number;
  draftCount: number;
}

export interface PurchaseRegisterResult {
  summary: PurchaseRegisterSummary;
  rows: PurchaseRegisterRow[];
}

export async function getPurchaseRegisterReport(
  filters: BaseReportFilters = {},
): Promise<PurchaseRegisterResult> {
  const dateRange = parseDateRange(filters.dateFrom, filters.dateTo);

  const where: Prisma.PurchaseWhereInput = {};

  if (dateRange) {
    where.date = {};
    if (dateRange.gte) where.date.gte = dateRange.gte;
    if (dateRange.lte) where.date.lte = dateRange.lte;
  }

  if (filters.metalId) where.metalId = filters.metalId;
  if (filters.purityId) where.purityId = filters.purityId;
  if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId;

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status as "DRAFT" | "POSTED" | "CLOSED" | "CANCELLED";
  }

  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { supplierName: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
  }

  const purchases = await prisma.purchase.findMany({
    where,
    include: {
      metal: true,
      purity: true,
      fulfilments: {
        where: { status: { not: "CANCELLED" } },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  let totalWeight = new Decimal(0);
  let totalAmount = new Decimal(0);
  let fixedWeight = new Decimal(0);
  let postedCount = 0;
  let closedCount = 0;
  let cancelledCount = 0;
  let draftCount = 0;

  const rows: PurchaseRegisterRow[] = purchases.map((p) => {
    const weight = new Decimal(p.weightGrams.toString());
    const rate = p.ratePerGram != null ? new Decimal(p.ratePerGram.toString()) : null;
    const amount = p.totalAmount != null ? new Decimal(p.totalAmount.toString()) : null;
    const fulfilledWeight = p.fulfilments.reduce(
      (sum, f) => sum.plus(new Decimal(f.weightGrams.toString())),
      new Decimal(0),
    );
    const remainingWeight = weight.minus(fulfilledWeight);

    if (p.status === "POSTED" || p.status === "CLOSED") {
      totalWeight = totalWeight.plus(weight);
      if (amount != null) {
        totalAmount = totalAmount.plus(amount);
        fixedWeight = fixedWeight.plus(weight);
      }
      if (p.status === "POSTED") postedCount++;
      else closedCount++;
    } else if (p.status === "CANCELLED") {
      cancelledCount++;
    } else if (p.status === "DRAFT") {
      draftCount++;
    }

    return {
      id: p.id,
      invoiceNumber: p.invoiceNumber,
      date: p.date,
      supplierName: p.supplierName,
      supplierContact: p.supplierContact,
      counterpartyId: p.counterpartyId,
      metalId: p.metalId,
      metalCode: p.metal.code,
      metalName: p.metal.name,
      purityId: p.purityId,
      purityLabel: p.purity.label,
      rateStatus: p.rateStatus,
      weightGrams: weight,
      ratePerGram: rate,
      totalAmount: amount,
      rateFixedAt: p.rateFixedAt,
      fulfilmentStatus: p.fulfilmentStatus,
      fulfilledWeightGrams: fulfilledWeight,
      remainingWeightGrams: remainingWeight.lessThan(0) ? new Decimal(0) : remainingWeight,
      paymentMode: p.paymentMode,
      status: p.status as "DRAFT" | "POSTED" | "CLOSED" | "CANCELLED",
      cancelReason: p.cancelReason,
      cancelledAt: p.cancelledAt,
      notes: p.notes,
    };
  });

  const weightedAverageRate = fixedWeight.greaterThan(0)
    ? totalAmount.dividedBy(fixedWeight).toDecimalPlaces(2)
    : new Decimal(0);

  return {
    summary: {
      totalPurchaseWeightGrams: totalWeight,
      totalPurchaseAmount: totalAmount,
      weightedAverageRate,
      totalPurchasesCount: rows.length,
      postedCount,
      closedCount,
      cancelledCount,
      draftCount,
    },
    rows,
  };
}

// ---------------------------------------------------------------------------
// 2. Sales Register
// ---------------------------------------------------------------------------

export interface SalesRegisterRow {
  id: string;
  invoiceNumber: string;
  date: Date;
  buyerName: string;
  buyerContact: string | null;
  counterpartyId: string | null;
  metalId: string;
  metalCode: string;
  metalName: string;
  purityId: string;
  purityLabel: string;
  rateStatus: "FIXED" | "UNFIXED";
  weightGrams: Decimal;
  ratePerGram: Decimal | null;
  totalAmount: Decimal | null;
  rateFixedAt?: Date | null;
  fulfilmentStatus: "PENDING" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED";
  fulfilledWeightGrams: Decimal;
  remainingWeightGrams: Decimal;
  paymentMode: string;
  status: "DRAFT" | "POSTED" | "CLOSED" | "CANCELLED";
  cancelReason: string | null;
  cancelledAt: Date | null;
  notes: string | null;
}

export interface SalesRegisterSummary {
  totalSoldWeightGrams: Decimal;
  totalSalesAmount: Decimal;
  weightedAverageSellingRate: Decimal;
  totalSalesCount: number;
  postedCount: number;
  closedCount: number;
  cancelledCount: number;
  draftCount: number;
}

export interface SalesRegisterResult {
  summary: SalesRegisterSummary;
  rows: SalesRegisterRow[];
}

export async function getSalesRegisterReport(
  filters: BaseReportFilters = {},
): Promise<SalesRegisterResult> {
  const dateRange = parseDateRange(filters.dateFrom, filters.dateTo);

  const where: Prisma.SaleWhereInput = {};

  if (dateRange) {
    where.date = {};
    if (dateRange.gte) where.date.gte = dateRange.gte;
    if (dateRange.lte) where.date.lte = dateRange.lte;
  }

  if (filters.metalId) where.metalId = filters.metalId;
  if (filters.purityId) where.purityId = filters.purityId;
  if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId;

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status as "DRAFT" | "POSTED" | "CLOSED" | "CANCELLED";
  }

  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { buyerName: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      metal: true,
      purity: true,
      fulfilments: {
        where: { status: { not: "CANCELLED" } },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  let totalWeight = new Decimal(0);
  let totalAmount = new Decimal(0);
  let fixedWeight = new Decimal(0);
  let postedCount = 0;
  let closedCount = 0;
  let cancelledCount = 0;
  let draftCount = 0;

  const rows: SalesRegisterRow[] = sales.map((s) => {
    const weight = new Decimal(s.weightGrams.toString());
    const rate = s.ratePerGram != null ? new Decimal(s.ratePerGram.toString()) : null;
    const amount = s.totalAmount != null ? new Decimal(s.totalAmount.toString()) : null;
    const fulfilledWeight = s.fulfilments.reduce(
      (sum, f) => sum.plus(new Decimal(f.weightGrams.toString())),
      new Decimal(0),
    );
    const remainingWeight = weight.minus(fulfilledWeight);

    if (s.status === "POSTED" || s.status === "CLOSED") {
      totalWeight = totalWeight.plus(weight);
      if (amount != null) {
        totalAmount = totalAmount.plus(amount);
        fixedWeight = fixedWeight.plus(weight);
      }
      if (s.status === "POSTED") postedCount++;
      else closedCount++;
    } else if (s.status === "CANCELLED") {
      cancelledCount++;
    } else if (s.status === "DRAFT") {
      draftCount++;
    }

    return {
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      date: s.date,
      buyerName: s.buyerName,
      buyerContact: s.buyerContact,
      counterpartyId: s.counterpartyId,
      metalId: s.metalId,
      metalCode: s.metal.code,
      metalName: s.metal.name,
      purityId: s.purityId,
      purityLabel: s.purity.label,
      rateStatus: s.rateStatus,
      weightGrams: weight,
      ratePerGram: rate,
      totalAmount: amount,
      rateFixedAt: s.rateFixedAt,
      fulfilmentStatus: s.fulfilmentStatus,
      fulfilledWeightGrams: fulfilledWeight,
      remainingWeightGrams: remainingWeight.lessThan(0) ? new Decimal(0) : remainingWeight,
      paymentMode: s.paymentMode,
      status: s.status as "DRAFT" | "POSTED" | "CLOSED" | "CANCELLED",
      cancelReason: s.cancelReason,
      cancelledAt: s.cancelledAt,
      notes: s.notes,
    };
  });

  const weightedAverageSellingRate = fixedWeight.greaterThan(0)
    ? totalAmount.dividedBy(fixedWeight).toDecimalPlaces(2)
    : new Decimal(0);

  return {
    summary: {
      totalSoldWeightGrams: totalWeight,
      totalSalesAmount: totalAmount,
      weightedAverageSellingRate,
      totalSalesCount: rows.length,
      postedCount,
      closedCount,
      cancelledCount,
      draftCount,
    },
    rows,
  };
}

// ---------------------------------------------------------------------------
// 3. Current Stock Report
// ---------------------------------------------------------------------------

export interface CurrentStockReportRow {
  metalId: string;
  metalCode: string;
  metalName: string;
  purityId: string;
  purityLabel: string;
  fineness: Decimal;
  openingWeightGrams: Decimal;
  purchasedWeightGrams: Decimal;
  soldWeightGrams: Decimal;
  adjustmentIncreaseGrams: Decimal;
  adjustmentDecreaseGrams: Decimal;
  availableWeightGrams: Decimal;
  reservedWeightGrams: Decimal;
  availableToSellWeightGrams: Decimal;
  averagePurchaseRate: Decimal;
  totalPurchaseValue: Decimal;
  averageSellingRate: Decimal;
  totalSalesValue: Decimal;
  hasOpeningStock: boolean;
}

export interface CurrentStockReportSummary {
  totalGoldGrams: Decimal;
  totalSilverGrams: Decimal;
  totalInventoryGrams: Decimal;
  totalReservedGrams: Decimal;
  totalAvailableToSellGrams: Decimal;
  totalPurchaseValuation: Decimal;
  totalSalesRealized: Decimal;
  activeBucketsCount: number;
}

export interface CurrentStockReportResult {
  summary: CurrentStockReportSummary;
  rows: CurrentStockReportRow[];
}

export async function getCurrentStockReport(
  filters: { metalId?: string | null; purityId?: string | null; search?: string | null } = {},
): Promise<CurrentStockReportResult> {
  const detailed = await getDetailedStockPositions();

  let totalGold = new Decimal(0);
  let totalSilver = new Decimal(0);
  let totalInventory = new Decimal(0);
  let totalReserved = new Decimal(0);
  let totalAvailableToSell = new Decimal(0);
  let totalPurchaseVal = new Decimal(0);
  let totalSalesVal = new Decimal(0);

  const filtered = detailed.filter((pos) => {
    if (filters.metalId && pos.metalId !== filters.metalId) return false;
    if (filters.purityId && pos.purityId !== filters.purityId) return false;
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      const match =
        pos.metalName.toLowerCase().includes(q) ||
        pos.metalCode.toLowerCase().includes(q) ||
        pos.purityLabel.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const rows: CurrentStockReportRow[] = filtered.map((pos) => {
    const physicalOnHand = pos.currentWeightGrams;
    const reserved = pos.reservedWeightGrams;
    const availableToSell = pos.availableToSellWeightGrams;

    totalInventory = totalInventory.plus(physicalOnHand);
    totalReserved = totalReserved.plus(reserved);
    totalAvailableToSell = totalAvailableToSell.plus(availableToSell);
    totalPurchaseVal = totalPurchaseVal.plus(pos.totalPurchaseValue);
    totalSalesVal = totalSalesVal.plus(pos.totalSalesValue);

    if (pos.metalCode.toUpperCase() === "GOLD") {
      totalGold = totalGold.plus(physicalOnHand);
    } else if (pos.metalCode.toUpperCase() === "SILVER") {
      totalSilver = totalSilver.plus(physicalOnHand);
    }

    return {
      metalId: pos.metalId,
      metalCode: pos.metalCode,
      metalName: pos.metalName,
      purityId: pos.purityId,
      purityLabel: pos.purityLabel,
      fineness: pos.fineness,
      openingWeightGrams: pos.openingWeightGrams,
      purchasedWeightGrams: pos.purchasedWeightGrams,
      soldWeightGrams: pos.soldWeightGrams,
      adjustmentIncreaseGrams: pos.adjustmentIncreaseGrams,
      adjustmentDecreaseGrams: pos.adjustmentDecreaseGrams,
      availableWeightGrams: physicalOnHand,
      reservedWeightGrams: reserved,
      availableToSellWeightGrams: availableToSell,
      averagePurchaseRate: pos.averagePurchaseRate,
      totalPurchaseValue: pos.totalPurchaseValue,
      averageSellingRate: pos.averageSellingRate,
      totalSalesValue: pos.totalSalesValue,
      hasOpeningStock: pos.hasOpeningStock,
    };
  });

  return {
    summary: {
      totalGoldGrams: totalGold,
      totalSilverGrams: totalSilver,
      totalInventoryGrams: totalInventory,
      totalReservedGrams: totalReserved,
      totalAvailableToSellGrams: totalAvailableToSell,
      totalPurchaseValuation: totalPurchaseVal,
      totalSalesRealized: totalSalesVal,
      activeBucketsCount: rows.length,
    },
    rows,
  };
}

// ---------------------------------------------------------------------------
// 4. Supplier-wise Purchase Report
// ---------------------------------------------------------------------------

export interface SupplierWisePurchaseRow {
  supplierName: string;
  counterpartyId: string | null;
  supplierContact: string | null;
  purchaseCount: number;
  totalWeightGrams: Decimal;
  totalPurchaseAmount: Decimal;
  weightedAverageRate: Decimal;
}

export interface SupplierWisePurchaseSummary {
  uniqueSuppliersCount: number;
  totalPurchasesCount: number;
  totalPurchaseWeightGrams: Decimal;
  totalPurchaseAmount: Decimal;
  overallWeightedAverageRate: Decimal;
}

export interface SupplierWisePurchaseResult {
  summary: SupplierWisePurchaseSummary;
  rows: SupplierWisePurchaseRow[];
}

export async function getSupplierWisePurchaseReport(
  filters: BaseReportFilters = {},
): Promise<SupplierWisePurchaseResult> {
  const dateRange = parseDateRange(filters.dateFrom, filters.dateTo);

  const where: Prisma.PurchaseWhereInput = {
    status: "POSTED", // Cancelled & drafts strictly excluded
  };

  if (dateRange) {
    where.date = {};
    if (dateRange.gte) where.date.gte = dateRange.gte;
    if (dateRange.lte) where.date.lte = dateRange.lte;
  }

  if (filters.metalId) where.metalId = filters.metalId;
  if (filters.purityId) where.purityId = filters.purityId;
  if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId;

  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { supplierName: { contains: q, mode: "insensitive" } },
      { supplierContact: { contains: q, mode: "insensitive" } },
      { invoiceNumber: { contains: q, mode: "insensitive" } },
    ];
  }

  const purchases = await prisma.purchase.findMany({
    where,
    select: {
      supplierName: true,
      supplierContact: true,
      counterpartyId: true,
      weightGrams: true,
      totalAmount: true,
    },
  });

  const supplierMap = new Map<
    string,
    {
      supplierName: string;
      counterpartyId: string | null;
      supplierContact: string | null;
      purchaseCount: number;
      totalWeight: Decimal;
      totalAmount: Decimal;
    }
  >();

  let overallWeight = new Decimal(0);
  let overallAmount = new Decimal(0);
  let overallPurchasesCount = 0;

  for (const p of purchases) {
    const key = p.supplierName.trim().toLowerCase();
    const weight = new Decimal(p.weightGrams.toString());
    const amount = p.totalAmount != null ? new Decimal(p.totalAmount.toString()) : new Decimal(0);

    overallWeight = overallWeight.plus(weight);
    overallAmount = overallAmount.plus(amount);
    overallPurchasesCount++;

    const existing = supplierMap.get(key);
    if (!existing) {
      supplierMap.set(key, {
        supplierName: p.supplierName,
        counterpartyId: p.counterpartyId,
        supplierContact: p.supplierContact,
        purchaseCount: 1,
        totalWeight: weight,
        totalAmount: amount,
      });
    } else {
      existing.purchaseCount += 1;
      existing.totalWeight = existing.totalWeight.plus(weight);
      existing.totalAmount = existing.totalAmount.plus(amount);
      if (!existing.supplierContact && p.supplierContact) {
        existing.supplierContact = p.supplierContact;
      }
    }
  }

  const rows: SupplierWisePurchaseRow[] = Array.from(supplierMap.values())
    .map((s) => ({
      supplierName: s.supplierName,
      counterpartyId: s.counterpartyId,
      supplierContact: s.supplierContact,
      purchaseCount: s.purchaseCount,
      totalWeightGrams: s.totalWeight,
      totalPurchaseAmount: s.totalAmount,
      weightedAverageRate: s.totalWeight.greaterThan(0)
        ? s.totalAmount.dividedBy(s.totalWeight).toDecimalPlaces(2)
        : new Decimal(0),
    }))
    .sort((a, b) => b.totalPurchaseAmount.comparedTo(a.totalPurchaseAmount));

  const overallWeightedAverageRate = overallWeight.greaterThan(0)
    ? overallAmount.dividedBy(overallWeight).toDecimalPlaces(2)
    : new Decimal(0);

  return {
    summary: {
      uniqueSuppliersCount: rows.length,
      totalPurchasesCount: overallPurchasesCount,
      totalPurchaseWeightGrams: overallWeight,
      totalPurchaseAmount: overallAmount,
      overallWeightedAverageRate,
    },
    rows,
  };
}

// ---------------------------------------------------------------------------
// 5. Buyer-wise Sales Report
// ---------------------------------------------------------------------------

export interface BuyerWiseSalesRow {
  buyerName: string;
  counterpartyId: string | null;
  buyerContact: string | null;
  saleCount: number;
  totalWeightGrams: Decimal;
  totalSalesAmount: Decimal;
  weightedAverageSellingRate: Decimal;
}

export interface BuyerWiseSalesSummary {
  uniqueBuyersCount: number;
  totalSalesCount: number;
  totalSoldWeightGrams: Decimal;
  totalSalesAmount: Decimal;
  overallWeightedAverageRate: Decimal;
}

export interface BuyerWiseSalesResult {
  summary: BuyerWiseSalesSummary;
  rows: BuyerWiseSalesRow[];
}

export async function getBuyerWiseSalesReport(
  filters: BaseReportFilters = {},
): Promise<BuyerWiseSalesResult> {
  const dateRange = parseDateRange(filters.dateFrom, filters.dateTo);

  const where: Prisma.SaleWhereInput = {
    status: "POSTED", // Cancelled & drafts strictly excluded
  };

  if (dateRange) {
    where.date = {};
    if (dateRange.gte) where.date.gte = dateRange.gte;
    if (dateRange.lte) where.date.lte = dateRange.lte;
  }

  if (filters.metalId) where.metalId = filters.metalId;
  if (filters.purityId) where.purityId = filters.purityId;
  if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId;

  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { buyerName: { contains: q, mode: "insensitive" } },
      { buyerContact: { contains: q, mode: "insensitive" } },
      { invoiceNumber: { contains: q, mode: "insensitive" } },
    ];
  }

  const sales = await prisma.sale.findMany({
    where,
    select: {
      buyerName: true,
      buyerContact: true,
      counterpartyId: true,
      weightGrams: true,
      totalAmount: true,
    },
  });

  const buyerMap = new Map<
    string,
    {
      buyerName: string;
      counterpartyId: string | null;
      buyerContact: string | null;
      saleCount: number;
      totalWeight: Decimal;
      totalAmount: Decimal;
    }
  >();

  let overallWeight = new Decimal(0);
  let overallAmount = new Decimal(0);
  let overallSalesCount = 0;

  for (const s of sales) {
    const key = s.buyerName.trim().toLowerCase();
    const weight = new Decimal(s.weightGrams.toString());
    const amount = s.totalAmount != null ? new Decimal(s.totalAmount.toString()) : new Decimal(0);

    overallWeight = overallWeight.plus(weight);
    overallAmount = overallAmount.plus(amount);
    overallSalesCount++;

    const existing = buyerMap.get(key);
    if (!existing) {
      buyerMap.set(key, {
        buyerName: s.buyerName,
        counterpartyId: s.counterpartyId,
        buyerContact: s.buyerContact,
        saleCount: 1,
        totalWeight: weight,
        totalAmount: amount,
      });
    } else {
      existing.saleCount += 1;
      existing.totalWeight = existing.totalWeight.plus(weight);
      existing.totalAmount = existing.totalAmount.plus(amount);
      if (!existing.buyerContact && s.buyerContact) {
        existing.buyerContact = s.buyerContact;
      }
    }
  }

  const rows: BuyerWiseSalesRow[] = Array.from(buyerMap.values())
    .map((b) => ({
      buyerName: b.buyerName,
      counterpartyId: b.counterpartyId,
      buyerContact: b.buyerContact,
      saleCount: b.saleCount,
      totalWeightGrams: b.totalWeight,
      totalSalesAmount: b.totalAmount,
      weightedAverageSellingRate: b.totalWeight.greaterThan(0)
        ? b.totalAmount.dividedBy(b.totalWeight).toDecimalPlaces(2)
        : new Decimal(0),
    }))
    .sort((a, b) => b.totalSalesAmount.comparedTo(a.totalSalesAmount));

  const overallWeightedAverageRate = overallWeight.greaterThan(0)
    ? overallAmount.dividedBy(overallWeight).toDecimalPlaces(2)
    : new Decimal(0);

  return {
    summary: {
      uniqueBuyersCount: rows.length,
      totalSalesCount: overallSalesCount,
      totalSoldWeightGrams: overallWeight,
      totalSalesAmount: overallAmount,
      overallWeightedAverageRate,
    },
    rows,
  };
}

// ---------------------------------------------------------------------------
// 6. Purchase vs Sales Report (Comparative Period Flow)
// ---------------------------------------------------------------------------

export interface BucketComparativeFlow {
  metalId: string;
  metalCode: string;
  metalName: string;
  purityId: string;
  purityLabel: string;
  purchaseWeightGrams: Decimal;
  purchaseAmount: Decimal;
  purchaseAverageRate: Decimal;
  salesWeightGrams: Decimal;
  salesAmount: Decimal;
  salesAverageRate: Decimal;
  differenceWeightGrams: Decimal; // purchaseWeight - salesWeight
  differenceAmount: Decimal;      // purchaseAmount - salesAmount
}

export interface PurchaseVsSalesSummary {
  purchaseWeightGrams: Decimal;
  purchaseAmount: Decimal;
  purchaseAverageRate: Decimal;
  purchaseCount: number;

  salesWeightGrams: Decimal;
  salesAmount: Decimal;
  salesAverageRate: Decimal;
  salesCount: number;

  differenceWeightGrams: Decimal; // purchase - sales
  differenceAmount: Decimal;      // purchase - sales
}

export interface PurchaseVsSalesResult {
  summary: PurchaseVsSalesSummary;
  bucketRows: BucketComparativeFlow[];
  reportNote: string;
}

export async function getPurchaseVsSalesReport(
  filters: { dateFrom?: string | null; dateTo?: string | null; metalId?: string | null; purityId?: string | null } = {},
): Promise<PurchaseVsSalesResult> {
  const dateRange = parseDateRange(filters.dateFrom, filters.dateTo);

  const purchaseWhere: Prisma.PurchaseWhereInput = { status: "POSTED" };
  const saleWhere: Prisma.SaleWhereInput = { status: "POSTED" };

  if (dateRange) {
    purchaseWhere.date = {};
    saleWhere.date = {};
    if (dateRange.gte) {
      purchaseWhere.date.gte = dateRange.gte;
      saleWhere.date.gte = dateRange.gte;
    }
    if (dateRange.lte) {
      purchaseWhere.date.lte = dateRange.lte;
      saleWhere.date.lte = dateRange.lte;
    }
  }

  if (filters.metalId) {
    purchaseWhere.metalId = filters.metalId;
    saleWhere.metalId = filters.metalId;
  }
  if (filters.purityId) {
    purchaseWhere.purityId = filters.purityId;
    saleWhere.purityId = filters.purityId;
  }

  const [purchases, sales, metals, purities] = await Promise.all([
    prisma.purchase.findMany({
      where: purchaseWhere,
      select: {
        metalId: true,
        purityId: true,
        weightGrams: true,
        totalAmount: true,
      },
    }),
    prisma.sale.findMany({
      where: saleWhere,
      select: {
        metalId: true,
        purityId: true,
        weightGrams: true,
        totalAmount: true,
      },
    }),
    prisma.metal.findMany({ where: { isActive: true } }),
    prisma.purity.findMany({ where: { isActive: true } }),
  ]);

  let totalPurchaseWeight = new Decimal(0);
  let totalPurchaseAmount = new Decimal(0);
  let totalSalesWeight = new Decimal(0);
  let totalSalesAmount = new Decimal(0);

  // Per-bucket grouping
  const bucketMap = new Map<
    string,
    {
      metalId: string;
      purityId: string;
      purchaseWeight: Decimal;
      purchaseAmount: Decimal;
      salesWeight: Decimal;
      salesAmount: Decimal;
    }
  >();

  // Initialize active buckets matching filter
  for (const m of metals) {
    if (filters.metalId && m.id !== filters.metalId) continue;
    const bucketPurities = purities.filter((p) => p.metalId === m.id);
    for (const p of bucketPurities) {
      if (filters.purityId && p.id !== filters.purityId) continue;
      const key = `${m.id}_${p.id}`;
      bucketMap.set(key, {
        metalId: m.id,
        purityId: p.id,
        purchaseWeight: new Decimal(0),
        purchaseAmount: new Decimal(0),
        salesWeight: new Decimal(0),
        salesAmount: new Decimal(0),
      });
    }
  }

  // Accumulate Purchases
  for (const p of purchases) {
    const w = new Decimal(p.weightGrams.toString());
    const a = p.totalAmount != null ? new Decimal(p.totalAmount.toString()) : new Decimal(0);
    totalPurchaseWeight = totalPurchaseWeight.plus(w);
    totalPurchaseAmount = totalPurchaseAmount.plus(a);

    const key = `${p.metalId}_${p.purityId}`;
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        metalId: p.metalId,
        purityId: p.purityId,
        purchaseWeight: new Decimal(0),
        purchaseAmount: new Decimal(0),
        salesWeight: new Decimal(0),
        salesAmount: new Decimal(0),
      };
      bucketMap.set(key, bucket);
    }
    bucket.purchaseWeight = bucket.purchaseWeight.plus(w);
    bucket.purchaseAmount = bucket.purchaseAmount.plus(a);
  }

  // Accumulate Sales
  for (const s of sales) {
    const w = new Decimal(s.weightGrams.toString());
    const a = s.totalAmount != null ? new Decimal(s.totalAmount.toString()) : new Decimal(0);
    totalSalesWeight = totalSalesWeight.plus(w);
    totalSalesAmount = totalSalesAmount.plus(a);

    const key = `${s.metalId}_${s.purityId}`;
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        metalId: s.metalId,
        purityId: s.purityId,
        purchaseWeight: new Decimal(0),
        purchaseAmount: new Decimal(0),
        salesWeight: new Decimal(0),
        salesAmount: new Decimal(0),
      };
      bucketMap.set(key, bucket);
    }
    bucket.salesWeight = bucket.salesWeight.plus(w);
    bucket.salesAmount = bucket.salesAmount.plus(a);
  }

  const metalLookup = new Map(metals.map((m) => [m.id, m]));
  const purityLookup = new Map(purities.map((p) => [p.id, p]));

  const bucketRows: BucketComparativeFlow[] = Array.from(bucketMap.values())
    .map((b) => {
      const metal = metalLookup.get(b.metalId);
      const purity = purityLookup.get(b.purityId);

      const purchaseAvgRate = b.purchaseWeight.greaterThan(0)
        ? b.purchaseAmount.dividedBy(b.purchaseWeight).toDecimalPlaces(2)
        : new Decimal(0);

      const salesAvgRate = b.salesWeight.greaterThan(0)
        ? b.salesAmount.dividedBy(b.salesWeight).toDecimalPlaces(2)
        : new Decimal(0);

      return {
        metalId: b.metalId,
        metalCode: metal?.code ?? "UNKNOWN",
        metalName: metal?.name ?? "Unknown Metal",
        purityId: b.purityId,
        purityLabel: purity?.label ?? "Unknown Purity",
        purchaseWeightGrams: b.purchaseWeight,
        purchaseAmount: b.purchaseAmount,
        purchaseAverageRate: purchaseAvgRate,
        salesWeightGrams: b.salesWeight,
        salesAmount: b.salesAmount,
        salesAverageRate: salesAvgRate,
        differenceWeightGrams: b.purchaseWeight.minus(b.salesWeight),
        differenceAmount: b.purchaseAmount.minus(b.salesAmount),
      };
    })
    .filter((b) => b.purchaseWeightGrams.greaterThan(0) || b.salesWeightGrams.greaterThan(0));

  const purchaseAverageRate = totalPurchaseWeight.greaterThan(0)
    ? totalPurchaseAmount.dividedBy(totalPurchaseWeight).toDecimalPlaces(2)
    : new Decimal(0);

  const salesAverageRate = totalSalesWeight.greaterThan(0)
    ? totalSalesAmount.dividedBy(totalSalesWeight).toDecimalPlaces(2)
    : new Decimal(0);

  return {
    summary: {
      purchaseWeightGrams: totalPurchaseWeight,
      purchaseAmount: totalPurchaseAmount,
      purchaseAverageRate,
      purchaseCount: purchases.length,
      salesWeightGrams: totalSalesWeight,
      salesAmount: totalSalesAmount,
      salesAverageRate,
      salesCount: sales.length,
      differenceWeightGrams: totalPurchaseWeight.minus(totalSalesWeight),
      differenceAmount: totalPurchaseAmount.minus(totalSalesAmount),
    },
    bucketRows,
    reportNote:
      "Important Note: This is a transaction-period comparative report tracking incoming and outgoing trade volume. It is NOT point-in-time inventory (Current Stock).",
  };
}

// ---------------------------------------------------------------------------
// 7. Bullion Profit Report (Weighted Average Cost Basis)
// ---------------------------------------------------------------------------

export interface BucketProfitRow {
  metalId: string;
  metalCode: string;
  metalName: string;
  purityId: string;
  purityLabel: string;
  soldWeightGrams: Decimal;
  salesValue: Decimal;
  unitCostBasis: Decimal; // Weighted avg purchase rate for this bucket
  totalCostBasis: Decimal; // soldWeight * unitCostBasis
  grossProfit: Decimal;    // salesValue - totalCostBasis
  profitMarginPercent: Decimal; // (grossProfit / salesValue) * 100
}

export interface BullionProfitSummary {
  methodology: string;
  totalSalesValue: Decimal;
  totalCostBasis: Decimal;
  totalGrossProfit: Decimal;
  overallProfitMarginPercent: Decimal;
  totalSoldWeightGrams: Decimal;
}

export interface BullionProfitResult {
  summary: BullionProfitSummary;
  bucketRows: BucketProfitRow[];
  methodologyExplanation: string;
}

export async function getBullionProfitReport(
  filters: { dateFrom?: string | null; dateTo?: string | null; metalId?: string | null; purityId?: string | null } = {},
): Promise<BullionProfitResult> {
  const dateRange = parseDateRange(filters.dateFrom, filters.dateTo);

  // Cost Basis is derived from all authoritative POSTED purchases for the bucket
  // (or up to the period). In V1 Weighted Average Cost, the bucket's overall acquisition cost
  // per gram is established by posted purchases.
  const [allPurchases, periodSales, metals, purities] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        status: "POSTED",
        ...(filters.metalId ? { metalId: filters.metalId } : {}),
        ...(filters.purityId ? { purityId: filters.purityId } : {}),
      },
      select: {
        metalId: true,
        purityId: true,
        weightGrams: true,
        totalAmount: true,
      },
    }),
    prisma.sale.findMany({
      where: {
        status: "POSTED",
        ...(dateRange
          ? {
              date: {
                ...(dateRange.gte ? { gte: dateRange.gte } : {}),
                ...(dateRange.lte ? { lte: dateRange.lte } : {}),
              },
            }
          : {}),
        ...(filters.metalId ? { metalId: filters.metalId } : {}),
        ...(filters.purityId ? { purityId: filters.purityId } : {}),
      },
      select: {
        metalId: true,
        purityId: true,
        weightGrams: true,
        totalAmount: true,
      },
    }),
    prisma.metal.findMany({ where: { isActive: true } }),
    prisma.purity.findMany({ where: { isActive: true } }),
  ]);

  // 1. Calculate weighted average purchase cost per gram for each bucket
  const bucketCostMap = new Map<
    string,
    { totalCost: Decimal; totalWeight: Decimal }
  >();

  for (const p of allPurchases) {
    if (p.totalAmount == null) continue;
    const key = `${p.metalId}_${p.purityId}`;
    const existing = bucketCostMap.get(key) ?? {
      totalCost: new Decimal(0),
      totalWeight: new Decimal(0),
    };
    existing.totalCost = existing.totalCost.plus(new Decimal(p.totalAmount.toString()));
    existing.totalWeight = existing.totalWeight.plus(new Decimal(p.weightGrams.toString()));
    bucketCostMap.set(key, existing);
  }

  // 2. Aggregate period sales per bucket
  const bucketSalesMap = new Map<
    string,
    { metalId: string; purityId: string; soldWeight: Decimal; salesAmount: Decimal }
  >();

  for (const s of periodSales) {
    if (s.totalAmount == null) continue;
    const key = `${s.metalId}_${s.purityId}`;
    const existing = bucketSalesMap.get(key) ?? {
      metalId: s.metalId,
      purityId: s.purityId,
      soldWeight: new Decimal(0),
      salesAmount: new Decimal(0),
    };
    existing.soldWeight = existing.soldWeight.plus(new Decimal(s.weightGrams.toString()));
    existing.salesAmount = existing.salesAmount.plus(new Decimal(s.totalAmount.toString()));
    bucketSalesMap.set(key, existing);
  }

  const metalLookup = new Map(metals.map((m) => [m.id, m]));
  const purityLookup = new Map(purities.map((p) => [p.id, p]));

  let totalSalesValue = new Decimal(0);
  let totalCostBasis = new Decimal(0);
  let totalSoldWeight = new Decimal(0);

  const bucketRows: BucketProfitRow[] = [];

  for (const [key, salesData] of bucketSalesMap.entries()) {
    const costData = bucketCostMap.get(key);
    const metal = metalLookup.get(salesData.metalId);
    const purity = purityLookup.get(salesData.purityId);

    const unitCostBasis =
      costData && costData.totalWeight.greaterThan(0)
        ? costData.totalCost.dividedBy(costData.totalWeight).toDecimalPlaces(4)
        : new Decimal(0);

    const bucketCostBasis = salesData.soldWeight.times(unitCostBasis).toDecimalPlaces(2);
    const bucketGrossProfit = salesData.salesAmount.minus(bucketCostBasis);
    const bucketMargin = salesData.salesAmount.greaterThan(0)
      ? bucketGrossProfit.dividedBy(salesData.salesAmount).times(100).toDecimalPlaces(2)
      : new Decimal(0);

    totalSalesValue = totalSalesValue.plus(salesData.salesAmount);
    totalCostBasis = totalCostBasis.plus(bucketCostBasis);
    totalSoldWeight = totalSoldWeight.plus(salesData.soldWeight);

    bucketRows.push({
      metalId: salesData.metalId,
      metalCode: metal?.code ?? "UNKNOWN",
      metalName: metal?.name ?? "Unknown Metal",
      purityId: salesData.purityId,
      purityLabel: purity?.label ?? "Unknown Purity",
      soldWeightGrams: salesData.soldWeight,
      salesValue: salesData.salesAmount,
      unitCostBasis,
      totalCostBasis: bucketCostBasis,
      grossProfit: bucketGrossProfit,
      profitMarginPercent: bucketMargin,
    });
  }

  const totalGrossProfit = totalSalesValue.minus(totalCostBasis);
  const overallMargin = totalSalesValue.greaterThan(0)
    ? totalGrossProfit.dividedBy(totalSalesValue).times(100).toDecimalPlaces(2)
    : new Decimal(0);

  return {
    summary: {
      methodology: "Weighted Average Cost Basis",
      totalSalesValue,
      totalCostBasis,
      totalGrossProfit,
      overallProfitMarginPercent: overallMargin,
      totalSoldWeightGrams: totalSoldWeight,
    },
    bucketRows,
    methodologyExplanation:
      "Profit Method: Weighted Average Cost Basis. Unit cost basis is mathematically derived as Total Acquisition Cost / Total Acquisition Weight for each (Metal × Purity) bucket from posted purchases. Cost basis for realized sales is computed as Sold Weight × Weighted Average Cost per gram. Only POSTED transactions contribute.",
  };
}

// ---------------------------------------------------------------------------
// 8. Transaction History Report (StockMovement Ledger)
// ---------------------------------------------------------------------------

export interface TransactionHistoryRow {
  id: string;
  createdAt: Date;
  movementType: MovementType;
  metalId: string;
  metalCode: string;
  metalName: string;
  purityId: string;
  purityLabel: string;
  signedWeightGrams: Decimal;
  absoluteWeightGrams: Decimal;
  reference: string | null;
  operatorId: string;
  operatorName: string;
  operatorRole: string;
  relatedTransactionType: "PURCHASE" | "SALE" | "ADJUSTMENT" | "OPENING" | "SYSTEM";
  relatedInvoiceOrReason: string | null;
  status: string;
}

export interface TransactionHistorySummary {
  totalMovementsCount: number;
  netWeightMovementGrams: Decimal;
  totalInflowGrams: Decimal;
  totalOutflowGrams: Decimal;
}

export interface TransactionHistoryResult {
  summary: TransactionHistorySummary;
  rows: TransactionHistoryRow[];
}

export async function getTransactionHistoryReport(
  filters: {
    dateFrom?: string | null;
    dateTo?: string | null;
    metalId?: string | null;
    purityId?: string | null;
    movementType?: MovementType | null;
    search?: string | null;
    limit?: number;
    skip?: number;
  } = {},
): Promise<TransactionHistoryResult> {
  const dateRange = parseDateRange(filters.dateFrom, filters.dateTo);

  const where: Prisma.StockMovementWhereInput = {};

  if (dateRange) {
    where.createdAt = {};
    if (dateRange.gte) where.createdAt.gte = dateRange.gte;
    if (dateRange.lte) where.createdAt.lte = dateRange.lte;
  }

  if (filters.metalId) where.metalId = filters.metalId;
  if (filters.purityId) where.purityId = filters.purityId;
  if (filters.movementType) where.movementType = filters.movementType;

  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { purchase: { invoiceNumber: { contains: q, mode: "insensitive" } } },
      { sale: { invoiceNumber: { contains: q, mode: "insensitive" } } },
      { adjustment: { reason: { contains: q, mode: "insensitive" } } },
      { createdBy: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      metal: true,
      purity: true,
      createdBy: { select: { id: true, name: true, role: true } },
      purchase: { select: { id: true, invoiceNumber: true, status: true, supplierName: true } },
      sale: { select: { id: true, invoiceNumber: true, status: true, buyerName: true } },
      adjustment: { select: { id: true, reason: true, status: true, direction: true } },
      openingStock: { select: { id: true, effectiveDate: true } },
      fulfilment: { select: { id: true, fulfilmentNumber: true, type: true } },
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 250,
    skip: filters.skip ?? 0,
  });

  let netWeight = new Decimal(0);
  let totalInflow = new Decimal(0);
  let totalOutflow = new Decimal(0);

  const rows: TransactionHistoryRow[] = movements.map((m) => {
    const signedWeight = new Decimal(m.weightGrams.toString());
    const absWeight = signedWeight.abs();

    netWeight = netWeight.plus(signedWeight);
    if (signedWeight.greaterThan(0)) {
      totalInflow = totalInflow.plus(signedWeight);
    } else {
      totalOutflow = totalOutflow.plus(absWeight);
    }

    let relatedType: "PURCHASE" | "SALE" | "ADJUSTMENT" | "OPENING" | "SYSTEM" = "SYSTEM";
    let relatedInvoiceOrReason: string | null = null;
    let status = "COMPLETED";

    const deliveryTag = m.fulfilment ? ` [${m.fulfilment.fulfilmentNumber}]` : "";

    if (m.purchase) {
      relatedType = "PURCHASE";
      relatedInvoiceOrReason = `Invoice: ${m.purchase.invoiceNumber} (${m.purchase.supplierName})${deliveryTag}`;
      status = m.purchase.status;
    } else if (m.sale) {
      relatedType = "SALE";
      relatedInvoiceOrReason = `Invoice: ${m.sale.invoiceNumber} (${m.sale.buyerName})${deliveryTag}`;
      status = m.sale.status;
    } else if (m.adjustment) {
      relatedType = "ADJUSTMENT";
      relatedInvoiceOrReason = `Reason: ${m.adjustment.reason}`;
      status = m.adjustment.status;
    } else if (m.openingStock) {
      relatedType = "OPENING";
      relatedInvoiceOrReason = `Opening Stock (Effective: ${m.openingStock.effectiveDate.toISOString().split("T")[0]})`;
      status = "POSTED";
    }

    return {
      id: m.id,
      createdAt: m.createdAt,
      movementType: m.movementType,
      metalId: m.metalId,
      metalCode: m.metal.code,
      metalName: m.metal.name,
      purityId: m.purityId,
      purityLabel: m.purity.label,
      signedWeightGrams: signedWeight,
      absoluteWeightGrams: absWeight,
      reference: m.reference,
      operatorId: m.createdBy.id,
      operatorName: m.createdBy.name,
      operatorRole: m.createdBy.role,
      relatedTransactionType: relatedType,
      relatedInvoiceOrReason,
      status,
    };
  });

  return {
    summary: {
      totalMovementsCount: rows.length,
      netWeightMovementGrams: netWeight,
      totalInflowGrams: totalInflow,
      totalOutflowGrams: totalOutflow,
    },
    rows,
  };
}

// ---------------------------------------------------------------------------
// 9. Fulfilment Report (Step 14)
// ---------------------------------------------------------------------------

export {
  getFulfilmentReport,
  type FulfilmentReportFilters,
  type FulfilmentReportRow,
} from "./fulfilment-service";
