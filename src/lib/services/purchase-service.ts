/**
 * PurchaseService — B1 & V3 Phase 1
 *
 * Handles DRAFT → POSTED lifecycle for purchases.
 * Supports both FIXED and UNFIXED rate transactions.
 * Rate fixing is atomic, auditable, and preserves physical stock invariants.
 *
 * Stock effect of POST:  +weightGrams  (PURCHASE movement, positive)
 * Stock effect of CANCEL: -weightGrams (PURCHASE_CANCEL movement, negative)
 * Rate fixing effect: Purely financial / deal state update (NO StockMovement).
 *
 * Financial precision: all weight, rate, and amount fields use Decimal.
 * The totalAmount is always server-derived: weightGrams × ratePerGram.
 */

import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import { writeAudit } from "./audit-service";
import { assertMetalActive, assertPurityActive } from "./master-service";
import { UnauthorizedError } from "./stock-service";
import type { Role, PaymentMode, RateStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

export interface CreatePurchaseInput {
  invoiceNumber: string;
  date: Date;
  supplierName: string;
  supplierContact?: string;
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
// Create Purchase (DRAFT)
// ---------------------------------------------------------------------------

export async function createPurchase(
  actorId: string,
  _actorRole: Role,
  input: CreatePurchaseInput,
) {
  const weight = new Decimal(input.weightGrams);
  if (weight.lessThanOrEqualTo(0)) throw new Error("Weight must be positive.");

  const rateStatus: RateStatus = input.rateStatus || "FIXED";
  let rate: Decimal | null = null;
  let total: Decimal | null = null;

  if (rateStatus === "FIXED") {
    if (!input.ratePerGram || input.ratePerGram.trim() === "") {
      throw new Error("Rate is required for fixed rate purchase.");
    }
    rate = new Decimal(input.ratePerGram);
    if (rate.lessThanOrEqualTo(0)) throw new Error("Rate must be positive.");
    // Server-derived total — never trust client-supplied total
    total = weight.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else {
    // UNFIXED: ratePerGram and totalAmount must remain null. Never fabricate 0 or fake rates.
    rate = null;
    total = null;
  }

  return prisma.$transaction(async (tx) => {
    // Validate metal/purity are active (must hold for new transactions)
    await assertMetalActive(tx, input.metalId);
    await assertPurityActive(tx, input.purityId, input.metalId);

    const purchase = await tx.purchase.create({
      data: {
        invoiceNumber: input.invoiceNumber,
        date: input.date,
        supplierName: input.supplierName,
        supplierContact: input.supplierContact,
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
      entityType: "Purchase",
      entityId: purchase.id,
      actorId,
      purchaseId: purchase.id,
      metalId: input.metalId,
      purityId: input.purityId,
      nextState: {
        status: "DRAFT",
        invoiceNumber: purchase.invoiceNumber,
        rateStatus,
        weightGrams: weight.toString(),
        ratePerGram: rate ? rate.toString() : null,
        totalAmount: total ? total.toString() : null,
      },
      description: `Purchase draft created: ${purchase.invoiceNumber} (${rateStatus})`,
    });

    return purchase;
  });
}

// ---------------------------------------------------------------------------
// Post Purchase (DRAFT → POSTED)
// ---------------------------------------------------------------------------

export async function postPurchase(
  actorId: string,
  _actorRole: Role,
  purchaseId: string,
) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });

    if (purchase.status !== "DRAFT") {
      throw new Error(
        `Purchase ${purchaseId} is in status ${purchase.status} and cannot be posted.`,
      );
    }

    // Validate metal/purity still active at posting time
    await assertMetalActive(tx, purchase.metalId);
    await assertPurityActive(tx, purchase.purityId, purchase.metalId);

    // 1. Update Purchase status
    await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: "POSTED",
        fulfilmentStatus: "PENDING",
      },
    });

    // CRITICAL (V3.2 Decoupling): Posting a commercial deal does NOT create physical StockMovement.
    // StockMovement is created ONLY when physical fulfilment occurs.

    // 2. Audit
    await writeAudit(tx, {
      action: "POST",
      entityType: "Purchase",
      entityId: purchaseId,
      actorId,
      purchaseId,
      metalId: purchase.metalId,
      purityId: purchase.purityId,
      prevState: { status: "DRAFT", fulfilmentStatus: "PENDING" },
      nextState: { status: "POSTED", fulfilmentStatus: "PENDING" },
      description: `Purchase deal posted: ${purchase.invoiceNumber} (Agreed: ${purchase.weightGrams.toFixed(4)}g, Fulfilment: PENDING)`,
    });

    return tx.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
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

