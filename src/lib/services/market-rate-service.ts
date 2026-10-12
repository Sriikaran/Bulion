/**
 * MarketRateService — Bullion V3 Phase 4
 *
 * Implements Market Reference Rates for Gold and Silver:
 * - Reference only: does NOT modify historical or active Purchase/Sale transactions.
 * - Does NOT modify RateReservation.reservedRatePerGram.
 * - Does NOT create StockMovement, Payment, Receipt, or Fulfilment records.
 * - Preserves time-series history: old rates are closed, never overwritten.
 * - Full Decimal precision with PostgreSQL concurrency safety.
 */

import { prisma } from "@/lib/db/client";
import Decimal from "decimal.js";
import { writeAudit } from "./audit-service";
import type { CreateMarketRateInput, GetMarketRateHistoryInput } from "@/lib/validations/market-rate";

export interface MarketRateRow {
  id: string;
  metalId: string;
  purityId: string;
  metalName: string;
  metalCode: string;
  purityLabel: string;
  unit: string;
  ratePerGram: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  source: string | null;
  notes: string | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  isCurrent: boolean;
}

export interface CurrentRateCard {
  metalId: string;
  metalName: string;
  metalCode: string;
  purityId: string;
  purityLabel: string;
  fineness: string;
  ratePerGram: string | null;
  effectiveFrom: Date | null;
  source: string | null;
  hasRate: boolean;
}

export interface MarketRateReportResult {
  rates: MarketRateRow[];
  currentRates: CurrentRateCard[];
  summary: {
    totalRatesCount: number;
    activeQuotedCount: number;
    gold24kRate: string | null;
    silver999Rate: string | null;
    latestUpdated: Date | null;
  };
}

/**
 * Creates a new market reference rate.
 *
 * Concurrency & History Rules:
 * 1. Closes any previous open-ended rate for (metal, purity) at `effectiveFrom`.
 * 2. If future rate exists, bounds `effectiveTo` of new rate to the next rate's `effectiveFrom`.
 * 3. Never overwrites or destroys historical rates.
 * 4. Never touches existing Purchase, Sale, or RateReservation records.
 */
