/**
 * SaleService — B1
 *
 * Handles DRAFT → POSTED lifecycle for sales.
 * Posting is atomic: Sale row + StockMovement row in one transaction.
 * Stock is checked INSIDE the transaction before committing.
 *
 * CRITICAL: Sale posting NEVER allows stock to go negative.
 * The stock check and the stock movement write are in the SAME transaction.
 *
 * Stock effect of POST:  -weightGrams  (SALE movement, negative)
 * Stock effect of CANCEL: +weightGrams (SALE_CANCEL movement, positive)
 *
 * Financial precision: all weight, rate, and amount fields use Decimal.
 * The totalAmount is always server-derived: weightGrams × ratePerGram.
 */

import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import { writeAudit } from "./audit-service";
import { assertMetalActive, assertPurityActive } from "./master-service";
import {
  assertSufficientStock,
  UnauthorizedError,
} from "./stock-service";
import type { Role, PaymentMode } from "@prisma/client";

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
  /** Passed as string to preserve Decimal precision */
  ratePerGram: string;
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
  const rate = new Decimal(input.ratePerGram);

  if (weight.lessThanOrEqualTo(0)) throw new Error("Weight must be positive.");
  if (rate.lessThanOrEqualTo(0)) throw new Error("Rate must be positive.");

  const total = weight.times(rate).toDecimalPlaces(2);

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
      entityType: "Sale",
      entityId: sale.id,
      actorId,
      saleId: sale.id,
      metalId: input.metalId,
      purityId: input.purityId,
      nextState: { status: "DRAFT", invoiceNumber: sale.invoiceNumber },
      description: `Sale draft created: ${sale.invoiceNumber}`,
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

    // CRITICAL: Stock check inside the same transaction
    await assertSufficientStock(tx, sale.metalId, sale.purityId, sale.weightGrams);

    // 1. Update Sale status
    await tx.sale.update({
      where: { id: saleId },
      data: { status: "POSTED" },
    });

    // 2. Create append-only StockMovement (negative = stock out)
    await tx.stockMovement.create({
      data: {
        metalId: sale.metalId,
        purityId: sale.purityId,
        movementType: "SALE",
        weightGrams: sale.weightGrams.negated(), // negative
        saleId: sale.id,
        createdById: actorId,
        reference: `Sale ${sale.invoiceNumber}`,
      },
    });

    // 3. Audit
    await writeAudit(tx, {
      action: "POST",
      entityType: "Sale",
      entityId: saleId,
      actorId,
      saleId,
      metalId: sale.metalId,
      purityId: sale.purityId,
      prevState: { status: "DRAFT" },
      nextState: { status: "POSTED" },
      description: `Sale posted: ${sale.invoiceNumber} -${sale.weightGrams.toFixed(4)}g`,
    });

    return tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { metal: true, purity: true },
    });
  });
}

// ---------------------------------------------------------------------------
// Cancel Sale (POSTED → CANCELLED)
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
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });

    if (sale.status !== "POSTED") {
      throw new Error(
        `Only POSTED sales can be cancelled. Current status: ${sale.status}`,
      );
    }

    // 1. Mark CANCELLED
    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: "CANCELLED",
        cancelReason: reason.trim(),
        cancelledAt: new Date(),
      },
    });

    // 2. Reversing movement (positive = stock in)
    await tx.stockMovement.create({
      data: {
        metalId: sale.metalId,
        purityId: sale.purityId,
        movementType: "SALE_CANCEL",
        weightGrams: sale.weightGrams, // positive (returns to stock)
        saleId: sale.id,
        createdById: actorId,
        reference: `Cancel of sale ${sale.invoiceNumber}: ${reason}`,
      },
    });

    // 3. Audit
    await writeAudit(tx, {
      action: "CANCEL",
      entityType: "Sale",
      entityId: saleId,
      actorId,
      saleId,
      metalId: sale.metalId,
      purityId: sale.purityId,
      prevState: { status: "POSTED" },
      nextState: { status: "CANCELLED", cancelReason: reason },
      description: `Sale cancelled: ${sale.invoiceNumber}. Reason: ${reason}`,
    });

    return tx.sale.findUniqueOrThrow({ where: { id: saleId } });
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getSale(id: string) {
  return prisma.sale.findUniqueOrThrow({
    where: { id },
    include: { metal: true, purity: true, counterparty: true, createdBy: true },
  });
}

export async function listSales(opts?: {
  metalId?: string;
  purityId?: string;
  status?: "DRAFT" | "POSTED" | "CANCELLED";
}) {
  return prisma.sale.findMany({
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
