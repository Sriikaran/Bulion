import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import type { Role, FulfilmentStatus } from "@prisma/client";
import { writeAudit } from "./audit-service";
import { assertSufficientAvailableStock } from "./stock-service";

export interface FulfilmentInput {
  type: "PURCHASE" | "SALE";
  transactionId: string;
  weightGrams: string;
  date?: Date;
  notes?: string | null;
}

export interface FulfilmentReportFilters {
  fromDate?: Date;
  toDate?: Date;
  dateFrom?: string;
  dateTo?: string;
  type?: "PURCHASE" | "SALE" | "ALL" | string;
  metalId?: string;
  purityId?: string;
  counterpartyId?: string;
  status?: FulfilmentStatus | "ALL" | string;
  search?: string;
}

export interface FulfilmentReportRow {
  id: string;
  date: Date;
  type: "PURCHASE" | "SALE";
  transactionType: "PURCHASE" | "SALE";
  invoiceNumber: string;
  partyName: string;
  counterpartyName: string;
  metalName: string;
  metalCode: string;
  purityLabel: string;
  agreedWeightGrams: Decimal;
  fulfilledWeightGrams: Decimal;
  remainingWeightGrams: Decimal;
  status: FulfilmentStatus;
  notes: string | null;
}

export interface FulfilmentReportResult {
  summary: {
    totalAgreedWeightGrams: Decimal;
    totalFulfilledWeightGrams: Decimal;
    totalRemainingWeightGrams: Decimal;
    totalCount: number;
    fulfilledCount: number;
    partiallyFulfilledCount: number;
    pendingCount: number;
    cancelledCount: number;
  };
  rows: FulfilmentReportRow[];
}

// ---------------------------------------------------------------------------
// Fulfil Purchase (Physical Delivery IN)
// ---------------------------------------------------------------------------

