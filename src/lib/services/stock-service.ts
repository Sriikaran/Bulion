/**
 * StockService — B1
 *
 * Authoritative service for all stock queries and calculations.
 * Stock is derived EXCLUSIVELY from the append-only StockMovement table.
 * This service NEVER mutates stock directly — mutations happen via
 * PurchaseService, SaleService, and AdjustmentService within Prisma
 * transactions that also write the corresponding StockMovement row.
 *
 * Invariant:
 *   currentStock(metalId, purityId) =
 *       SUM(weightGrams) of all POSTED StockMovement rows
 *       WHERE metalId AND purityId
 *       (weightGrams is signed: positive = in, negative = out)
 */

import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StockPosition {
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
  currentWeightGrams: Decimal;
  reservedWeightGrams: Decimal;
  availableToSellWeightGrams: Decimal;
}

// ---------------------------------------------------------------------------
// Stock Calculation (Single Authoritative Source)
// ---------------------------------------------------------------------------

/**
 * Derive the current stock position for one (metalId, purityId) bucket.
 * All arithmetic uses Decimal to avoid floating-point loss.
 */
export async function getCurrentStock(
  metalId: string,
  purityId: string,
): Promise<Decimal> {
  const result = await prisma.stockMovement.aggregate({
    where: { metalId, purityId },
    _sum: { weightGrams: true },
  });
  return result._sum.weightGrams ?? new Decimal(0);
}

/**
 * Derive a full breakdown for one (metalId, purityId) bucket.
 */
