/**
 * OpeningStockService — B1
 *
 * Establishes the opening physical stock for a (Metal × Purity) bucket.
 * Opening stock is IMMUTABLE after creation — it cannot be edited or deleted.
 * It creates an OPENING StockMovement so the stock calculation invariant holds.
 *
 * Invariant:
 *   currentStock = OPENING + PURCHASES - SALES ± ADJUSTMENTS
 *
 * Can only be set ONCE per (metalId, purityId). If you need to correct it,
 * use a StockAdjustment (which creates an auditable record).
 */

import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import { writeAudit } from "./audit-service";
import { assertMetalActive, assertPurityActive } from "./master-service";
import { UnauthorizedError } from "./stock-service";
import type { Role } from "@prisma/client";

export interface SetOpeningStockInput {
  metalId: string;
  purityId: string;
  /** Passed as string to preserve Decimal precision */
  weightGrams: string;
  effectiveDate: Date;
  notes?: string;
}

export async function setOpeningStock(
  actorId: string,
  actorRole: Role,
  input: SetOpeningStockInput,
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("set opening stock");
  }

  const weight = new Decimal(input.weightGrams);
  if (weight.lessThan(0)) throw new Error("Opening stock weight cannot be negative.");

  return prisma.$transaction(async (tx) => {
    // Validate master data
    await assertMetalActive(tx, input.metalId);
    await assertPurityActive(tx, input.purityId, input.metalId);

    // Enforce uniqueness: only one opening stock per (metal, purity)
    const existing = await tx.openingStock.findUnique({
      where: { metalId_purityId: { metalId: input.metalId, purityId: input.purityId } },
    });
    if (existing) {
      throw new Error(
        `Opening stock already exists for metalId=${input.metalId}, purityId=${input.purityId}. ` +
          `Use a StockAdjustment to correct the balance.`,
      );
    }

    // 1. Create OpeningStock record
    const opening = await tx.openingStock.create({
      data: {
        metalId: input.metalId,
        purityId: input.purityId,
        weightGrams: weight,
        effectiveDate: input.effectiveDate,
        notes: input.notes,
        createdById: actorId,
      },
    });

    // 2. Create append-only StockMovement (positive)
    await tx.stockMovement.create({
      data: {
        metalId: input.metalId,
        purityId: input.purityId,
        movementType: "OPENING",
        weightGrams: weight,
        openingStockId: opening.id,
        createdById: actorId,
        reference: `Opening stock: ${weight.toFixed(4)}g`,
      },
    });

    // 3. Audit
    await writeAudit(tx, {
      action: "CREATE",
      entityType: "OpeningStock",
      entityId: opening.id,
      actorId,
      metalId: input.metalId,
      purityId: input.purityId,
      nextState: { weightGrams: weight.toFixed(4), effectiveDate: input.effectiveDate },
      description: `Opening stock set: ${weight.toFixed(4)}g`,
    });

    return opening;
  });
}

export async function getOpeningStock(metalId: string, purityId: string) {
  return prisma.openingStock.findUnique({
    where: { metalId_purityId: { metalId, purityId } },
    include: { metal: true, purity: true },
  });
}