export async function fulfilPurchase(
  actorId: string,
  _actorRole: Role,
  input: {
    purchaseId: string;
    weightGrams: string;
    date?: Date;
    notes?: string | null;
  },
) {
  if (!input.weightGrams || input.weightGrams.trim() === "") {
    throw new Error("Fulfilment weight is required.");
  }
  const fulfilWeight = new Decimal(input.weightGrams);
  if (fulfilWeight.lessThanOrEqualTo(0)) {
    throw new Error("Fulfilment weight must be strictly greater than zero.");
  }

  return prisma.$transaction(async (tx) => {
    // 1. Concurrency row-level lock
    try {
      if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
        await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `SELECT id FROM "purchase" WHERE id = $1 FOR UPDATE`,
          input.purchaseId,
        );
      }
    } catch {
      // Fallback for mocks
    }

    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id: input.purchaseId },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        fulfilments: {
          where: { status: { not: "CANCELLED" } },
        },
      },
    });

    if (purchase.status !== "POSTED") {
      throw new Error(
        `Cannot fulfil purchase in status ${purchase.status}. Only POSTED purchases can be fulfilled.`,
      );
    }

    if (purchase.fulfilmentStatus === "CANCELLED") {
      throw new Error(`Cannot fulfil cancelled purchase ${purchase.invoiceNumber}.`);
    }

    if (purchase.fulfilmentStatus === "FULFILLED") {
      throw new Error(`Purchase ${purchase.invoiceNumber} is already fully fulfilled.`);
    }

    const agreedWeight = new Decimal(purchase.weightGrams.toString());
    const alreadyFulfilled = purchase.fulfilments.reduce(
      (sum, f) => sum.plus(new Decimal(f.weightGrams.toString())),
      new Decimal(0),
    );
    const remainingWeight = agreedWeight.minus(alreadyFulfilled);

    if (fulfilWeight.greaterThan(remainingWeight)) {
      throw new Error(
        `Cannot fulfil ${fulfilWeight.toFixed(4)}g: exceeds remaining unfulfilled weight of ${remainingWeight.toFixed(4)}g (agreed: ${agreedWeight.toFixed(4)}g, already fulfilled: ${alreadyFulfilled.toFixed(4)}g).`,
      );
    }

    const newTotalFulfilled = alreadyFulfilled.plus(fulfilWeight);
    const newStatus: FulfilmentStatus = newTotalFulfilled.greaterThanOrEqualTo(agreedWeight)
      ? "FULFILLED"
      : "PARTIALLY_FULFILLED";

    const fulfilmentCount = purchase.fulfilments.length + 1;
    const fulfilmentNumber = `FUL-${purchase.invoiceNumber}-${fulfilmentCount}`;
    const deliveryDate = input.date ?? new Date();

    // 2. Create Fulfilment record
    const fulfilment = await tx.fulfilment.create({
      data: {
        fulfilmentNumber,
        type: "PURCHASE",
        status: "FULFILLED",
        weightGrams: fulfilWeight,
        fulfilledAt: deliveryDate,
        notes: input.notes?.trim() || null,
        purchaseId: purchase.id,
        fulfilledById: actorId,
      },
    });

    // 3. Create physical StockMovement IN (positive)
    await tx.stockMovement.create({
      data: {
        metalId: purchase.metalId,
        purityId: purchase.purityId,
        movementType: "PURCHASE",
        weightGrams: fulfilWeight, // positive stock in
        purchaseId: purchase.id,
        fulfilmentId: fulfilment.id,
        createdById: actorId,
        reference: `Fulfilment ${fulfilmentNumber} for purchase ${purchase.invoiceNumber}`,
      },
    });

    // 4. Update Purchase fulfilmentStatus
    const updatedPurchase = await tx.purchase.update({
      where: { id: purchase.id },
      data: { fulfilmentStatus: newStatus },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        fulfilments: true,
      },
    });

    // 5. Audit
    await writeAudit(tx, {
      action: "UPDATE",
      entityType: "Purchase",
      entityId: purchase.id,
      actorId,
      purchaseId: purchase.id,
      fulfilmentId: fulfilment.id,
      metalId: purchase.metalId,
      purityId: purchase.purityId,
      prevState: {
        fulfilmentStatus: purchase.fulfilmentStatus,
        fulfilledWeightGrams: alreadyFulfilled.toString(),
      },
      nextState: {
        fulfilmentStatus: newStatus,
        fulfilledWeightGrams: newTotalFulfilled.toString(),
        addedWeightGrams: fulfilWeight.toString(),
      },
      description: `Purchase delivery fulfilled: +${fulfilWeight.toFixed(4)}g. Status: ${newStatus} (${newTotalFulfilled.toFixed(4)}/${agreedWeight.toFixed(4)}g)`,
    });

    return {
      fulfilment,
      purchase: updatedPurchase,
      remainingWeight: agreedWeight.minus(newTotalFulfilled),
    };
  });
}

// ---------------------------------------------------------------------------
// Fulfil Sale (Physical Delivery OUT)
// ---------------------------------------------------------------------------

