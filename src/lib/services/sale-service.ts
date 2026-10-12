/**
 * SaleService — B1 & V3 Phase 1
 *
 * Handles DRAFT → POSTED lifecycle for sales.
 * Supports both FIXED and UNFIXED rate transactions.
 * Rate fixing is atomic, auditable, and preserves physical stock invariants.
 *
 * Stock effect of POST:  -weightGrams  (SALE movement, negative)
 * Stock effect of CANCEL: +weightGrams (SALE_CANCEL movement, positive)
 * Rate fixing effect: Purely financial / deal state update (NO StockMovement).
 *
 * Financial precision: all weight, rate, and amount fields use Decimal.
 * The totalAmount is always server-derived: weightGrams × ratePerGram.
 */

import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import { writeAudit } from "./audit-service";
import { assertMetalActive, assertPurityActive } from "./master-service";
import {
  UnauthorizedError,
} from "./stock-service";
import type { Role, PaymentMode, RateStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

export interface CreateSaleInput {
  invoiceNumber: string;
  date: Date;
  buyerName: string;
  buyerContact?: string;
  counterpartyId?: string;
  metalId: string;
  purityId: string;
  /** Passed as string to preserve Decimal precision */
  weightGrams: string;
  /** Rate per gram: string when FIXED, optional/null when UNFIXED */
  ratePerGram?: string | null;
  /** Rate status: FIXED or UNFIXED (default: FIXED) */
  rateStatus?: RateStatus;
  paymentMode: PaymentMode;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Create Sale (DRAFT)
// ---------------------------------------------------------------------------

export async function createSale(
  actorId: string,
  _actorRole: Role,
  input: CreateSaleInput,
) {
  const weight = new Decimal(input.weightGrams);
  if (weight.lessThanOrEqualTo(0)) throw new Error("Weight must be positive.");

  const rateStatus: RateStatus = input.rateStatus || "FIXED";
  let rate: Decimal | null = null;
  let total: Decimal | null = null;

  if (rateStatus === "FIXED") {
    if (!input.ratePerGram || input.ratePerGram.trim() === "") {
      throw new Error("Rate is required for fixed rate sale.");
    }
    rate = new Decimal(input.ratePerGram);
    if (rate.lessThanOrEqualTo(0)) throw new Error("Rate must be positive.");
    total = weight.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else {
    // UNFIXED: ratePerGram and totalAmount must remain null. Never fabricate 0 or fake rates.
    rate = null;
    total = null;
  }

  return prisma.$transaction(async (tx) => {
    await assertMetalActive(tx, input.metalId);
    await assertPurityActive(tx, input.purityId, input.metalId);

    const sale = await tx.sale.create({
      data: {
        invoiceNumber: input.invoiceNumber,
        date: input.date,
        buyerName: input.buyerName,
        buyerContact: input.buyerContact,
        counterpartyId: input.counterpartyId,
        metalId: input.metalId,
        purityId: input.purityId,
        rateStatus,
        weightGrams: weight,
        ratePerGram: rate,
        totalAmount: total,
        paymentMode: input.paymentMode,
        notes: input.notes,
        status: "DRAFT",
        createdById: actorId,
      },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
      },
    });

    await writeAudit(tx, {
      action: "CREATE",
      entityType: "Sale",
      entityId: sale.id,
      actorId,
      saleId: sale.id,
      metalId: input.metalId,
      purityId: input.purityId,
      nextState: {
        status: "DRAFT",
        invoiceNumber: sale.invoiceNumber,
        rateStatus,
        weightGrams: weight.toString(),
        ratePerGram: rate ? rate.toString() : null,
        totalAmount: total ? total.toString() : null,
      },
      description: `Sale draft created: ${sale.invoiceNumber} (${rateStatus})`,
    });

    return sale;
  });
}

// ---------------------------------------------------------------------------
// Post Sale (DRAFT → POSTED)
// ---------------------------------------------------------------------------

export async function postSale(
  actorId: string,
  _actorRole: Role,
  saleId: string,
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });

    if (sale.status !== "DRAFT") {
      throw new Error(
        `Sale ${saleId} is in status ${sale.status} and cannot be posted.`,
      );
    }

    // Validate metal/purity still active
    await assertMetalActive(tx, sale.metalId);
    await assertPurityActive(tx, sale.purityId, sale.metalId);

    // 1. Update Sale status
    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: "POSTED",
        fulfilmentStatus: "PENDING",
      },
    });

    // CRITICAL (V3.2 Decoupling): Booking/posting a commercial sale deal does NOT create physical StockMovement.
    // StockMovement is created ONLY when physical delivery/dispatch occurs via fulfilSale.

    // 2. Audit
    await writeAudit(tx, {
      action: "POST",
      entityType: "Sale",
      entityId: saleId,
      actorId,
      saleId,
      metalId: sale.metalId,
      purityId: sale.purityId,
      prevState: { status: "DRAFT", fulfilmentStatus: "PENDING" },
      nextState: { status: "POSTED", fulfilmentStatus: "PENDING" },
      description: `Sale deal posted: ${sale.invoiceNumber} (Agreed: ${sale.weightGrams.toFixed(4)}g, Fulfilment: PENDING)`,
    });

    return tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        rateFixedBy: { select: { id: true, name: true, email: true } },
        fulfilments: true,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Fix Rate (UNFIXED → FIXED) — V3 Phase 1
