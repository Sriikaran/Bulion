import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import type { Role, ReservationType, ReservationStatus } from "@prisma/client";
import { writeAudit } from "./audit-service";
import { assertSufficientAvailableStock } from "./stock-service";
import { assertMetalActive, assertPurityActive } from "./master-service";
import type {
  CreateRateReservationInput,
  CancelRateReservationInput,
  ConsumeRateReservationInput,
} from "@/lib/validations/reservation";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface RateReservationReportFilters {
  fromDate?: Date;
  toDate?: Date;
  dateFrom?: string;
  dateTo?: string;
  type?: "PURCHASE" | "SALE" | "ALL" | string;
  metalId?: string;
  purityId?: string;
  counterpartyId?: string;
  status?: ReservationStatus | "ALL" | string;
  search?: string;
}

export interface RateReservationRow {
  id: string;
  reservationNumber: string;
  date: Date;
  type: "PURCHASE" | "SALE";
  partyName: string;
  invoiceNumber: string;
  metalName: string;
  metalCode: string;
  purityLabel: string;
  weightGrams: Decimal;
  reservedRatePerGram: Decimal;
  reservedAmount: Decimal;
  status: ReservationStatus;
  reservedAt: Date;
  expiresAt: Date;
  consumedAt?: Date | null;
  cancelledAt?: Date | null;
  expiredAt?: Date | null;
  notes?: string | null;
}

export interface RateReservationReportResult {
  summary: {
    totalReservedWeightGrams: Decimal;
    totalReservedAmount: Decimal;
    totalCount: number;
    activeCount: number;
    consumedCount: number;
    expiredCount: number;
    cancelledCount: number;
  };
  rows: RateReservationRow[];
}

// ---------------------------------------------------------------------------
// Helper: Lazy Expiration
// ---------------------------------------------------------------------------

export async function expireOverdueReservations(transactionId?: string): Promise<number> {
  const now = new Date();
  const overdue = await prisma.rateReservation.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: now },
      ...(transactionId
        ? {
            OR: [{ purchaseId: transactionId }, { saleId: transactionId }],
          }
        : {}),
    },
  });

  if (overdue.length === 0) return 0;

  for (const res of overdue) {
    await prisma.$transaction(async (tx) => {
      await tx.rateReservation.update({
        where: { id: res.id },
        data: {
          status: "EXPIRED",
          expiredAt: now,
        },
      });

      await writeAudit(tx, {
        action: "UPDATE",
        entityType: "RateReservation",
        entityId: res.id,
        actorId: res.createdById,
        metalId: res.metalId,
        purityId: res.purityId,
        purchaseId: res.purchaseId ?? undefined,
        saleId: res.saleId ?? undefined,
        reservationId: res.id,
        prevState: { status: "ACTIVE" },
        nextState: { status: "EXPIRED", expiredAt: now.toISOString() },
        description: `RATE_RESERVATION_EXPIRED: Reservation ${res.reservationNumber} expired at ${now.toISOString()}`,
      });
    });
  }

  return overdue.length;
}

// ---------------------------------------------------------------------------
// 1. Create Rate Reservation (Step 5 & 6)
// ---------------------------------------------------------------------------