export async function fulfilSale(
  actorId: string,
  _actorRole: Role,
  input: {
    saleId: string;
    weightGrams: string;
    date?: Date;
    notes?: string | null;
  },
) {
  if (!input.weightGrams || input.weightGrams.trim() === "") {
    throw new Error("Fulfilment weight is required.");
  }
  const fulfilWeight = new Decimal(input.weightGrams);
  if (fulfilWeight.lessThanOrEqualTo(0)) {
    throw new Error("Fulfilment weight must be strictly greater than zero.");
  }

  return prisma.$transaction(async (tx) => {
    // 1. Concurrency row-level lock
    try {
      if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
        await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `SELECT id FROM "sale" WHERE id = $1 FOR UPDATE`,
          input.saleId,
        );
      }
    } catch {
      // Fallback for mocks
    }

    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: input.saleId },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        fulfilments: {
          where: { status: { not: "CANCELLED" } },
        },
        rateReservations: {
          where: { status: "ACTIVE" },
        },
      },
    });

    if (sale.status !== "POSTED") {
      throw new Error(
        `Cannot fulfil sale in status ${sale.status}. Only POSTED sales can be fulfilled.`,
      );
    }

    if (sale.fulfilmentStatus === "CANCELLED") {
      throw new Error(`Cannot fulfil cancelled sale ${sale.invoiceNumber}.`);
    }

    if (sale.fulfilmentStatus === "FULFILLED") {
      throw new Error(`Sale ${sale.invoiceNumber} is already fully fulfilled.`);
    }

    const agreedWeight = new Decimal(sale.weightGrams.toString());
    const alreadyFulfilled = sale.fulfilments.reduce(
      (sum, f) => sum.plus(new Decimal(f.weightGrams.toString())),
      new Decimal(0),
    );
    const remainingWeight = agreedWeight.minus(alreadyFulfilled);

    if (fulfilWeight.greaterThan(remainingWeight)) {
      throw new Error(
        `Cannot fulfil ${fulfilWeight.toFixed(4)}g: exceeds remaining unfulfilled weight of ${remainingWeight.toFixed(4)}g (agreed: ${agreedWeight.toFixed(4)}g, already fulfilled: ${alreadyFulfilled.toFixed(4)}g).`,
      );
    }

    // 2. CRITICAL: Available Stock Verification for Sale Fulfilment (Physical - Active Reservations)
    const activeResId = sale.rateReservations?.[0]?.id;
    await assertSufficientAvailableStock(tx, sale.metalId, sale.purityId, fulfilWeight, activeResId);

    const newTotalFulfilled = alreadyFulfilled.plus(fulfilWeight);
    const newStatus: FulfilmentStatus = newTotalFulfilled.greaterThanOrEqualTo(agreedWeight)
      ? "FULFILLED"
      : "PARTIALLY_FULFILLED";

    const fulfilmentCount = sale.fulfilments.length + 1;
    const fulfilmentNumber = `FUL-${sale.invoiceNumber}-${fulfilmentCount}`;
    const deliveryDate = input.date ?? new Date();

    // 3. Create Fulfilment record
    const fulfilment = await tx.fulfilment.create({
      data: {
        fulfilmentNumber,
        type: "SALE",
        status: "FULFILLED",
        weightGrams: fulfilWeight,
        fulfilledAt: deliveryDate,
        notes: input.notes?.trim() || null,
        saleId: sale.id,
        fulfilledById: actorId,
      },
    });

    // 4. Create physical StockMovement OUT (negative)
    await tx.stockMovement.create({
      data: {
        metalId: sale.metalId,
        purityId: sale.purityId,
        movementType: "SALE",
        weightGrams: fulfilWeight.negated(), // negative stock out
        saleId: sale.id,
        fulfilmentId: fulfilment.id,
        createdById: actorId,
        reference: `Fulfilment ${fulfilmentNumber} for sale ${sale.invoiceNumber}`,
      },
    });

    // 5. Update Sale fulfilmentStatus
    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: { fulfilmentStatus: newStatus },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        fulfilments: true,
      },
    });

    // 6. Audit
    await writeAudit(tx, {
      action: "UPDATE",
      entityType: "Sale",
      entityId: sale.id,
      actorId,
      saleId: sale.id,
      fulfilmentId: fulfilment.id,
      metalId: sale.metalId,
      purityId: sale.purityId,
      prevState: {
        fulfilmentStatus: sale.fulfilmentStatus,
        fulfilledWeightGrams: alreadyFulfilled.toString(),
      },
      nextState: {
        fulfilmentStatus: newStatus,
        fulfilledWeightGrams: newTotalFulfilled.toString(),
        dispatchedWeightGrams: fulfilWeight.toString(),
      },
      description: `Sale delivery fulfilled: -${fulfilWeight.toFixed(4)}g. Status: ${newStatus} (${newTotalFulfilled.toFixed(4)}/${agreedWeight.toFixed(4)}g)`,
    });

    return {
      fulfilment,
      sale: updatedSale,
      remainingWeight: agreedWeight.minus(newTotalFulfilled),
    };
  });
}

// ---------------------------------------------------------------------------
// Unified Record Fulfilment
// ---------------------------------------------------------------------------

export async function recordFulfilment(
  actorId: string,
  actorRole: Role,
  input: FulfilmentInput,
) {
  if (input.type === "PURCHASE") {
    return fulfilPurchase(actorId, actorRole, {
      purchaseId: input.transactionId,
      weightGrams: input.weightGrams,
      date: input.date,
      notes: input.notes,
    });
  } else {
    return fulfilSale(actorId, actorRole, {
      saleId: input.transactionId,
      weightGrams: input.weightGrams,
      date: input.date,
      notes: input.notes,
    });
  }
}

// ---------------------------------------------------------------------------
// Fulfilment Queries
// ---------------------------------------------------------------------------

