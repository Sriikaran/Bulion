/**
 * PurchaseService — B1
 *
 * Handles DRAFT → POSTED lifecycle for purchases.
 * Posting is atomic: Purchase row + StockMovement row in one transaction.
 * Cancellation is atomic: status CANCELLED + reversing StockMovement.
 *
 * Stock effect of POST:  +weightGrams  (PURCHASE movement, positive)
 * Stock effect of CANCEL: -weightGrams (PURCHASE_CANCEL movement, negative)
 *
 * Financial precision: all weight, rate, and amount fields use Decimal.
 * The totalAmount is always server-derived: weightGrams × ratePerGram.
 */

import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import { writeAudit } from "./audit-service";
import { assertMetalActive, assertPurityActive } from "./master-service";
import { UnauthorizedError } from "./stock-service";
import type { Role, PaymentMode } from "@prisma/client";

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
  /** Passed as string to preserve Decimal precision */
  ratePerGram: string;
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
  const rate = new Decimal(input.ratePerGram);

  if (weight.lessThanOrEqualTo(0)) throw new Error("Weight must be positive.");
  if (rate.lessThanOrEqualTo(0)) throw new Error("Rate must be positive.");

  // Server-derived total — never trust client-supplied total
  const total = weight.times(rate).toDecimalPlaces(2);

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
        weightGrams: weight,
        ratePerGram: rate,
        totalAmount: total,
        paymentMode: input.paymentMode,
        notes: input.notes,
        status: "DRAFT",
        createdById: actorId,
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
      nextState: { status: "DRAFT", invoiceNumber: purchase.invoiceNumber },
      description: `Purchase draft created: ${purchase.invoiceNumber}`,
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
      data: { status: "POSTED" },
    });

    // 2. Create append-only StockMovement (positive = stock in)
    await tx.stockMovement.create({
      data: {
        metalId: purchase.metalId,
        purityId: purchase.purityId,
        movementType: "PURCHASE",
        weightGrams: purchase.weightGrams, // positive
        purchaseId: purchase.id,
        createdById: actorId,
        reference: `Purchase ${purchase.invoiceNumber}`,
      },
    });

    // 3. Audit
    await writeAudit(tx, {
      action: "POST",
      entityType: "Purchase",
      entityId: purchaseId,
      actorId,
      purchaseId,
      metalId: purchase.metalId,
      purityId: purchase.purityId,
      prevState: { status: "DRAFT" },
      nextState: { status: "POSTED" },
      description: `Purchase posted: ${purchase.invoiceNumber} +${purchase.weightGrams.toFixed(4)}g`,
    });

    return tx.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
      include: { metal: true, purity: true },
    });
  });
}

// ---------------------------------------------------------------------------
// Cancel Purchase (POSTED → CANCELLED)
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
    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });

    if (purchase.status !== "POSTED") {
      throw new Error(
        `Only POSTED purchases can be cancelled. Current status: ${purchase.status}`,
      );
    }

    // 1. Mark CANCELLED
    await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: "CANCELLED",
        cancelReason: reason.trim(),
        cancelledAt: new Date(),
      },
    });

    // 2. Reversing movement (negative = stock out)
    await tx.stockMovement.create({
      data: {
        metalId: purchase.metalId,
        purityId: purchase.purityId,
        movementType: "PURCHASE_CANCEL",
        weightGrams: purchase.weightGrams.negated(), // negative
        purchaseId: purchase.id,
        createdById: actorId,
        reference: `Cancel of purchase ${purchase.invoiceNumber}: ${reason}`,
      },
    });

    // 3. Audit
    await writeAudit(tx, {
      action: "CANCEL",
      entityType: "Purchase",
      entityId: purchaseId,
      actorId,
      purchaseId,
      metalId: purchase.metalId,
      purityId: purchase.purityId,
      prevState: { status: "POSTED" },
      nextState: { status: "CANCELLED", cancelReason: reason },
      description: `Purchase cancelled: ${purchase.invoiceNumber}. Reason: ${reason}`,
    });

    return tx.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getPurchase(id: string) {
  return prisma.purchase.findUniqueOrThrow({
    where: { id },
    include: { metal: true, purity: true, counterparty: true, createdBy: true },
  });
}

export async function listPurchases(opts?: {
  metalId?: string;
  purityId?: string;
  status?: "DRAFT" | "POSTED" | "CANCELLED";
}) {
  return prisma.purchase.findMany({
    where: {
      ...(opts?.metalId ? { metalId: opts.metalId } : {}),
      ...(opts?.purityId ? { purityId: opts.purityId } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    },
    include: {
      metal: true,
      purity: true,
      counterparty: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { date: "desc" },
  });
}
