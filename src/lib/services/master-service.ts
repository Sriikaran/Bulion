/**
 * MasterService — B1
 *
 * Manages Metal and Purity master data.
 * Enforces:
 *   - No duplicate codes/names
 *   - No deletion of entities with transaction history
 *   - Inactive entities cannot be used for new transactions
 */

import { prisma } from "@/lib/db/client";
import { writeAudit } from "./audit-service";
import { InactiveEntityError, UnauthorizedError } from "./stock-service";
import type { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Metal
// ---------------------------------------------------------------------------

export async function getMetal(id: string) {
  return prisma.metal.findUniqueOrThrow({ where: { id } });
}

export async function getAllMetals(activeOnly = false) {
  return prisma.metal.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    include: { purities: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });
}

/**
 * Validate that a metal is active; throw InactiveEntityError if not.
 * Must be called inside a transaction for atomicity.
 */
export async function assertMetalActive(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  metalId: string,
) {
  const metal = await tx.metal.findUniqueOrThrow({ where: { id: metalId } });
  if (!metal.isActive) throw new InactiveEntityError("Metal", metalId);
  return metal;
}

/**
 * Validate that a purity is active and belongs to the expected metal.
 */
export async function assertPurityActive(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  purityId: string,
  metalId: string,
) {
  const purity = await tx.purity.findUniqueOrThrow({ where: { id: purityId } });
  if (purity.metalId !== metalId) {
    throw new Error(`Purity ${purityId} does not belong to metal ${metalId}.`);
  }
  if (!purity.isActive) throw new InactiveEntityError("Purity", purityId);
  return purity;
}

/**
 * Activate or deactivate a metal. ADMIN only.
 */
export async function setMetalActive(
  actorId: string,
  actorRole: Role,
  metalId: string,
  isActive: boolean,
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("manage metal master");
  }
  return prisma.$transaction(async (tx) => {
    const prev = await tx.metal.findUniqueOrThrow({ where: { id: metalId } });
    const updated = await tx.metal.update({
      where: { id: metalId },
      data: { isActive },
    });
    await writeAudit(tx, {
      action: isActive ? "ACTIVATE" : "DEACTIVATE",
      entityType: "Metal",
      entityId: metalId,
      actorId,
      metalId,
      prevState: { isActive: prev.isActive },
      nextState: { isActive },
      description: `Metal ${prev.name} ${isActive ? "activated" : "deactivated"}.`,
    });
    return updated;
  });
}

/**
 * Activate or deactivate a purity. ADMIN only.
 */
export async function setPurityActive(
  actorId: string,
  actorRole: Role,
  purityId: string,
  isActive: boolean,
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("manage purity master");
  }
  return prisma.$transaction(async (tx) => {
    const prev = await tx.purity.findUniqueOrThrow({ where: { id: purityId } });
    const updated = await tx.purity.update({
      where: { id: purityId },
      data: { isActive },
    });
    await writeAudit(tx, {
      action: isActive ? "ACTIVATE" : "DEACTIVATE",
      entityType: "Purity",
      entityId: purityId,
      actorId,
      purityId,
      prevState: { isActive: prev.isActive },
      nextState: { isActive },
      description: `Purity ${prev.label} ${isActive ? "activated" : "deactivated"}.`,
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

export async function getPuritiesByMetal(metalId: string, activeOnly = false) {
  return prisma.purity.findMany({
    where: { metalId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getAllPurities(activeOnly = false) {
  return prisma.purity.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    include: { metal: true },
    orderBy: [{ metal: { name: "asc" } }, { sortOrder: "asc" }],
  });
}

export async function createMetal(
  actorId: string,
  actorRole: Role,
  data: {
    code: string;
    name: string;
    type: "GOLD" | "SILVER";
  },
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("create metal");
  }

  const code = data.code.trim().toUpperCase();
  const name = data.name.trim();

  return prisma.$transaction(async (tx) => {
    const metal = await tx.metal.create({
      data: {
        code,
        name,
        type: data.type,
      },
    });

    await writeAudit(tx, {
      action: "CREATE",
      entityType: "Metal",
      entityId: metal.id,
      actorId,
      metalId: metal.id,
      nextState: { code, name, type: data.type },
      description: `Created metal: ${name} (${code})`,
    });

    return metal;
  });
}

export async function updateMetal(
  actorId: string,
  actorRole: Role,
  metalId: string,
  data: {
    name?: string;
  },
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("update metal");
  }

  return prisma.$transaction(async (tx) => {
    const prev = await tx.metal.findUniqueOrThrow({ where: { id: metalId } });
    const updated = await tx.metal.update({
      where: { id: metalId },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
      },
    });

    await writeAudit(tx, {
      action: "UPDATE",
      entityType: "Metal",
      entityId: metalId,
      actorId,
      metalId,
      prevState: { name: prev.name },
      nextState: { name: updated.name },
      description: `Updated metal ${prev.name}`,
    });

    return updated;
  });
}

export async function createPurity(
  actorId: string,
  actorRole: Role,
  data: {
    metalId: string;
    label: string;
    fineness: string | number;
    displayInfo?: string;
    sortOrder?: number;
  },
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("create purity");
  }

  const finenessDecimal = new (await import("decimal.js")).default(data.fineness);
  if (finenessDecimal.lessThanOrEqualTo(0) || finenessDecimal.greaterThan(1)) {
    throw new Error("Fineness must be greater than 0 and less than or equal to 1.0000");
  }

  return prisma.$transaction(async (tx) => {
    await assertMetalActive(tx, data.metalId);

    const purity = await tx.purity.create({
      data: {
        metalId: data.metalId,
        label: data.label.trim(),
        fineness: finenessDecimal,
        displayInfo: data.displayInfo?.trim() || null,
        sortOrder: data.sortOrder ?? 0,
      },
    });

    await writeAudit(tx, {
      action: "CREATE",
      entityType: "Purity",
      entityId: purity.id,
      actorId,
      metalId: data.metalId,
      purityId: purity.id,
      nextState: { label: purity.label, fineness: finenessDecimal.toString() },
      description: `Created purity: ${purity.label} for metalId ${data.metalId}`,
    });

    return purity;
  });
}

export async function updatePurity(
  actorId: string,
  actorRole: Role,
  purityId: string,
  data: {
    label?: string;
    fineness?: string | number;
    displayInfo?: string;
    sortOrder?: number;
  },
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("update purity");
  }

  return prisma.$transaction(async (tx) => {
    const prev = await tx.purity.findUniqueOrThrow({ where: { id: purityId } });
    const updateData: Record<string, unknown> = {};

    if (data.label) updateData.label = data.label.trim();
    if (data.displayInfo !== undefined) updateData.displayInfo = data.displayInfo.trim() || null;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.fineness !== undefined) {
      const f = new (await import("decimal.js")).default(data.fineness);
      if (f.lessThanOrEqualTo(0) || f.greaterThan(1)) {
        throw new Error("Fineness must be between 0 and 1.0000");
      }
      updateData.fineness = f;
    }

    const updated = await tx.purity.update({
      where: { id: purityId },
      data: updateData,
    });

    await writeAudit(tx, {
      action: "UPDATE",
      entityType: "Purity",
      entityId: purityId,
      actorId,
      purityId,
      prevState: { label: prev.label, fineness: prev.fineness.toString() },
      nextState: { label: updated.label, fineness: updated.fineness.toString() },
      description: `Updated purity ${prev.label}`,
    });

    return updated;
  });
}