export async function getFulfilmentSummary(
  type: "PURCHASE" | "SALE",
  transactionId: string,
) {
  if (type === "PURCHASE") {
    const purchase = await prisma.purchase.findUniqueOrThrow({
      where: { id: transactionId },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        fulfilments: {
          include: { fulfilledBy: { select: { id: true, name: true } } },
          orderBy: { fulfilledAt: "desc" },
        },
      },
    });

    const agreedWeight = new Decimal(purchase.weightGrams.toString());
    const fulfilledWeight = purchase.fulfilments
      .filter((f) => f.status !== "CANCELLED")
      .reduce((sum, f) => sum.plus(new Decimal(f.weightGrams.toString())), new Decimal(0));
    const remainingWeight = agreedWeight.minus(fulfilledWeight);

    return {
      transactionType: "PURCHASE" as const,
      id: purchase.id,
      invoiceNumber: purchase.invoiceNumber,
      counterpartyName: purchase.counterparty?.name || purchase.supplierName,
      metalName: purchase.metal.name,
      purityLabel: purchase.purity.label,
      agreedWeight,
      fulfilledWeight,
      remainingWeight: remainingWeight.lessThan(0) ? new Decimal(0) : remainingWeight,
      fulfilmentStatus: purchase.fulfilmentStatus,
      status: purchase.status,
      fulfilments: purchase.fulfilments,
    };
  } else {
    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: transactionId },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        fulfilments: {
          include: { fulfilledBy: { select: { id: true, name: true } } },
          orderBy: { fulfilledAt: "desc" },
        },
      },
    });

    const agreedWeight = new Decimal(sale.weightGrams.toString());
    const fulfilledWeight = sale.fulfilments
      .filter((f) => f.status !== "CANCELLED")
      .reduce((sum, f) => sum.plus(new Decimal(f.weightGrams.toString())), new Decimal(0));
    const remainingWeight = agreedWeight.minus(fulfilledWeight);

    return {
      transactionType: "SALE" as const,
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      counterpartyName: sale.counterparty?.name || sale.buyerName,
      metalName: sale.metal.name,
      purityLabel: sale.purity.label,
      agreedWeight,
      fulfilledWeight,
      remainingWeight: remainingWeight.lessThan(0) ? new Decimal(0) : remainingWeight,
      fulfilmentStatus: sale.fulfilmentStatus,
      status: sale.status,
      fulfilments: sale.fulfilments,
    };
  }
}

// ---------------------------------------------------------------------------
// Fulfilment Report (Step 14)
// ---------------------------------------------------------------------------

