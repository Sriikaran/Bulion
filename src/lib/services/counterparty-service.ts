/**
 * CounterpartyService — B2
 *
 * Manages Suppliers, Customers, and Both (dual-role counterparties).
 * Enforces:
 *   - ADMIN can create, update, activate/deactivate
 *   - STAFF can read/list
 *   - Soft-deactivation (never destructive delete)
 *   - Full audit logging
 */

import { prisma } from "@/lib/db/client";
import { writeAudit } from "./audit-service";
import { UnauthorizedError } from "./stock-service";
import type { Role, CounterpartyType } from "@prisma/client";

export interface CreateCounterpartyInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  type: CounterpartyType;
  notes?: string | null;
}

export interface UpdateCounterpartyInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  type?: CounterpartyType;
  notes?: string | null;
}

export async function getCounterparty(id: string) {
  return prisma.counterparty.findUniqueOrThrow({
    where: { id },
    include: {
      _count: {
        select: {
          purchases: true,
          sales: true,
        },
      },
    },
  });
}

export async function listCounterparties(filters?: {
  type?: CounterpartyType;
  isActive?: boolean;
  search?: string;
}) {
  const where: import("@prisma/client").Prisma.CounterpartyWhereInput = {};

  if (filters?.type) {
    where.type = filters.type;
  }

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters?.search) {
    const s = filters.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { phone: { contains: s, mode: "insensitive" } },
      { email: { contains: s, mode: "insensitive" } },
    ];
  }

  return prisma.counterparty.findMany({
    where,
    include: {
      _count: {
        select: {
          purchases: true,
          sales: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function createCounterparty(
  actorId: string,
  actorRole: Role,
  input: CreateCounterpartyInput,
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("create counterparty");
  }

  const name = input.name.trim();
  if (!name) throw new Error("Counterparty name is required.");

  return prisma.$transaction(async (tx) => {
    const counterparty = await tx.counterparty.create({
      data: {
        name,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        type: input.type,
        notes: input.notes?.trim() || null,
      },
    });

    await writeAudit(tx, {
      action: "CREATE",
      entityType: "Counterparty",
      entityId: counterparty.id,
      actorId,
      nextState: {
        name: counterparty.name,
        type: counterparty.type,
      },
      description: `Created counterparty ${counterparty.name} (${counterparty.type})`,
    });

    return counterparty;
  });
}

export async function updateCounterparty(
  actorId: string,
  actorRole: Role,
  id: string,
  input: UpdateCounterpartyInput,
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("update counterparty");
  }

  return prisma.$transaction(async (tx) => {
    const prev = await tx.counterparty.findUniqueOrThrow({ where: { id } });

    const updated = await tx.counterparty.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
        ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
        ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      },
    });

    await writeAudit(tx, {
      action: "UPDATE",
      entityType: "Counterparty",
      entityId: id,
      actorId,
      prevState: { name: prev.name, type: prev.type },
      nextState: { name: updated.name, type: updated.type },
      description: `Updated counterparty ${prev.name}`,
    });

    return updated;
  });
}

export async function setCounterpartyActive(
  actorId: string,
  actorRole: Role,
  id: string,
  isActive: boolean,
) {
  if (actorRole !== "ADMIN") {
    throw new UnauthorizedError("activate/deactivate counterparty");
  }

  return prisma.$transaction(async (tx) => {
    const prev = await tx.counterparty.findUniqueOrThrow({ where: { id } });

    const updated = await tx.counterparty.update({
      where: { id },
      data: { isActive },
    });

    await writeAudit(tx, {
      action: isActive ? "ACTIVATE" : "DEACTIVATE",
      entityType: "Counterparty",
      entityId: id,
      actorId,
      prevState: { isActive: prev.isActive },
      nextState: { isActive },
      description: `Counterparty ${prev.name} ${isActive ? "activated" : "deactivated"}`,
    });

    return updated;
  });
}