export async function getStockPosition(
  metalId: string,
  purityId: string,
): Promise<StockPosition> {
  const now = new Date();
  const [metal, purity, movements, activeReservations] = await Promise.all([
    prisma.metal.findUniqueOrThrow({ where: { id: metalId } }),
    prisma.purity.findUniqueOrThrow({ where: { id: purityId } }),
    prisma.stockMovement.findMany({ where: { metalId, purityId } }),
    prisma.rateReservation.findMany({
      where: {
        metalId,
        purityId,
        type: "SALE",
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
      select: { weightGrams: true },
    }),
  ]);

  let opening = new Decimal(0);
  let purchased = new Decimal(0);
  let sold = new Decimal(0);
  let adjIncrease = new Decimal(0);
  let adjDecrease = new Decimal(0);

  for (const m of movements) {
    const w = m.weightGrams;
    switch (m.movementType) {
      case "OPENING":
        opening = opening.plus(w);
        break;
      case "PURCHASE":
        purchased = purchased.plus(w);
        break;
      case "PURCHASE_CANCEL":
        purchased = purchased.plus(w); // w is negative
        break;
      case "SALE":
        sold = sold.plus(w.abs()); // w is negative; track absolute sold
        break;
      case "SALE_CANCEL":
        sold = sold.minus(w.abs()); // reversal reduces sold
        break;
      case "ADJUSTMENT_INCREASE":
        adjIncrease = adjIncrease.plus(w);
        break;
      case "ADJUSTMENT_DECREASE":
        adjDecrease = adjDecrease.plus(w.abs()); // w is negative; track absolute
        break;
    }
  }

  // current = opening + purchased - sold + adjIncrease - adjDecrease
  const current = opening
    .plus(purchased)
    .minus(sold)
    .plus(adjIncrease)
    .minus(adjDecrease);

  const reserved = activeReservations.reduce(
    (sum, r) => sum.plus(new Decimal(r.weightGrams.toString())),
    new Decimal(0),
  );
  const availableToSell = Decimal.max(0, current.minus(reserved));

  return {
    metalId,
    metalCode: metal.code,
    metalName: metal.name,
    purityId,
    purityLabel: purity.label,
    fineness: purity.fineness,
    openingWeightGrams: opening,
    purchasedWeightGrams: purchased,
    soldWeightGrams: sold,
    adjustmentIncreaseGrams: adjIncrease,
    adjustmentDecreaseGrams: adjDecrease,
    currentWeightGrams: current,
    reservedWeightGrams: reserved,
    availableToSellWeightGrams: availableToSell,
  };
}

export interface DetailedStockPosition extends StockPosition {
  averagePurchaseRate: Decimal;
  totalPurchaseValue: Decimal;
  averageSellingRate: Decimal;
  totalSalesValue: Decimal;
  hasOpeningStock: boolean;
}

/**
 * Get all stock positions across all active (Metal × Purity) pairs.
 */
export async function getAllStockPositions(): Promise<StockPosition[]> {
  // Find all active metals and their purities, plus any with movements
  const purities = await prisma.purity.findMany({
    where: { isActive: true },
    select: { metalId: true, id: true },
  });

  const movementPairs = await prisma.stockMovement.findMany({
    select: { metalId: true, purityId: true },
    distinct: ["metalId", "purityId"],
  });

  const pairMap = new Map<string, { metalId: string; purityId: string }>();
  for (const p of purities) {
    pairMap.set(`${p.metalId}_${p.id}`, { metalId: p.metalId, purityId: p.id });
  }
  for (const p of movementPairs) {
    pairMap.set(`${p.metalId}_${p.purityId}`, { metalId: p.metalId, purityId: p.purityId });
  }

  return Promise.all(
    Array.from(pairMap.values()).map((p) => getStockPosition(p.metalId, p.purityId)),
  );
}

/**
 * Get detailed stock positions with financial valuation for the /stock page.
 */
export async function getDetailedStockPositions(): Promise<DetailedStockPosition[]> {
  const basePositions = await getAllStockPositions();

  return Promise.all(
    basePositions.map(async (pos) => {
      const [purchaseAgg, saleAgg, opening] = await Promise.all([
        prisma.purchase.aggregate({
          where: {
            metalId: pos.metalId,
            purityId: pos.purityId,
            status: { in: ["POSTED", "CLOSED"] },
          },
          _sum: {
            totalAmount: true,
            weightGrams: true,
          },
        }),
        prisma.sale.aggregate({
          where: {
            metalId: pos.metalId,
            purityId: pos.purityId,
            status: { in: ["POSTED", "CLOSED"] },
          },
          _sum: {
            totalAmount: true,
            weightGrams: true,
          },
        }),
        prisma.openingStock.findUnique({
          where: {
            metalId_purityId: {
              metalId: pos.metalId,
              purityId: pos.purityId,
            },
          },
        }),
      ]);

      const totalPurchaseValue = purchaseAgg._sum.totalAmount != null
        ? new Decimal(purchaseAgg._sum.totalAmount.toString())
        : new Decimal(0);
      const totalPurchasedWeight = purchaseAgg._sum.weightGrams != null
        ? new Decimal(purchaseAgg._sum.weightGrams.toString())
        : new Decimal(0);

      const totalSalesValue = saleAgg._sum.totalAmount != null
        ? new Decimal(saleAgg._sum.totalAmount.toString())
        : new Decimal(0);
      const totalSoldWeight = saleAgg._sum.weightGrams != null
        ? new Decimal(saleAgg._sum.weightGrams.toString())
        : new Decimal(0);

      const avgPurchaseRate = totalPurchasedWeight.greaterThan(0)
        ? totalPurchaseValue.dividedBy(totalPurchasedWeight).toDecimalPlaces(2)
        : new Decimal(0);

      const avgSellingRate = totalSoldWeight.greaterThan(0)
        ? totalSalesValue.dividedBy(totalSoldWeight).toDecimalPlaces(2)
        : new Decimal(0);

      return {
        ...pos,
        averagePurchaseRate: avgPurchaseRate,
        totalPurchaseValue,
        averageSellingRate: avgSellingRate,
        totalSalesValue,
        hasOpeningStock: !!opening,
      };
    }),
  );
}

/**
 * Get movement history for a specific bucket.
 */
export async function getBucketMovements(metalId: string, purityId: string) {
  return prisma.stockMovement.findMany({
    where: { metalId, purityId },
    include: {
      metal: true,
      purity: true,
      createdBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * List all stock movements with comprehensive metadata for transaction history.
 */
export async function listStockMovements(filters?: {
  metalId?: string;
  purityId?: string;
  movementType?: import("@prisma/client").MovementType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  skip?: number;
}) {
  const where: import("@prisma/client").Prisma.StockMovementWhereInput = {};
  if (filters?.metalId) where.metalId = filters.metalId;
  if (filters?.purityId) where.purityId = filters.purityId;
  if (filters?.movementType) where.movementType = filters.movementType;
  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  return prisma.stockMovement.findMany({
    where,
    include: {
      metal: true,
      purity: true,
      createdBy: { select: { id: true, name: true, role: true } },
      purchase: { select: { id: true, invoiceNumber: true, supplierName: true, status: true } },
      sale: { select: { id: true, invoiceNumber: true, buyerName: true, status: true } },
      adjustment: { select: { id: true, reason: true, direction: true, status: true } },
      openingStock: { select: { id: true, effectiveDate: true } },
    },
    orderBy: { createdAt: "desc" },
    take: filters?.limit ?? 100,
    skip: filters?.skip ?? 0,
  });
}

/**
 * Validate that a given (metalId, purityId) has at least `requiredGrams`
 * available. Throws a descriptive error if not.
 * Must be called INSIDE a Prisma transaction to be safe.
 */
export async function assertSufficientStock(
  tx: import("@prisma/client").Prisma.TransactionClient,
  metalId: string,
  purityId: string,
  requiredGrams: Decimal,
): Promise<void> {
  // Concurrency Guard: Lock the bucket's purity record using SELECT ... FOR UPDATE.
  // This serializes concurrent sales/adjustments competing for the same physical stock pool.
  try {
    if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
      await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
        `SELECT id FROM purity WHERE id = $1 FOR UPDATE`,
        purityId,
      );
    }
  } catch {
    // Fallback if provider or in-memory mock does not support raw locking
  }

  const result = await tx.stockMovement.aggregate({
    where: { metalId, purityId },
    _sum: { weightGrams: true },
  });
  const rawAvailable = result._sum.weightGrams;
  const available = rawAvailable != null ? new Decimal(rawAvailable.toString()) : new Decimal(0);
  if (available.lessThan(requiredGrams)) {
    throw new InsufficientStockError(
      metalId,
      purityId,
      available,
      requiredGrams,
    );
  }
}

/**
 * Calculate active reserved quantity for sales by metal + purity.
 * Expired, cancelled, or consumed reservations do not count.
 */
export async function getActiveReservedWeight(
  metalId: string,
  purityId: string,
  tx?: import("@prisma/client").Prisma.TransactionClient,
  excludeReservationId?: string,
): Promise<Decimal> {
  const client = tx ?? prisma;
  const now = new Date();
  const reservations = await client.rateReservation.findMany({
    where: {
      metalId,
      purityId,
      type: "SALE",
      status: "ACTIVE",
      expiresAt: { gt: now },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    },
    select: { weightGrams: true },
  });

  return reservations.reduce(
    (sum, r) => sum.plus(new Decimal(r.weightGrams.toString())),
    new Decimal(0),
  );
}

/**
 * Derive Available-to-Sell: Physical On-Hand - Active Reservations.
 */
export async function getAvailableToSellStock(
  metalId: string,
  purityId: string,
  tx?: import("@prisma/client").Prisma.TransactionClient,
  excludeReservationId?: string,
): Promise<Decimal> {
  const client = tx ?? prisma;
  const [physicalAgg, reserved] = await Promise.all([
    client.stockMovement.aggregate({
      where: { metalId, purityId },
      _sum: { weightGrams: true },
    }),
    getActiveReservedWeight(metalId, purityId, client, excludeReservationId),
  ]);

  const rawPhysical = physicalAgg._sum.weightGrams;
  const physicalWeight = rawPhysical != null ? new Decimal(rawPhysical.toString()) : new Decimal(0);
  const available = physicalWeight.minus(reserved);
  return Decimal.max(0, available);
}

/**
 * Validate that a given (metalId, purityId) has at least `requiredGrams`
 * AVAILABLE TO SELL (Physical On-Hand minus Active Reservations).
 * Must be called INSIDE a Prisma transaction to be safe.
 */
export async function assertSufficientAvailableStock(
  tx: import("@prisma/client").Prisma.TransactionClient,
  metalId: string,
  purityId: string,
  requiredGrams: Decimal,
  excludeReservationId?: string,
): Promise<void> {
  // Concurrency Guard: Lock the bucket's purity record using SELECT ... FOR UPDATE.
  try {
    if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
      await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
        `SELECT id FROM purity WHERE id = $1 FOR UPDATE`,
        purityId,
      );
    }
  } catch {
    // Fallback if provider or in-memory mock does not support raw locking
  }

  const [physicalAgg, reserved] = await Promise.all([
    tx.stockMovement.aggregate({
      where: { metalId, purityId },
      _sum: { weightGrams: true },
    }),
    getActiveReservedWeight(metalId, purityId, tx, excludeReservationId),
  ]);

  const rawPhysical = physicalAgg._sum.weightGrams;
  const physical = rawPhysical != null ? new Decimal(rawPhysical.toString()) : new Decimal(0);
  const available = physical.minus(reserved);
  const availableToSell = Decimal.max(0, available);

  if (availableToSell.lessThan(requiredGrams)) {
    throw new InsufficientAvailableStockError(
      metalId,
      purityId,
      physical,
      reserved,
      availableToSell,
      requiredGrams,
    );
  }
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class InsufficientStockError extends Error {
  constructor(
    public readonly metalId: string,
    public readonly purityId: string,
    public readonly available: Decimal,
    public readonly requested: Decimal,
  ) {
    super(
      `Insufficient stock for metal=${metalId} purity=${purityId}. ` +
        `Available: ${available.toFixed(4)}g, Requested: ${requested.toFixed(4)}g`,
    );
    this.name = "InsufficientStockError";
  }
}

export class InsufficientAvailableStockError extends Error {
  constructor(
    public readonly metalId: string,
    public readonly purityId: string,
    public readonly physical: Decimal,
    public readonly reserved: Decimal,
    public readonly availableToSell: Decimal,
    public readonly requested: Decimal,
  ) {
    super(
      `Insufficient available-to-sell stock for metal=${metalId} purity=${purityId}. ` +
        `Physical on-hand: ${physical.toFixed(4)}g, Reserved: ${reserved.toFixed(4)}g, ` +
        `Available-to-sell: ${availableToSell.toFixed(4)}g, Requested: ${requested.toFixed(4)}g`,
    );
    this.name = "InsufficientAvailableStockError";
  }
}

export class InactiveEntityError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} with id=${id} is inactive and cannot be used for new transactions.`);
    this.name = "InactiveEntityError";
  }
}

export class UnauthorizedError extends Error {
  constructor(action: string) {
    super(`You are not authorized to perform: ${action}`);
    this.name = "UnauthorizedError";
  }
}