export async function getFulfilmentReport(
  filters: FulfilmentReportFilters = {},
): Promise<FulfilmentReportResult> {
  const rows: FulfilmentReportRow[] = [];

  const fromDate = filters.fromDate || (filters.dateFrom ? new Date(filters.dateFrom) : undefined);
  const toDate = filters.toDate || (filters.dateTo ? new Date(filters.dateTo) : undefined);
  const dealType = filters.type && filters.type !== "ALL" ? filters.type : undefined;
  const statusFilter = filters.status && filters.status !== "ALL" ? (filters.status as FulfilmentStatus) : undefined;
  const searchLower = filters.search?.toLowerCase().trim();

  // Query Purchases
  if (!dealType || dealType === "PURCHASE") {
    const purchases = await prisma.purchase.findMany({
      where: {
        ...(fromDate || toDate
          ? {
              date: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
        ...(filters.metalId ? { metalId: filters.metalId } : {}),
        ...(filters.purityId ? { purityId: filters.purityId } : {}),
        ...(filters.counterpartyId ? { counterpartyId: filters.counterpartyId } : {}),
        ...(statusFilter ? { fulfilmentStatus: statusFilter } : {}),
        status: { in: ["POSTED", "CANCELLED"] },
      },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        fulfilments: {
          where: { status: { not: "CANCELLED" } },
        },
      },
      orderBy: { date: "desc" },
    });

    for (const p of purchases) {
      const party = p.counterparty?.name || p.supplierName;
      if (searchLower) {
        const matches =
          p.invoiceNumber.toLowerCase().includes(searchLower) ||
          party.toLowerCase().includes(searchLower) ||
          (p.notes && p.notes.toLowerCase().includes(searchLower));
        if (!matches) continue;
      }

      const agreed = new Decimal(p.weightGrams.toString());
      const fulfilled = p.fulfilments.reduce(
        (sum, f) => sum.plus(new Decimal(f.weightGrams.toString())),
        new Decimal(0),
      );
      const remaining = agreed.minus(fulfilled);

      rows.push({
        id: p.id,
        date: p.date,
        type: "PURCHASE",
        transactionType: "PURCHASE",
        invoiceNumber: p.invoiceNumber,
        partyName: party,
        counterpartyName: party,
        metalName: p.metal.name,
        metalCode: p.metal.code,
        purityLabel: p.purity.label,
        agreedWeightGrams: agreed,
        fulfilledWeightGrams: fulfilled,
        remainingWeightGrams: remaining.lessThan(0) ? new Decimal(0) : remaining,
        status: p.fulfilmentStatus,
        notes: p.notes,
      });
    }
  }

  // Query Sales
  if (!dealType || dealType === "SALE") {
    const sales = await prisma.sale.findMany({
      where: {
        ...(fromDate || toDate
          ? {
              date: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
        ...(filters.metalId ? { metalId: filters.metalId } : {}),
        ...(filters.purityId ? { purityId: filters.purityId } : {}),
        ...(filters.counterpartyId ? { counterpartyId: filters.counterpartyId } : {}),
        ...(statusFilter ? { fulfilmentStatus: statusFilter } : {}),
        status: { in: ["POSTED", "CANCELLED"] },
      },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        fulfilments: {
          where: { status: { not: "CANCELLED" } },
        },
      },
      orderBy: { date: "desc" },
    });

    for (const s of sales) {
      const party = s.counterparty?.name || s.buyerName;
      if (searchLower) {
        const matches =
          s.invoiceNumber.toLowerCase().includes(searchLower) ||
          party.toLowerCase().includes(searchLower) ||
          (s.notes && s.notes.toLowerCase().includes(searchLower));
        if (!matches) continue;
      }

      const agreed = new Decimal(s.weightGrams.toString());
      const fulfilled = s.fulfilments.reduce(
        (sum, f) => sum.plus(new Decimal(f.weightGrams.toString())),
        new Decimal(0),
      );
      const remaining = agreed.minus(fulfilled);

      rows.push({
        id: s.id,
        date: s.date,
        type: "SALE",
        transactionType: "SALE",
        invoiceNumber: s.invoiceNumber,
        partyName: party,
        counterpartyName: party,
        metalName: s.metal.name,
        metalCode: s.metal.code,
        purityLabel: s.purity.label,
        agreedWeightGrams: agreed,
        fulfilledWeightGrams: fulfilled,
        remainingWeightGrams: remaining.lessThan(0) ? new Decimal(0) : remaining,
        status: s.fulfilmentStatus,
        notes: s.notes,
      });
    }
  }

  // Sort by date descending
  rows.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Aggregate summary
  let totalAgreed = new Decimal(0);
  let totalFulfilled = new Decimal(0);
  let totalRemaining = new Decimal(0);
  let fulfilledCount = 0;
  let partiallyFulfilledCount = 0;
  let pendingCount = 0;
  let cancelledCount = 0;

  for (const r of rows) {
    if (r.status !== "CANCELLED") {
      totalAgreed = totalAgreed.plus(r.agreedWeightGrams);
      totalFulfilled = totalFulfilled.plus(r.fulfilledWeightGrams);
      totalRemaining = totalRemaining.plus(r.remainingWeightGrams);
    }
    if (r.status === "FULFILLED") fulfilledCount++;
    else if (r.status === "PARTIALLY_FULFILLED") partiallyFulfilledCount++;
    else if (r.status === "PENDING") pendingCount++;
    else if (r.status === "CANCELLED") cancelledCount++;
  }

  return {
    summary: {
      totalAgreedWeightGrams: totalAgreed,
      totalFulfilledWeightGrams: totalFulfilled,
      totalRemainingWeightGrams: totalRemaining,
      totalCount: rows.length,
      fulfilledCount,
      partiallyFulfilledCount,
      pendingCount,
      cancelledCount,
    },
    rows,
  };
}
