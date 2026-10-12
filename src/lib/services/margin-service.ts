import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import type { QuoteDirection, MarginType } from "@prisma/client";
import { writeAudit } from "./audit-service";
import type {
  CreateMarginRuleInput,
  GetMarginRulesFilterInput,
} from "@/lib/validations/margin";

// ---------------------------------------------------------------------------
// Margin Rule Service (V3.5)
// ---------------------------------------------------------------------------

/**
 * Creates a new Margin Rule.
 * - Enforces positive margin value.
 * - Safely bounds previous open-ended active rules to avoid ambiguity.
 * - Safely bounds new rule to any subsequent scheduled future rule.
 * - Rejects identical millisecond duplicate rules.
 * - Immutable historical preservation.
 */
export async function createMarginRule(
  input: CreateMarginRuleInput,
  userId: string,
) {
  const marginDecimal = new Decimal(input.marginValue);
  if (marginDecimal.lessThanOrEqualTo(0)) {
    throw new Error("Margin value must be strictly positive");
  }

  if (input.marginType === "PERCENTAGE" && input.direction === "BUY" && marginDecimal.greaterThanOrEqualTo(100)) {
    throw new Error("Percentage BUY margin must be less than 100%");
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

    // 2. Prevent duplicate rule at exact millisecond
    const exactMatch = await tx.marginRule.findFirst({
      where: {
        metalId: metal.id,
        purityId: purity.id,
        direction: input.direction as QuoteDirection,
        effectiveFrom: effectiveFrom,
      },
    });
    if (exactMatch) {
      throw new Error(
        `A margin rule for ${metal.code} ${purity.label} (${input.direction}) at this exact effective time already exists.`,
      );
    }

    // 3. Find if there is a future scheduled rule after effectiveFrom
    const nextFutureRule = await tx.marginRule.findFirst({
      where: {
        metalId: metal.id,
        purityId: purity.id,
        direction: input.direction as QuoteDirection,
        effectiveFrom: { gt: effectiveFrom },
      },
      orderBy: { effectiveFrom: "asc" },
    });

    let effectiveTo: Date | null = null;
    if (input.effectiveTo) {
      effectiveTo = new Date(input.effectiveTo);
    } else if (nextFutureRule) {
      effectiveTo = nextFutureRule.effectiveFrom;
    }

    // 4. Update preceding active rules to end at this new effectiveFrom
    await tx.marginRule.updateMany({
      where: {
        metalId: metal.id,
        purityId: purity.id,
        direction: input.direction as QuoteDirection,
        effectiveFrom: { lt: effectiveFrom },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
      },
      data: {
        effectiveTo: effectiveFrom,
      },
    });

    // 5. Create new MarginRule record
    const newRule = await tx.marginRule.create({
      data: {
        metalId: metal.id,
        purityId: purity.id,
        direction: input.direction as QuoteDirection,
        marginType: input.marginType as MarginType,
        marginValue: marginDecimal,
        isActive: true,
        effectiveFrom: effectiveFrom,
        effectiveTo: effectiveTo,
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
      entityType: "MarginRule",
      entityId: newRule.id,
      actorId: userId,
      metalId: metal.id,
      purityId: purity.id,
      marginRuleId: newRule.id,
      description: `MARGIN_RULE_CREATED: ${metal.name} ${purity.label} ${input.direction} margin ${marginDecimal.toString()}${input.marginType === "PERCENTAGE" ? "%" : "/g"} effective from ${effectiveFrom.toISOString()}`,
      nextState: {
        id: newRule.id,
        metal: metal.code,
        purity: purity.label,
        direction: newRule.direction,
        marginType: newRule.marginType,
        marginValue: marginDecimal.toString(),
        effectiveFrom: effectiveFrom.toISOString(),
        effectiveTo: effectiveTo ? effectiveTo.toISOString() : null,
      },
    });

    return newRule;
  });
}

/**
 * Returns the currently applicable active Margin Rule for a (metal, purity, direction, asOf).
 * Returns null if no active rule exists.
 */
export async function getApplicableMarginRule(
  metalId: string,
  purityId: string,
  direction: QuoteDirection,
  asOf: Date = new Date(),
) {
  return await prisma.marginRule.findFirst({
    where: {
      metalId,
      purityId,
      direction,
      isActive: true,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
    },
    orderBy: { effectiveFrom: "desc" },
    include: {
      metal: true,
      purity: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Returns historical margin rules matching filters, newest first.
 */
export async function getMarginRulesHistory(filters: GetMarginRulesFilterInput = {}) {
  const where: Record<string, unknown> = {};

  if (filters.metalId && filters.metalId !== "ALL") {
    where.metalId = filters.metalId;
  }
  if (filters.purityId && filters.purityId !== "ALL") {
    where.purityId = filters.purityId;
  }
  if (filters.direction && filters.direction !== "ALL") {
    where.direction = filters.direction;
  }
  if (typeof filters.isActive === "boolean") {
    where.isActive = filters.isActive;
  }
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    where.OR = [
      { notes: { contains: s, mode: "insensitive" } },
      { metal: { name: { contains: s, mode: "insensitive" } } },
      { purity: { label: { contains: s, mode: "insensitive" } } },
    ];
  }

  const rules = await prisma.marginRule.findMany({
    where,
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    include: {
      metal: true,
      purity: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return rules.map((r) => ({
    id: r.id,
    metalId: r.metalId,
    metalName: r.metal.name,
    metalCode: r.metal.code,
    purityId: r.purityId,
    purityLabel: r.purity.label,
    direction: r.direction,
    marginType: r.marginType,
    marginValue: new Decimal(r.marginValue.toString()),
    isActive: r.isActive,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    notes: r.notes,
    createdById: r.createdById,
    createdByName: r.createdBy.name,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Toggle Active status for a Margin Rule.
 */
export async function toggleMarginRuleActive(
  ruleId: string,
  isActive: boolean,
  userId: string,
) {
  return await prisma.$transaction(async (tx) => {
    const rule = await tx.marginRule.findUniqueOrThrow({
      where: { id: ruleId },
      include: { metal: true, purity: true },
    });

    const updated = await tx.marginRule.update({
      where: { id: ruleId },
      data: { isActive },
      include: { metal: true, purity: true, createdBy: true },
    });

    await writeAudit(tx, {
      action: isActive ? "ACTIVATE" : "DEACTIVATE",
      entityType: "MarginRule",
      entityId: rule.id,
      actorId: userId,
      metalId: rule.metalId,
      purityId: rule.purityId,
      marginRuleId: rule.id,
      description: `MARGIN_RULE_${isActive ? "ACTIVATED" : "DEACTIVATED"}: ${rule.metal.name} ${rule.purity.label} ${rule.direction}`,
      prevState: { isActive: rule.isActive },
      nextState: { isActive: updated.isActive },
    });

    return updated;
  });
}