export async function createMarketRate(
  input: CreateMarketRateInput,
  userId: string,
) {
  const rateDecimal = new Decimal(input.ratePerGram);
  if (rateDecimal.lessThanOrEqualTo(0)) {
    throw new Error("Market rate must be strictly positive");
  }

  const effectiveFrom = new Date(input.effectiveFrom);
  if (isNaN(effectiveFrom.getTime())) {
    throw new Error("Effective date and time is invalid");
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Verify metal & purity exist
    const metal = await tx.metal.findUnique({
      where: { id: input.metalId },
    });
    if (!metal) {
      throw new Error(`Metal with ID ${input.metalId} not found`);
    }

    const purity = await tx.purity.findUnique({
      where: { id: input.purityId },
    });
    if (!purity) {
      throw new Error(`Purity with ID ${input.purityId} not found`);
    }
    if (purity.metalId !== metal.id) {
      throw new Error(`Purity ${purity.label} does not belong to metal ${metal.name}`);
    }

    // 2. Prevent duplicate rate at the exact same millisecond
    const exactMatch = await tx.marketRate.findFirst({
      where: {
        metalId: metal.id,
        purityId: purity.id,
        effectiveFrom: effectiveFrom,
      },
    });
    if (exactMatch) {
      throw new Error(
        `A market rate for ${metal.name} ${purity.label} already exists at ${effectiveFrom.toISOString()}. Please choose a different effective timestamp.`,
      );
    }

    // 3. Find if there is a subsequent rate scheduled after effectiveFrom
    const nextRate = await tx.marketRate.findFirst({
      where: {
        metalId: metal.id,
        purityId: purity.id,
        effectiveFrom: { gt: effectiveFrom },
      },
      orderBy: { effectiveFrom: "asc" },
    });

    const effectiveTo = nextRate ? nextRate.effectiveFrom : null;

    // 4. Close any prior open-ended or overlapping rate that extends beyond effectiveFrom
    await tx.marketRate.updateMany({
      where: {
        metalId: metal.id,
        purityId: purity.id,
        effectiveFrom: { lt: effectiveFrom },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
      },
      data: {
        effectiveTo: effectiveFrom,
      },
    });

    // 5. Create new MarketRate record
    const newRate = await tx.marketRate.create({
      data: {
        metalId: metal.id,
        purityId: purity.id,
        unit: input.unit || "GRAM",
        ratePerGram: rateDecimal,
        effectiveFrom: effectiveFrom,
        effectiveTo: effectiveTo,
        source: input.source?.trim() || null,
        notes: input.notes?.trim() || null,
        createdById: userId,
      },
      include: {
        metal: true,
        purity: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    // 6. Audit trail
    await writeAudit(tx, {
      action: "CREATE",
      entityType: "MarketRate",
      entityId: newRate.id,
      actorId: userId,
      metalId: metal.id,
      purityId: purity.id,
      marketRateId: newRate.id,
      description: `Market reference rate created for ${metal.name} ${purity.label}: ₹${rateDecimal.toFixed(2)}/g effective from ${effectiveFrom.toISOString()}`,
      nextState: {
        id: newRate.id,
        metal: metal.code,
        purity: purity.label,
        ratePerGram: rateDecimal.toString(),
        effectiveFrom: effectiveFrom.toISOString(),
        effectiveTo: effectiveTo ? effectiveTo.toISOString() : null,
        source: newRate.source,
      },
    });

    return newRate;
  });
}

/**
 * Gets the current effective market rate for a specific metal and purity as of a point in time.
 *
 * Rules:
 * - Returns rate where effectiveFrom <= asOf and (effectiveTo IS NULL or effectiveTo > asOf).
 * - If no rate exists, returns null.
 * - Does NOT fabricate or fallback to transaction rates.
 */
export async function getCurrentMarketRate(
  metalId: string,
  purityId: string,
  asOf: Date = new Date(),
) {
  const rate = await prisma.marketRate.findFirst({
    where: {
      metalId,
      purityId,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
    },
    orderBy: { effectiveFrom: "desc" },
    include: {
      metal: true,
      purity: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  return rate;
}

/**
 * Gets the current market rates for all active metals and purities.
 * Returns null for any bucket without an active reference rate.
 */
export async function getAllCurrentMarketRates(
  asOf: Date = new Date(),
): Promise<CurrentRateCard[]> {
  const metals = await prisma.metal.findMany({
    where: { isActive: true },
    include: {
      purities: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const cards: CurrentRateCard[] = [];

  for (const m of metals) {
    for (const p of m.purities) {
      const rate = await getCurrentMarketRate(m.id, p.id, asOf);
      cards.push({
        metalId: m.id,
        metalName: m.name,
        metalCode: m.code,
        purityId: p.id,
        purityLabel: p.label,
        fineness: p.fineness.toString(),
        ratePerGram: rate ? rate.ratePerGram.toString() : null,
        effectiveFrom: rate ? rate.effectiveFrom : null,
        source: rate?.source || null,
        hasRate: rate !== null,
      });
    }
  }

  return cards;
}

/**
 * Queries market rate history with filtering.
 */
export async function getMarketRateHistory(
  filters: GetMarketRateHistoryInput,
): Promise<MarketRateRow[]> {
  const where: Record<string, unknown> = {};

  if (filters.metalId) where.metalId = filters.metalId;
  if (filters.purityId) where.purityId = filters.purityId;
  if (filters.source) {
    where.source = { contains: filters.source, mode: "insensitive" };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.effectiveFrom = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  const rates = await prisma.marketRate.findMany({
    where,
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    include: {
      metal: true,
      purity: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  const now = new Date();

  return rates.map((r) => {
    const isCurrent =
      r.effectiveFrom <= now && (r.effectiveTo === null || r.effectiveTo > now);

    return {
      id: r.id,
      metalId: r.metalId,
      purityId: r.purityId,
      metalName: r.metal.name,
      metalCode: r.metal.code,
      purityLabel: r.purity.label,
      unit: r.unit,
      ratePerGram: r.ratePerGram.toString(),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      source: r.source,
      notes: r.notes,
      createdById: r.createdById,
      createdByName: r.createdBy.name,
      createdAt: r.createdAt,
      isCurrent,
    };
  });
}

/**
 * Generates the full Market Rates Report for business users.
 */
export async function getMarketRatesReport(
  filters: GetMarketRateHistoryInput,
): Promise<MarketRateReportResult> {
  const [historyRows, currentCards] = await Promise.all([
    getMarketRateHistory(filters),
    getAllCurrentMarketRates(),
  ]);

  const activeQuotedCount = currentCards.filter((c) => c.hasRate).length;

  // Find gold 24K and silver 999 for top KPI cards
  const gold24kCard = currentCards.find(
    (c) =>
      c.metalCode.toUpperCase() === "GOLD" &&
      (c.purityLabel.includes("24K") || c.fineness.startsWith("0.999")),
  );
  const silver999Card = currentCards.find(
    (c) =>
      c.metalCode.toUpperCase() === "SILVER" &&
      (c.purityLabel.includes("999") || c.fineness.startsWith("0.999")),
  );

  const latestUpdated = historyRows.length > 0 ? historyRows[0].createdAt : null;

  return {
    rates: historyRows,
    currentRates: currentCards,
    summary: {
      totalRatesCount: historyRows.length,
      activeQuotedCount,
      gold24kRate: gold24kCard?.ratePerGram || null,
      silver999Rate: silver999Card?.ratePerGram || null,
      latestUpdated,
    },
  };
}