export async function createRateReservation(
  actorId: string,
  _actorRole: Role,
  input: CreateRateReservationInput,
) {
  const reqWeight = new Decimal(input.weightGrams);
  const reqRate = new Decimal(input.reservedRatePerGram);
  const expiresAt = new Date(input.expiresAt);

  if (reqWeight.lessThanOrEqualTo(0)) {
    throw new Error("Reservation weight must be strictly greater than zero.");
  }
  if (reqRate.lessThanOrEqualTo(0)) {
    throw new Error("Reserved rate must be strictly greater than zero.");
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new Error("Reservation expiry time must be in the future.");
  }

  // Lazy expire before evaluation
  await expireOverdueReservations(input.transactionId ?? undefined);

  return prisma.$transaction(async (tx) => {
    let metalId: string;
    let purityId: string;
    let agreedWeight: Decimal;
    let invoiceNumber: string;
    let purchaseId: string | null = null;
    let saleId: string | null = null;
    let counterpartyId: string | null = null;

    if (!input.transactionId || !input.transactionId.trim()) {
      // -------------------------------------------------------------
      // Standalone Rate Block (Pre-Deal Customer Reservation)
      // -------------------------------------------------------------
      if (!input.counterpartyId) {
        throw new Error("Counterparty is required for a standalone rate reservation.");
      }
      if (!input.metalId || !input.purityId) {
        throw new Error("Metal and Purity are required for a standalone rate reservation.");
      }

      metalId = input.metalId;
      purityId = input.purityId;
      counterpartyId = input.counterpartyId;

      await assertMetalActive(tx, metalId);
      await assertPurityActive(tx, purityId, metalId);

      const cp = await tx.counterparty.findUniqueOrThrow({
        where: { id: counterpartyId },
      });
      if (!cp.isActive) {
        throw new Error(`Counterparty ${cp.name} is inactive and cannot be used.`);
      }

      invoiceNumber = `STANDALONE (${cp.name})`;

      // CRITICAL: If SALE, assert Available-to-Sell stock (Physical - Active Reservations)
      if (input.type === "SALE") {
        await assertSufficientAvailableStock(tx, metalId, purityId, reqWeight);
      }
    } else if (input.type === "PURCHASE") {
      purchaseId = input.transactionId;
      // Row lock
      try {
        if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
          await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
            `SELECT id FROM "purchase" WHERE id = $1 FOR UPDATE`,
            input.transactionId,
          );
        }
      } catch {
        // Fallback for mock environments
      }

      const purchase = await tx.purchase.findUniqueOrThrow({
        where: { id: input.transactionId },
        include: {
          rateReservations: {
            where: { status: "ACTIVE" },
          },
        },
      });

      if (purchase.status === "CANCELLED") {
        throw new Error(`Cannot reserve rate on CANCELLED purchase ${purchase.invoiceNumber}.`);
      }
      if (purchase.rateStatus === "FIXED") {
        throw new Error(`Purchase ${purchase.invoiceNumber} rate is already FIXED. Reservations are not permitted.`);
      }
      if (purchase.rateStatus !== "UNFIXED") {
        throw new Error(`Rate reservations are only allowed on UNFIXED purchases.`);
      }

      metalId = purchase.metalId;
      purityId = purchase.purityId;
      counterpartyId = purchase.counterpartyId;
      agreedWeight = new Decimal(purchase.weightGrams.toString());
      invoiceNumber = purchase.invoiceNumber;

      // Calculate active reserved weight
      const activeReserved = purchase.rateReservations
        .filter((r) => r.expiresAt.getTime() > Date.now())
        .reduce((sum, r) => sum.plus(new Decimal(r.weightGrams.toString())), new Decimal(0));

      const reservable = agreedWeight.minus(activeReserved);
      if (reqWeight.greaterThan(reservable)) {
        throw new Error(
          `Cannot reserve ${reqWeight.toFixed(4)}g. Only ${reservable.toFixed(4)}g remaining available for reservation on purchase ${purchase.invoiceNumber}.`,
        );
      }
    } else {
      saleId = input.transactionId;
      // Row lock
      try {
        if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
          await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
            `SELECT id FROM "sale" WHERE id = $1 FOR UPDATE`,
            input.transactionId,
          );
        }
      } catch {
        // Fallback
      }

      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: input.transactionId },
        include: {
          rateReservations: {
            where: { status: "ACTIVE" },
          },
        },
      });

      if (sale.status === "CANCELLED") {
        throw new Error(`Cannot reserve rate on CANCELLED sale ${sale.invoiceNumber}.`);
      }
      if (sale.rateStatus === "FIXED") {
        throw new Error(`Sale ${sale.invoiceNumber} rate is already FIXED. Reservations are not permitted.`);
      }
      if (sale.rateStatus !== "UNFIXED") {
        throw new Error(`Rate reservations are only allowed on UNFIXED sales.`);
      }

      metalId = sale.metalId;
      purityId = sale.purityId;
      counterpartyId = sale.counterpartyId;
      agreedWeight = new Decimal(sale.weightGrams.toString());
      invoiceNumber = sale.invoiceNumber;

      // Calculate active reserved weight on this deal
      const activeReserved = sale.rateReservations
        .filter((r) => r.expiresAt.getTime() > Date.now())
        .reduce((sum, r) => sum.plus(new Decimal(r.weightGrams.toString())), new Decimal(0));

      const reservable = agreedWeight.minus(activeReserved);
      if (reqWeight.greaterThan(reservable)) {
        throw new Error(
          `Cannot reserve ${reqWeight.toFixed(4)}g. Only ${reservable.toFixed(4)}g remaining available for reservation on sale ${sale.invoiceNumber}.`,
        );
      }

      // CRITICAL: Also assert Available-to-Sell stock in the vault
      await assertSufficientAvailableStock(tx, metalId, purityId, reqWeight);
    }

    // Reserved amount = weight × rate (rounded to 2 decimal places with Decimal.ROUND_HALF_UP)
    const reservedAmount = reqWeight.times(reqRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const reservationNumber = `RES-${input.type === "PURCHASE" ? "PUR" : "SAL"}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const reservation = await tx.rateReservation.create({
      data: {
        reservationNumber,
        type: input.type,
        status: "ACTIVE",
        weightGrams: reqWeight,
        reservedRatePerGram: reqRate,
        reservedAmount,
        expiresAt,
        notes: input.notes,
        metalId,
        purityId,
        purchaseId,
        saleId,
        counterpartyId,
        referenceRatePerGram: input.referenceRatePerGram ? new Decimal(input.referenceRatePerGram) : null,
        marginType: input.marginType ?? null,
        marginValue: input.marginValue ? new Decimal(input.marginValue) : null,
        createdById: actorId,
      },
      include: {
        metal: true,
        purity: true,
        purchase: true,
        sale: true,
        counterparty: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Write audit log
    await writeAudit(tx, {
      action: "CREATE",
      entityType: "RateReservation",
      entityId: reservation.id,
      actorId,
      metalId,
      purityId,
      purchaseId: purchaseId ?? undefined,
      saleId: saleId ?? undefined,
      reservationId: reservation.id,
      nextState: {
        reservationNumber,
        type: input.type,
        invoiceNumber,
        counterpartyId,
        weightGrams: reqWeight.toString(),
        reservedRatePerGram: reqRate.toString(),
        reservedAmount: reservedAmount.toString(),
        expiresAt: expiresAt.toISOString(),
        status: "ACTIVE",
      },
      description: `RATE_RESERVATION_CREATED: Reserved ${reqWeight.toFixed(4)}g @ ₹${reqRate.toFixed(4)}/g for ${input.type} ${invoiceNumber} until ${expiresAt.toISOString()}`,
    });

    return reservation;
  });
}

// ---------------------------------------------------------------------------
// 2. Consume Rate Reservation (Step 9)
// ---------------------------------------------------------------------------

export async function consumeRateReservation(
  actorId: string,
  _actorRole: Role,
  input: ConsumeRateReservationInput,
) {
  return prisma.$transaction(async (tx) => {
    // Row lock reservation
    try {
      if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
        await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `SELECT id FROM "rate_reservation" WHERE id = $1 FOR UPDATE`,
          input.reservationId,
        );
      }
    } catch {
      // Fallback
    }

    const reservation = await tx.rateReservation.findUniqueOrThrow({
      where: { id: input.reservationId },
      include: {
        purchase: true,
        sale: true,
      },
    });

    if (reservation.status !== "ACTIVE") {
      throw new Error(`Only ACTIVE rate reservations can be consumed. Current status: ${reservation.status}`);
    }

    const now = new Date();
    if (reservation.expiresAt.getTime() <= now.getTime()) {
      // Lazy expire and reject
      await tx.rateReservation.update({
        where: { id: reservation.id },
        data: {
          status: "EXPIRED",
          expiredAt: now,
        },
      });

      await writeAudit(tx, {
        action: "UPDATE",
        entityType: "RateReservation",
        entityId: reservation.id,
        actorId,
        metalId: reservation.metalId,
        purityId: reservation.purityId,
        purchaseId: reservation.purchaseId ?? undefined,
        saleId: reservation.saleId ?? undefined,
        reservationId: reservation.id,
        prevState: { status: "ACTIVE" },
        nextState: { status: "EXPIRED", expiredAt: now.toISOString() },
        description: `RATE_RESERVATION_EXPIRED: Attempted to consume expired reservation ${reservation.reservationNumber}`,
      });

      throw new Error(`Rate reservation ${reservation.reservationNumber} has expired and cannot be consumed.`);
    }

    const rate = new Decimal(reservation.reservedRatePerGram.toString());

    // Connect to existing rate-fixing domain
    if (reservation.type === "PURCHASE" && reservation.purchaseId) {
      const purchase = await tx.purchase.findUniqueOrThrow({
        where: { id: reservation.purchaseId },
      });

      if (purchase.status === "CANCELLED") {
        throw new Error(`Cannot fix rate on CANCELLED purchase ${purchase.invoiceNumber}.`);
      }
      if (purchase.rateStatus === "FIXED") {
        throw new Error(`Purchase ${purchase.invoiceNumber} rate is already FIXED.`);
      }

      const weight = new Decimal(purchase.weightGrams.toString());
      const totalAmount = weight.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      // Fix rate on Purchase
      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          rateStatus: "FIXED",
          ratePerGram: rate,
          totalAmount,
          rateFixedAt: now,
          rateFixedById: actorId,
        },
      });

      // Audit purchase rate fixing
      await writeAudit(tx, {
        action: "UPDATE",
        entityType: "Purchase",
        entityId: purchase.id,
        actorId,
        purchaseId: purchase.id,
        metalId: purchase.metalId,
        purityId: purchase.purityId,
        prevState: { rateStatus: "UNFIXED", ratePerGram: null, totalAmount: null },
        nextState: {
          rateStatus: "FIXED",
          ratePerGram: rate.toString(),
          totalAmount: totalAmount.toString(),
          rateFixedAt: now.toISOString(),
          rateFixedById: actorId,
        },
        description: `Rate fixed via reservation ${reservation.reservationNumber} for purchase ${purchase.invoiceNumber}: ₹${rate.toFixed(4)}/g. Total: ₹${totalAmount.toFixed(2)}`,
      });
    } else if (reservation.type === "SALE" && reservation.saleId) {
      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: reservation.saleId },
      });

      if (sale.status === "CANCELLED") {
        throw new Error(`Cannot fix rate on CANCELLED sale ${sale.invoiceNumber}.`);
      }
      if (sale.rateStatus === "FIXED") {
        throw new Error(`Sale ${sale.invoiceNumber} rate is already FIXED.`);
      }

      const weight = new Decimal(sale.weightGrams.toString());
      const totalAmount = weight.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      // Fix rate on Sale
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          rateStatus: "FIXED",
          ratePerGram: rate,
          totalAmount,
          rateFixedAt: now,
          rateFixedById: actorId,
        },
      });

      // Audit sale rate fixing
      await writeAudit(tx, {
        action: "UPDATE",
        entityType: "Sale",
        entityId: sale.id,
        actorId,
        saleId: sale.id,
        metalId: sale.metalId,
        purityId: sale.purityId,
        prevState: { rateStatus: "UNFIXED", ratePerGram: null, totalAmount: null },
        nextState: {
          rateStatus: "FIXED",
          ratePerGram: rate.toString(),
          totalAmount: totalAmount.toString(),
          rateFixedAt: now.toISOString(),
          rateFixedById: actorId,
        },
        description: `Rate fixed via reservation ${reservation.reservationNumber} for sale ${sale.invoiceNumber}: ₹${rate.toFixed(4)}/g. Total: ₹${totalAmount.toFixed(2)}`,
      });
    } else if (!reservation.purchaseId && !reservation.saleId) {
      // ---------------------------------------------------------------------
      // Standalone Rate Block Consumption: Convert to new Purchase or Sale Deal
      // ---------------------------------------------------------------------
      if (!reservation.counterpartyId) {
        throw new Error(`Standalone reservation ${reservation.reservationNumber} has no associated counterparty.`);
      }

      const cp = await tx.counterparty.findUniqueOrThrow({
        where: { id: reservation.counterpartyId },
      });

      const weight = new Decimal(reservation.weightGrams.toString());
      const totalAmount = weight.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      if (reservation.type === "PURCHASE") {
        const invNum = input.invoiceNumber?.trim() || `PUR-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

        const purchase = await tx.purchase.create({
          data: {
            invoiceNumber: invNum,
            date: now,
            supplierName: cp.name,
            supplierContact: cp.phone || undefined,
            counterpartyId: cp.id,
            metalId: reservation.metalId,
            purityId: reservation.purityId,
            weightGrams: weight,
            ratePerGram: rate,
            totalAmount,
            rateStatus: "FIXED",
            rateFixedAt: now,
            rateFixedById: actorId,
            paymentMode: "BANK_TRANSFER",
            status: "POSTED",
            fulfilmentStatus: "PENDING",
            paymentStatus: "UNPAID",
            createdById: actorId,
            notes: `Created from standalone Rate Reservation ${reservation.reservationNumber}`,
          },
        });

        // Link purchase to this reservation
        await tx.rateReservation.update({
          where: { id: reservation.id },
          data: { purchaseId: purchase.id },
        });

        await writeAudit(tx, {
          action: "CREATE",
          entityType: "Purchase",
          entityId: purchase.id,
          actorId,
          purchaseId: purchase.id,
          metalId: purchase.metalId,
          purityId: purchase.purityId,
          reservationId: reservation.id,
          nextState: {
            status: "POSTED",
            invoiceNumber: purchase.invoiceNumber,
            rateStatus: "FIXED",
            ratePerGram: rate.toString(),
            totalAmount: totalAmount.toString(),
            rateFixedAt: now.toISOString(),
          },
          description: `PURCHASE_CREATED_FROM_RESERVATION: Created purchase ${purchase.invoiceNumber} from reservation ${reservation.reservationNumber} @ ₹${rate.toFixed(4)}/g`,
        });
      } else {
        const invNum = input.invoiceNumber?.trim() || `SAL-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

        const sale = await tx.sale.create({
          data: {
            invoiceNumber: invNum,
            date: now,
            buyerName: cp.name,
            buyerContact: cp.phone || undefined,
            counterpartyId: cp.id,
            metalId: reservation.metalId,
            purityId: reservation.purityId,
            weightGrams: weight,
            ratePerGram: rate,
            totalAmount,
            rateStatus: "FIXED",
            rateFixedAt: now,
            rateFixedById: actorId,
            paymentMode: "BANK_TRANSFER",
            status: "POSTED",
            fulfilmentStatus: "PENDING",
            paymentStatus: "UNPAID",
            createdById: actorId,
            notes: `Created from standalone Rate Reservation ${reservation.reservationNumber}`,
          },
        });

        // Link sale to this reservation
        await tx.rateReservation.update({
          where: { id: reservation.id },
          data: { saleId: sale.id },
        });

        await writeAudit(tx, {
          action: "CREATE",
          entityType: "Sale",
          entityId: sale.id,
          actorId,
          saleId: sale.id,
          metalId: sale.metalId,
          purityId: sale.purityId,
          reservationId: reservation.id,
          nextState: {
            status: "POSTED",
            invoiceNumber: sale.invoiceNumber,
            rateStatus: "FIXED",
            ratePerGram: rate.toString(),
            totalAmount: totalAmount.toString(),
            rateFixedAt: now.toISOString(),
          },
          description: `SALE_CREATED_FROM_RESERVATION: Created sale ${sale.invoiceNumber} from reservation ${reservation.reservationNumber} @ ₹${rate.toFixed(4)}/g`,
        });
      }
    }

    // Mark reservation as CONSUMED
    const updated = await tx.rateReservation.update({
      where: { id: reservation.id },
      data: {
        status: "CONSUMED",
        consumedAt: now,
        consumedById: actorId,
        notes: input.notes ? `${reservation.notes || ""}\n${input.notes}`.trim() : reservation.notes,
      },
      include: {
        metal: true,
        purity: true,
        purchase: true,
        sale: true,
        counterparty: true,
        consumedBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Write audit log for reservation consumption
    await writeAudit(tx, {
      action: "UPDATE",
      entityType: "RateReservation",
      entityId: reservation.id,
      actorId,
      metalId: reservation.metalId,
      purityId: reservation.purityId,
      purchaseId: reservation.purchaseId ?? undefined,
      saleId: reservation.saleId ?? undefined,
      reservationId: reservation.id,
      prevState: { status: "ACTIVE" },
      nextState: { status: "CONSUMED", consumedAt: now.toISOString(), consumedById: actorId },
      description: `RATE_RESERVATION_CONSUMED: Reservation ${reservation.reservationNumber} consumed to fix rate at ₹${rate.toFixed(4)}/g`,
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// 3. Cancel Rate Reservation (Step 11)
// ---------------------------------------------------------------------------

export async function cancelRateReservation(
  actorId: string,
  _actorRole: Role,
  input: CancelRateReservationInput,
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.rateReservation.findUniqueOrThrow({
      where: { id: input.reservationId },
    });

    if (reservation.status !== "ACTIVE") {
      throw new Error(`Only ACTIVE rate reservations can be cancelled. Current status: ${reservation.status}`);
    }

    const now = new Date();
    const updated = await tx.rateReservation.update({
      where: { id: reservation.id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledById: actorId,
        notes: input.reason
          ? `${reservation.notes || ""}\nCancel Reason: ${input.reason}`.trim()
          : reservation.notes,
      },
      include: {
        metal: true,
        purity: true,
        purchase: true,
        sale: true,
        cancelledBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Write audit log
    await writeAudit(tx, {
      action: "CANCEL",
      entityType: "RateReservation",
      entityId: reservation.id,
      actorId,
      metalId: reservation.metalId,
      purityId: reservation.purityId,
      purchaseId: reservation.purchaseId ?? undefined,
      saleId: reservation.saleId ?? undefined,
      reservationId: reservation.id,
      prevState: { status: "ACTIVE" },
      nextState: {
        status: "CANCELLED",
        cancelledAt: now.toISOString(),
        cancelledById: actorId,
        cancelReason: input.reason,
      },
      description: `RATE_RESERVATION_CANCELLED: Reservation ${reservation.reservationNumber} cancelled. Reason: ${input.reason || "None specified"}`,
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// 4. Rate Reservation Queries & Reports (Step 18)
// ---------------------------------------------------------------------------

export async function getReservationsForTransaction(
  type: "PURCHASE" | "SALE",
  transactionId: string,
) {
  await expireOverdueReservations(transactionId);

  return prisma.rateReservation.findMany({
    where: {
      type,
      ...(type === "PURCHASE" ? { purchaseId: transactionId } : { saleId: transactionId }),
    },
    include: {
      metal: true,
      purity: true,
      createdBy: { select: { id: true, name: true } },
      consumedBy: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getRateReservationsReport(
  filters: RateReservationReportFilters = {},
): Promise<RateReservationReportResult> {
  await expireOverdueReservations();

  const fromDate = filters.fromDate || (filters.dateFrom ? new Date(filters.dateFrom) : undefined);
  const toDate = filters.toDate || (filters.dateTo ? new Date(filters.dateTo) : undefined);
  const typeFilter = filters.type && filters.type !== "ALL" ? (filters.type as ReservationType) : undefined;
  const statusFilter = filters.status && filters.status !== "ALL" ? (filters.status as ReservationStatus) : undefined;
  const searchLower = filters.search?.toLowerCase().trim();

  const reservations = await prisma.rateReservation.findMany({
    where: {
      ...(fromDate || toDate
        ? {
            reservedAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(filters.metalId ? { metalId: filters.metalId } : {}),
      ...(filters.purityId ? { purityId: filters.purityId } : {}),
    },
    include: {
      metal: true,
      purity: true,
      counterparty: true,
      purchase: {
        include: { counterparty: true },
      },
      sale: {
        include: { counterparty: true },
      },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { reservedAt: "desc" },
  });

  const rows: RateReservationRow[] = [];

  for (const r of reservations) {
    const partyName =
      (r.type === "PURCHASE"
        ? r.purchase?.counterparty?.name || r.purchase?.supplierName
        : r.sale?.counterparty?.name || r.sale?.buyerName) ||
      r.counterparty?.name ||
      "—";

    const invoiceNumber =
      (r.type === "PURCHASE"
        ? r.purchase?.invoiceNumber
        : r.sale?.invoiceNumber) || "STANDALONE";

    if (filters.counterpartyId) {
      const cpId =
        (r.type === "PURCHASE" ? r.purchase?.counterpartyId : r.sale?.counterpartyId) ||
        r.counterpartyId;
      if (cpId !== filters.counterpartyId) continue;
    }

    if (searchLower) {
      const match =
        r.reservationNumber.toLowerCase().includes(searchLower) ||
        invoiceNumber.toLowerCase().includes(searchLower) ||
        partyName.toLowerCase().includes(searchLower) ||
        (r.notes && r.notes.toLowerCase().includes(searchLower));
      if (!match) continue;
    }

    rows.push({
      id: r.id,
      reservationNumber: r.reservationNumber,
      date: r.reservedAt,
      type: r.type,
      partyName,
      invoiceNumber,
      metalName: r.metal.name,
      metalCode: r.metal.code,
      purityLabel: r.purity.label,
      weightGrams: new Decimal(r.weightGrams.toString()),
      reservedRatePerGram: new Decimal(r.reservedRatePerGram.toString()),
      reservedAmount: new Decimal(r.reservedAmount.toString()),
      status: r.status,
      reservedAt: r.reservedAt,
      expiresAt: r.expiresAt,
      consumedAt: r.consumedAt,
      cancelledAt: r.cancelledAt,
      expiredAt: r.expiredAt,
      notes: r.notes,
    });
  }

  let totalWeight = new Decimal(0);
  let totalAmount = new Decimal(0);
  let activeCount = 0;
  let consumedCount = 0;
  let expiredCount = 0;
  let cancelledCount = 0;

  for (const r of rows) {
    totalWeight = totalWeight.plus(r.weightGrams);
    totalAmount = totalAmount.plus(r.reservedAmount);
    if (r.status === "ACTIVE") activeCount++;
    else if (r.status === "CONSUMED") consumedCount++;
    else if (r.status === "EXPIRED") expiredCount++;
    else if (r.status === "CANCELLED") cancelledCount++;
  }

  return {
    summary: {
      totalReservedWeightGrams: totalWeight,
      totalReservedAmount: totalAmount,
      totalCount: rows.length,
      activeCount,
      consumedCount,
      expiredCount,
      cancelledCount,
    },
    rows,
  };
}