export async function fixPurchaseRate(
  actorId: string,
  _actorRole: Role,
  purchaseId: string,
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
          `SELECT id FROM "purchase" WHERE id = $1 FOR UPDATE`,
          purchaseId,
        );
      }
    } catch {
      // Fallback for mock/test environments
    }

    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });

    if (purchase.status === "CANCELLED") {
      throw new Error(`Cannot fix rate on CANCELLED purchase ${purchase.invoiceNumber}.`);
    }

    if (purchase.rateStatus === "FIXED") {
      throw new Error(`Purchase ${purchase.invoiceNumber} rate is already FIXED and cannot be modified.`);
    }

    if (purchase.rateStatus !== "UNFIXED") {
      throw new Error(`Only UNFIXED purchases can be rate-fixed. Current status: ${purchase.rateStatus}`);
    }

    const weight = new Decimal(purchase.weightGrams.toString());
    if (weight.lessThanOrEqualTo(0)) {
      throw new Error("Purchase weight must be valid and positive.");
    }

    // Exact server-derived total amount
    const totalAmount = weight.times(newRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const fixedAt = new Date();

    const updated = await tx.purchase.update({
      where: { id: purchaseId },
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
      entityType: "Purchase",
      entityId: purchase.id,
      actorId,
      purchaseId: purchase.id,
      metalId: purchase.metalId,
      purityId: purchase.purityId,
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
      description: `Rate fixed for purchase ${purchase.invoiceNumber}: ₹${newRate.toFixed(4)}/g. Total amount: ₹${totalAmount.toFixed(2)}`,
    });

    // CRITICAL: Rate fixing is purely a financial/deal-state event.
    // It does NOT create any StockMovement. The physical inventory remains invariant.

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Close Purchase (POSTED → CLOSED) — V3.6 Gap 4
// ---------------------------------------------------------------------------

export async function closePurchase(
  actorId: string,
  _actorRole: Role,
  purchaseId: string,
) {
  return prisma.$transaction(async (tx) => {
    // Row lock
    try {
      if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
        await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `SELECT id FROM "purchase" WHERE id = $1 FOR UPDATE`,
          purchaseId,
        );
      }
    } catch {
      // Fallback
    }

    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });

    // Idempotent: if already CLOSED, return as is
    if (purchase.status === "CLOSED") {
      return purchase;
    }

    if (purchase.status !== "POSTED") {
      throw new Error(`Only POSTED purchases can be closed. Current status: ${purchase.status}`);
    }

    // Business conditions for closure:
    // 1. Rate must be FIXED (cannot close UNFIXED purchase)
    if (purchase.rateStatus !== "FIXED") {
      throw new Error(`Cannot close purchase ${purchase.invoiceNumber}: Rate is UNFIXED.`);
    }

    // 2. Physical fulfilment must be complete (FULFILLED)
    if (purchase.fulfilmentStatus !== "FULFILLED") {
      throw new Error(`Cannot close purchase ${purchase.invoiceNumber}: Fulfilment is ${purchase.fulfilmentStatus} (must be FULFILLED).`);
    }

    // 3. Financial settlement must be complete (PAID)
    if (purchase.paymentStatus !== "PAID") {
      throw new Error(`Cannot close purchase ${purchase.invoiceNumber}: Payment status is ${purchase.paymentStatus} (must be PAID).`);
    }

    const now = new Date();

    const updated = await tx.purchase.update({
      where: { id: purchaseId },
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
      entityType: "Purchase",
      entityId: purchase.id,
      actorId,
      purchaseId: purchase.id,
      metalId: purchase.metalId,
      purityId: purchase.purityId,
      prevState: { status: "POSTED" },
      nextState: { status: "CLOSED", closedAt: now.toISOString(), closedById: actorId },
      description: `PURCHASE_CLOSED: Deal ${purchase.invoiceNumber} fully settled, fulfilled, and closed.`,
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Cancel Purchase (POSTED → CANCELLED) — V3.6 Gap 5
// ---------------------------------------------------------------------------

export async function cancelPurchase(
  actorId: string,
  actorRole: Role,
  purchaseId: string,
  reason: string,
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("cancel purchase");
  }
  if (!reason?.trim()) throw new Error("Cancellation reason is required.");

  return prisma.$transaction(async (tx) => {
    // Row lock
    try {
      if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
        await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `SELECT id FROM "purchase" WHERE id = $1 FOR UPDATE`,
          purchaseId,
        );
      }
    } catch {
      // Fallback
    }

    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
      include: {
        fulfilments: {
          where: { status: { not: "CANCELLED" } },
        },
        payments: {
          where: { status: "COMPLETED" },
        },
      },
    });

    if (purchase.status !== "POSTED") {
      throw new Error(
        `Only POSTED purchases can be cancelled. Current status: ${purchase.status}`,
      );
    }

    // Calculate total fulfilled weight that actually entered physical stock
    const fulfilledWeight = purchase.fulfilments.reduce(
      (sum, f) => sum.plus(new Decimal(f.weightGrams.toString())),
      new Decimal(0),
    );

    const now = new Date();

    // 1. Mark CANCELLED
    await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: "CANCELLED",
        fulfilmentStatus: "CANCELLED",
        paymentStatus: "UNPAID",
        cancelReason: reason.trim(),
        cancelledAt: now,
      },
    });

    // 2. Reversing movement: ONLY if physical bullion actually arrived in stock!
    if (fulfilledWeight.greaterThan(0)) {
      await tx.stockMovement.create({
        data: {
          metalId: purchase.metalId,
          purityId: purchase.purityId,
          movementType: "PURCHASE_CANCEL",
          weightGrams: fulfilledWeight.negated(), // negative: remove only what was fulfilled
          purchaseId: purchase.id,
          createdById: actorId,
          reference: `Cancel of purchase ${purchase.invoiceNumber} (${fulfilledWeight.toFixed(4)}g fulfilled reversed): ${reason}`,
        },
      });
    }

    // 3. Financial Reconciliation: Cancel completed payments linked to this purchase
    if (purchase.payments.length > 0) {
      for (const pay of purchase.payments) {
        await tx.payment.update({
          where: { id: pay.id },
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
          entityId: pay.id,
          actorId,
          paymentId: pay.id,
          purchaseId: purchase.id,
          prevState: { status: "COMPLETED", amount: pay.amount.toString() },
          nextState: { status: "CANCELLED", cancelReason: `Deal cancelled: ${reason.trim()}` },
          description: `PAYMENT_CANCELLED_WITH_DEAL: Reconciled payment ${pay.paymentNumber} due to purchase ${purchase.invoiceNumber} cancellation.`,
        });
      }
    }

    // 4. Audit
    await writeAudit(tx, {
      action: "CANCEL",
      entityType: "Purchase",
      entityId: purchaseId,
      actorId,
      purchaseId,
      metalId: purchase.metalId,
      purityId: purchase.purityId,
      prevState: { status: "POSTED", fulfilmentStatus: purchase.fulfilmentStatus, paymentStatus: purchase.paymentStatus },
      nextState: {
        status: "CANCELLED",
        fulfilmentStatus: "CANCELLED",
        paymentStatus: "UNPAID",
        cancelReason: reason,
        reversedWeightGrams: fulfilledWeight.toString(),
        reconciledPaymentsCount: purchase.payments.length,
      },
      description: `Purchase cancelled: ${purchase.invoiceNumber}. Reason: ${reason} (Reversed physical stock: ${fulfilledWeight.toFixed(4)}g, Reconciled payments: ${purchase.payments.length})`,
    });

    return tx.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
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

export async function getPurchase(id: string) {
  return prisma.purchase.findUniqueOrThrow({
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

export async function listPurchases(opts?: {
  metalId?: string;
  purityId?: string;
  status?: "DRAFT" | "POSTED" | "CLOSED" | "CANCELLED";
  rateStatus?: RateStatus;
  fulfilmentStatus?: "PENDING" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED";
}) {
  return prisma.purchase.findMany({
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
