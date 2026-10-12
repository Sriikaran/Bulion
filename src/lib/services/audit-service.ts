/**
 * AuditService — B1
 *
 * Writes to the immutable AuditLog table.
 * NEVER call this outside a service method — always pass the tx client.
 */

import type { Prisma } from "@prisma/client";
import type { AuditAction } from "@prisma/client";

export async function writeAudit(
  tx: Prisma.TransactionClient,
  opts: {
    action: AuditAction;
    entityType: string;
    entityId: string;
    actorId: string;
    prevState?: Record<string, unknown> | null;
    nextState?: Record<string, unknown> | null;
    description?: string;
    metalId?: string;
    purityId?: string;
    purchaseId?: string;
    saleId?: string;
    adjustmentId?: string;
    paymentId?: string;
    fulfilmentId?: string;
    reservationId?: string;
    marketRateId?: string;
    marginRuleId?: string;
    quoteId?: string;
  },
) {
  await tx.auditLog.create({
    data: {
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      actorId: opts.actorId,
      prevState: opts.prevState ? (opts.prevState as Prisma.InputJsonValue) : undefined,
      nextState: opts.nextState ? (opts.nextState as Prisma.InputJsonValue) : undefined,
      description: opts.description,
      metalId: opts.metalId,
      purityId: opts.purityId,
      purchaseId: opts.purchaseId,
      saleId: opts.saleId,
      adjustmentId: opts.adjustmentId,
      paymentId: opts.paymentId,
      fulfilmentId: opts.fulfilmentId,
      reservationId: opts.reservationId,
      marketRateId: opts.marketRateId,
      marginRuleId: opts.marginRuleId,
      quoteId: opts.quoteId,
    },
  });
}