// ---------------------------------------------------------------------------

export async function fixSaleRate(
  actorId: string,
  _actorRole: Role,
  saleId: string,
  ratePerGramInput: string,
) {
  if (!ratePerGramInput || ratePerGramInput.trim() === "") {
    throw new Error("Rate is required to fix transaction rate.");
  }
  const newRate = new Decimal(ratePerGramInput);
  if (newRate.lessThanOrEqualTo(0)) {
    throw new Error("Fixed rate must be strictly greater than zero.");
  }

  return prisma.$transaction(async (tx) => {
    // Concurrency lock using PostgreSQL row-level locking
    try {
      if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
        await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `SELECT id FROM "sale" WHERE id = $1 FOR UPDATE`,
          saleId,
        );
      }
    } catch {
      // Fallback for mock/test environments
    }

    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
    });

    if (sale.status === "CANCELLED") {
      throw new Error(`Cannot fix rate on CANCELLED sale ${sale.invoiceNumber}.`);
    }

    if (sale.rateStatus === "FIXED") {
      throw new Error(`Sale ${sale.invoiceNumber} rate is already FIXED and cannot be modified.`);
    }

    if (sale.rateStatus !== "UNFIXED") {
      throw new Error(`Only UNFIXED sales can be rate-fixed. Current status: ${sale.rateStatus}`);
    }

    const weight = new Decimal(sale.weightGrams.toString());
    if (weight.lessThanOrEqualTo(0)) {
      throw new Error("Sale weight must be valid and positive.");
    }

    // Exact server-derived total amount
    const totalAmount = weight.times(newRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const fixedAt = new Date();

    const updated = await tx.sale.update({
      where: { id: saleId },
      data: {
        rateStatus: "FIXED",
        ratePerGram: newRate,
        totalAmount,
        rateFixedAt: fixedAt,
        rateFixedById: actorId,
      },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        createdBy: { select: { id: true, name: true, email: true } },
        rateFixedBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Write audit record
    await writeAudit(tx, {
      action: "UPDATE",
      entityType: "Sale",
      entityId: sale.id,
      actorId,
      saleId: sale.id,
      metalId: sale.metalId,
      purityId: sale.purityId,
      prevState: {
        rateStatus: "UNFIXED",
        ratePerGram: null,
        totalAmount: null,
      },
      nextState: {
        rateStatus: "FIXED",
        ratePerGram: newRate.toString(),
        totalAmount: totalAmount.toString(),
        rateFixedAt: fixedAt.toISOString(),
        rateFixedById: actorId,
      },
      description: `Rate fixed for sale ${sale.invoiceNumber}: ₹${newRate.toFixed(4)}/g. Total amount: ₹${totalAmount.toFixed(2)}`,
    });

    // CRITICAL: Rate fixing is purely a financial/deal-state event.
    // It does NOT create any StockMovement. The physical inventory remains invariant.

    return updated;
  });
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Close Sale (POSTED → CLOSED) — V3.6 Gap 4
// ---------------------------------------------------------------------------

export async function closeSale(
  actorId: string,
  _actorRole: Role,
  saleId: string,
) {
  return prisma.$transaction(async (tx) => {
    // Row lock
    try {
      if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
        await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `SELECT id FROM "sale" WHERE id = $1 FOR UPDATE`,
          saleId,
        );
      }
    } catch {
      // Fallback
    }

    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
    });

    // Idempotent: if already CLOSED, return as is
    if (sale.status === "CLOSED") {
      return sale;
    }

    if (sale.status !== "POSTED") {
      throw new Error(`Only POSTED sales can be closed. Current status: ${sale.status}`);
    }

    // Business conditions for closure:
    // 1. Rate must be FIXED (cannot close UNFIXED sale)
    if (sale.rateStatus !== "FIXED") {
      throw new Error(`Cannot close sale ${sale.invoiceNumber}: Rate is UNFIXED.`);
    }

    // 2. Physical fulfilment must be complete (FULFILLED)
    if (sale.fulfilmentStatus !== "FULFILLED") {
      throw new Error(`Cannot close sale ${sale.invoiceNumber}: Fulfilment is ${sale.fulfilmentStatus} (must be FULFILLED).`);
    }

    // 3. Financial settlement must be complete (PAID)
    if (sale.paymentStatus !== "PAID") {
      throw new Error(`Cannot close sale ${sale.invoiceNumber}: Payment status is ${sale.paymentStatus} (must be PAID).`);
    }

    const now = new Date();

    const updated = await tx.sale.update({
      where: { id: saleId },
      data: {
        status: "CLOSED",
        closedAt: now,
        closedById: actorId,
      },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        closedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await writeAudit(tx, {
      action: "UPDATE",
      entityType: "Sale",
      entityId: sale.id,
      actorId,
      saleId: sale.id,
      metalId: sale.metalId,
      purityId: sale.purityId,
      prevState: { status: "POSTED" },
      nextState: { status: "CLOSED", closedAt: now.toISOString(), closedById: actorId },
      description: `SALE_CLOSED: Deal ${sale.invoiceNumber} fully settled, fulfilled, and closed.`,
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Cancel Sale (POSTED → CANCELLED) — V3.6 Gap 5
// ---------------------------------------------------------------------------

export async function cancelSale(
  actorId: string,
  actorRole: Role,
  saleId: string,
  reason: string,
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("cancel sale");
  }
  if (!reason?.trim()) throw new Error("Cancellation reason is required.");

  return prisma.$transaction(async (tx) => {
    // Row lock
    try {
      if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
        await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `SELECT id FROM "sale" WHERE id = $1 FOR UPDATE`,
          saleId,
        );
      }
    } catch {
      // Fallback
    }

    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: {
        fulfilments: {
          where: { status: { not: "CANCELLED" } },
        },
        payments: {
          where: { status: "COMPLETED" },
        },
      },
    });

    if (sale.status !== "POSTED") {
      throw new Error(
        `Only POSTED sales can be cancelled. Current status: ${sale.status}`,
      );
    }

    // Calculate total fulfilled weight that actually left physical stock
    const fulfilledWeight = sale.fulfilments.reduce(
      (sum, f) => sum.plus(new Decimal(f.weightGrams.toString())),
      new Decimal(0),
    );

    const now = new Date();

    // 1. Mark CANCELLED
    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: "CANCELLED",
        fulfilmentStatus: "CANCELLED",
        paymentStatus: "UNPAID",
        cancelReason: reason.trim(),
        cancelledAt: now,
      },
    });

    // 2. Reversing movement: ONLY if physical bullion actually left stock!
    if (fulfilledWeight.greaterThan(0)) {
      await tx.stockMovement.create({
        data: {
          metalId: sale.metalId,
          purityId: sale.purityId,
          movementType: "SALE_CANCEL",
          weightGrams: fulfilledWeight, // positive (returns only what left)
          saleId: sale.id,
          createdById: actorId,
          reference: `Cancel of sale ${sale.invoiceNumber} (${fulfilledWeight.toFixed(4)}g fulfilled restored): ${reason}`,
        },
      });
    }

    // 3. Financial Reconciliation: Cancel completed customer receipts linked to this sale
    if (sale.payments.length > 0) {
      for (const rec of sale.payments) {
        await tx.payment.update({
          where: { id: rec.id },
          data: {
            status: "CANCELLED",
            cancelReason: `Deal cancelled: ${reason.trim()}`,
            cancelledAt: now,
            cancelledById: actorId,
          },
        });

        await writeAudit(tx, {
          action: "CANCEL",
          entityType: "Payment",
          entityId: rec.id,
          actorId,
          paymentId: rec.id,
          saleId: sale.id,
          prevState: { status: "COMPLETED", amount: rec.amount.toString() },
          nextState: { status: "CANCELLED", cancelReason: `Deal cancelled: ${reason.trim()}` },
          description: `RECEIPT_CANCELLED_WITH_DEAL: Reconciled receipt ${rec.paymentNumber} due to sale ${sale.invoiceNumber} cancellation.`,
        });
      }
    }

    // 4. Audit
    await writeAudit(tx, {
      action: "CANCEL",
      entityType: "Sale",
      entityId: saleId,
      actorId,
      saleId,
      metalId: sale.metalId,
      purityId: sale.purityId,
      prevState: { status: "POSTED", fulfilmentStatus: sale.fulfilmentStatus, paymentStatus: sale.paymentStatus },
      nextState: {
        status: "CANCELLED",
        fulfilmentStatus: "CANCELLED",
        paymentStatus: "UNPAID",
        cancelReason: reason,
        restoredWeightGrams: fulfilledWeight.toString(),
        reconciledReceiptsCount: sale.payments.length,
      },
      description: `Sale cancelled: ${sale.invoiceNumber}. Reason: ${reason} (Restored physical stock: ${fulfilledWeight.toFixed(4)}g, Reconciled receipts: ${sale.payments.length})`,
    });

    return tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: {
        metal: true,
        purity: true,
        counterparty: true,
        fulfilments: true,
        payments: true,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getSale(id: string) {
  return prisma.sale.findUniqueOrThrow({
    where: { id },
    include: {
      metal: true,
      purity: true,
      counterparty: true,
      createdBy: true,
      rateFixedBy: { select: { id: true, name: true, email: true } },
      payments: {
        include: { createdBy: { select: { name: true } } },
        orderBy: { date: "desc" },
      },
      fulfilments: {
        include: { fulfilledBy: { select: { id: true, name: true, email: true } } },
        orderBy: { fulfilledAt: "desc" },
      },
    },
  });
}

export async function listSales(opts?: {
  metalId?: string;
  purityId?: string;
  status?: "DRAFT" | "POSTED" | "CLOSED" | "CANCELLED";
  rateStatus?: RateStatus;
  fulfilmentStatus?: "PENDING" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED";
}) {
  return prisma.sale.findMany({
    where: {
      ...(opts?.metalId ? { metalId: opts.metalId } : {}),
      ...(opts?.purityId ? { purityId: opts.purityId } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.rateStatus ? { rateStatus: opts.rateStatus } : {}),
      ...(opts?.fulfilmentStatus ? { fulfilmentStatus: opts.fulfilmentStatus } : {}),
    },
    include: {
      metal: true,
      purity: true,
      counterparty: true,
      createdBy: { select: { id: true, name: true, email: true } },
      rateFixedBy: { select: { id: true, name: true, email: true } },
      payments: {
        include: { createdBy: { select: { name: true } } },
        orderBy: { date: "desc" },
      },
      fulfilments: {
        include: { fulfilledBy: { select: { id: true, name: true, email: true } } },
        orderBy: { fulfilledAt: "desc" },
      },
    },
    orderBy: { date: "desc" },
  });
}
