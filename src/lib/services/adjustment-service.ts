/**
 * AdjustmentService — B1
 *
 * Stock adjustments are ADMIN-only operations.
 * Every adjustment immediately creates a StockMovement (no DRAFT state).
 * DECREASE adjustments are validated against current stock.
 *
 * Stock effect of INCREASE:  +weightGrams  (ADJUSTMENT_INCREASE, positive)
 * Stock effect of DECREASE:  -weightGrams  (ADJUSTMENT_DECREASE, negative)
 * Cancellation creates a reversing movement.
 *
 * Financial precision: Decimal throughout.
 */

import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import { writeAudit } from "./audit-service";
import { assertMetalActive, assertPurityActive } from "./master-service";
import {
  assertSufficientStock,
  UnauthorizedError,
} from "./stock-service";
import type { Role, AdjustmentDirection } from "@prisma/client";

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

export interface CreateAdjustmentInput {
  date: Date;
  metalId: string;
  purityId: string;
  direction: AdjustmentDirection;
  /** Passed as string to preserve Decimal precision */
  weightGrams: string;
  reason: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Create & Post Adjustment (immediate — no DRAFT for adjustments)
// ---------------------------------------------------------------------------

export async function createAdjustment(
  actorId: string,
  actorRole: Role,
  input: CreateAdjustmentInput,
) {
  // ADMIN-only
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("create stock adjustment");
  }

  const weight = new Decimal(input.weightGrams);
  if (weight.lessThanOrEqualTo(0)) throw new Error("Weight must be positive.");
  if (!input.reason?.trim()) throw new Error("Reason is required.");

  return prisma.$transaction(async (tx) => {
    // Validate master data
    await assertMetalActive(tx, input.metalId);
    await assertPurityActive(tx, input.purityId, input.metalId);

    // For DECREASE: validate we have enough stock
    if (input.direction === "DECREASE") {
      await assertSufficientStock(tx, input.metalId, input.purityId, weight);
    }

    // 1. Create adjustment record
    const adjustment = await tx.stockAdjustment.create({
      data: {
        date: input.date,
        metalId: input.metalId,
        purityId: input.purityId,
        direction: input.direction,
        weightGrams: weight,
        reason: input.reason.trim(),
        notes: input.notes,
        status: "POSTED",
        createdById: actorId,
      },
    });

    // 2. Create append-only StockMovement
    const movementType =
      input.direction === "INCREASE" ? "ADJUSTMENT_INCREASE" : "ADJUSTMENT_DECREASE";
    const signedWeight =
      input.direction === "INCREASE" ? weight : weight.negated();

    await tx.stockMovement.create({
      data: {
        metalId: input.metalId,
        purityId: input.purityId,
        movementType,
        weightGrams: signedWeight,
        adjustmentId: adjustment.id,
        createdById: actorId,
        reference: `Adjustment ${input.direction}: ${input.reason}`,
      },
    });

    // 3. Audit
    await writeAudit(tx, {
      action: "CREATE",
      entityType: "StockAdjustment",
      entityId: adjustment.id,
      actorId,
      adjustmentId: adjustment.id,
      metalId: input.metalId,
      purityId: input.purityId,
      nextState: {
        status: "POSTED",
        direction: input.direction,
        weightGrams: weight.toFixed(4),
        reason: input.reason,
      },
      description: `Stock adjustment (${input.direction}) posted: ${signedWeight.toFixed(4)}g. Reason: ${input.reason}`,
    });

    return adjustment;
  });
}

// ---------------------------------------------------------------------------
// Cancel Adjustment (reversal)
// ---------------------------------------------------------------------------

export async function cancelAdjustment(
  actorId: string,
  actorRole: Role,
  adjustmentId: string,
  reason: string,
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("cancel stock adjustment");
  }
  if (!reason?.trim()) throw new Error("Cancellation reason is required.");

  return prisma.$transaction(async (tx) => {
    const adj = await tx.stockAdjustment.findUniqueOrThrow({
      where: { id: adjustmentId },
    });

    if (adj.status !== "POSTED") {
      throw new Error(
        `Only POSTED adjustments can be cancelled. Current status: ${adj.status}`,
      );
    }

    // For a DECREASE reversal: stock goes back up — no negative check needed
    // For an INCREASE reversal: stock goes down — check we have enough
    if (adj.direction === "INCREASE") {
      await assertSufficientStock(tx, adj.metalId, adj.purityId, adj.weightGrams);
    }

    // 1. Mark CANCELLED
    await tx.stockAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: "CANCELLED",
        cancelReason: reason.trim(),
        cancelledAt: new Date(),
      },
    });

    // 2. Reversing movement
    const reversalMovementType =
      adj.direction === "INCREASE" ? "ADJUSTMENT_DECREASE" : "ADJUSTMENT_INCREASE";
    const reversalWeight =
      adj.direction === "INCREASE" ? adj.weightGrams.negated() : adj.weightGrams;

    await tx.stockMovement.create({
      data: {
        metalId: adj.metalId,
        purityId: adj.purityId,
        movementType: reversalMovementType,
        weightGrams: reversalWeight,
        adjustmentId: adj.id,
        createdById: actorId,
        reference: `Reversal of adjustment ${adj.id}: ${reason}`,
      },
    });

    // 3. Audit
    await writeAudit(tx, {
      action: "CANCEL",
      entityType: "StockAdjustment",
      entityId: adjustmentId,
      actorId,
      adjustmentId,
      metalId: adj.metalId,
      purityId: adj.purityId,
      prevState: { status: "POSTED" },
      nextState: { status: "CANCELLED", cancelReason: reason },
      description: `Adjustment cancelled and reversed: ${reason}`,
    });

    return tx.stockAdjustment.findUniqueOrThrow({ where: { id: adjustmentId } });
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getAdjustment(id: string) {
  return prisma.stockAdjustment.findUniqueOrThrow({
    where: { id },
    include: { metal: true, purity: true, createdBy: true },
  });
}

export async function listAdjustments(opts?: {
  metalId?: string;
  purityId?: string;
}) {
  return prisma.stockAdjustment.findMany({
    where: {
      ...(opts?.metalId ? { metalId: opts.metalId } : {}),
      ...(opts?.purityId ? { purityId: opts.purityId } : {}),
    },
    include: {
      metal: true,
      purity: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { date: "desc" },
  });
}
