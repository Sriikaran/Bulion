import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import type { QuoteDirection, QuoteStatus, ReservationType } from "@prisma/client";
import { getCurrentMarketRate } from "./market-rate-service";
import { getApplicableMarginRule } from "./margin-service";
import { writeAudit } from "./audit-service";
import type {
  CalculateQuoteInput,
  CreateQuoteInput,
  ConsumeQuoteInput,
  CancelQuoteInput,
  GetQuotesFilterInput,
} from "@/lib/validations/quote";

// ---------------------------------------------------------------------------
// Quote Calculation & Management Engine (V3.5)
// ---------------------------------------------------------------------------

export interface QuoteCalculationResult {
  metalId: string;
  metalName: string;
  metalCode: string;
  purityId: string;
  purityLabel: string;
  direction: QuoteDirection;
  weightGrams: Decimal;
  marketRateId: string;
  referenceRatePerGram: Decimal;
  marketRateEffectiveFrom: Date;
  marginRuleId: string;
  marginType: "PERCENTAGE" | "FIXED_PER_GRAM";
  marginValue: Decimal;
  marginPerGram: Decimal;
  quotedRatePerGram: Decimal;
  quotedAmount: Decimal;
  calculatedAt: Date;
}

/**
 * Calculates a commercial quote based on active Market Reference Rate and Margin Rule.
 * Does not mutate any records.
 */
export async function calculateQuote(
  input: CalculateQuoteInput,
  asOf: Date = new Date(),
): Promise<QuoteCalculationResult> {
  const weight = new Decimal(input.weightGrams);
  if (weight.lessThanOrEqualTo(0)) {
    throw new Error("Weight in grams must be strictly positive");
  }

  // 1. Fetch current Market Reference Rate
  const marketRate = await getCurrentMarketRate(input.metalId, input.purityId, asOf);
  if (!marketRate) {
    throw new Error("No market reference rate available for this metal and purity.");
  }

  // 2. Fetch applicable active Margin Rule
  const marginRule = await getApplicableMarginRule(
    input.metalId,
    input.purityId,
    input.direction as QuoteDirection,
    asOf,
  );
  if (!marginRule) {
    throw new Error(
      `No applicable margin rule configured for ${input.direction} on this metal and purity.`,
    );
  }

  const referenceRate = new Decimal(marketRate.ratePerGram.toString());
  const marginVal = new Decimal(marginRule.marginValue.toString());

  // 3. Calculate margin per gram
  let marginPerGram: Decimal;
  if (marginRule.marginType === "PERCENTAGE") {
    marginPerGram = referenceRate.times(marginVal).dividedBy(100);
  } else {
    marginPerGram = marginVal;
  }

  // 4. Calculate quoted rate per gram
  // BUY: reference - margin
  // SELL: reference + margin
  let quotedRate: Decimal;
  if (input.direction === "BUY") {
    quotedRate = referenceRate.minus(marginPerGram);
  } else {
    quotedRate = referenceRate.plus(marginPerGram);
  }

  if (quotedRate.lessThanOrEqualTo(0)) {
    throw new Error("Calculated quoted rate must be strictly positive.");
  }

  // Round to 2 decimal places using Bullion standard ROUND_HALF_UP
  const roundedQuotedRate = quotedRate.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const roundedQuotedAmount = weight.times(roundedQuotedRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    metalId: marketRate.metal.id,
    metalName: marketRate.metal.name,
    metalCode: marketRate.metal.code,
    purityId: marketRate.purity.id,
    purityLabel: marketRate.purity.label,
    direction: input.direction as QuoteDirection,
    weightGrams: weight,
    marketRateId: marketRate.id,
    referenceRatePerGram: referenceRate,
    marketRateEffectiveFrom: marketRate.effectiveFrom,
    marginRuleId: marginRule.id,
    marginType: marginRule.marginType,
    marginValue: marginVal,
    marginPerGram: marginPerGram.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
    quotedRatePerGram: roundedQuotedRate,
    quotedAmount: roundedQuotedAmount,
    calculatedAt: asOf,
  };
}

/**
 * Creates and persists a formal Quote record.
 * Snapshots all inputs and calculation outputs permanently.
 */
export async function createQuote(
  input: CreateQuoteInput,
  userId: string,
) {
  const calculation = await calculateQuote({
    metalId: input.metalId,
    purityId: input.purityId,
    direction: input.direction,
    weightGrams: input.weightGrams,
  });

  let validUntil: Date;
  if (input.validUntil) {
    validUntil = new Date(input.validUntil);
  } else {
    const minutes = input.validUntilMinutes || 30;
    validUntil = new Date(Date.now() + minutes * 60 * 1000);
  }

  if (validUntil.getTime() <= Date.now()) {
    throw new Error("Quote validity period must be in the future");
  }

  const quoteNumber = `QTE-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  return await prisma.$transaction(async (tx) => {
    const newQuote = await tx.quote.create({
      data: {
        quoteNumber,
        direction: calculation.direction,
        metalId: calculation.metalId,
        purityId: calculation.purityId,
        unit: "GRAM",
        weightGrams: calculation.weightGrams,
        marketRateId: calculation.marketRateId,
        referenceRatePerGram: calculation.referenceRatePerGram,
        marketRateEffectiveFrom: calculation.marketRateEffectiveFrom,
        marginRuleId: calculation.marginRuleId,
        marginType: calculation.marginType,
        marginValue: calculation.marginValue,
        marginPerGram: calculation.marginPerGram,
        quotedRatePerGram: calculation.quotedRatePerGram,
        quotedAmount: calculation.quotedAmount,
        status: "ACTIVE",
        validUntil,
        notes: input.notes?.trim() || null,
        createdById: userId,
      },
      include: {
        metal: true,
        purity: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await writeAudit(tx, {
      action: "CREATE",
      entityType: "Quote",
      entityId: newQuote.id,
      actorId: userId,
      metalId: calculation.metalId,
      purityId: calculation.purityId,
      quoteId: newQuote.id,
      marginRuleId: calculation.marginRuleId,
      marketRateId: calculation.marketRateId,
      description: `QUOTE_CREATED: ${quoteNumber} (${calculation.direction}) for ${calculation.metalName} ${calculation.purityLabel} ${calculation.weightGrams.toFixed(4)}g @ ₹${calculation.quotedRatePerGram.toFixed(2)}/g (Total: ₹${calculation.quotedAmount.toFixed(2)}) valid until ${validUntil.toISOString()}`,
      nextState: {
        quoteNumber,
        direction: calculation.direction,
        metal: calculation.metalCode,
        purity: calculation.purityLabel,
        weightGrams: calculation.weightGrams.toString(),
        referenceRate: calculation.referenceRatePerGram.toString(),
        marginType: calculation.marginType,
        marginValue: calculation.marginValue.toString(),
        quotedRate: calculation.quotedRatePerGram.toString(),
        quotedAmount: calculation.quotedAmount.toString(),
        validUntil: validUntil.toISOString(),
      },
    });

    return newQuote;
  });
}

/**
 * Retrieves a Quote by ID, automatically evaluating lazy expiration.
 */
export async function getQuoteById(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      metal: true,
      purity: true,
      marketRate: true,
      marginRule: true,
      createdBy: { select: { id: true, name: true, email: true } },
      consumedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      rateReservation: true,
    },
  });

  if (!quote) return null;

  // Lazy expiration check
  if (quote.status === "ACTIVE" && quote.validUntil.getTime() <= Date.now()) {
    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: { status: "EXPIRED" },
      include: {
        metal: true,
        purity: true,
        marketRate: true,
        marginRule: true,
        createdBy: { select: { id: true, name: true, email: true } },
        consumedBy: { select: { id: true, name: true, email: true } },
        cancelledBy: { select: { id: true, name: true, email: true } },
        rateReservation: true,
      },
    });
    return updated;
  }

  return quote;
}

/**
 * Consumes an ACTIVE Quote into a RateReservation downstream.
 * Fully atomic with row lock.
 */
export async function consumeQuote(
  input: ConsumeQuoteInput,
  userId: string,
) {
  return await prisma.$transaction(async (tx) => {
    // 1. Lock Quote row
    try {
      if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
        await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `SELECT id FROM "quote" WHERE id = $1 FOR UPDATE`,
          input.quoteId,
        );
      }
    } catch {
      // Fallback
    }

    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: input.quoteId },
      include: { metal: true, purity: true },
    });

    // 2. Validate status and expiration
    if (quote.status === "CONSUMED") {
      throw new Error(`Quote ${quote.quoteNumber} has already been consumed.`);
    }
    if (quote.status === "CANCELLED") {
      throw new Error(`Cannot consume CANCELLED quote ${quote.quoteNumber}.`);
    }
    if (quote.status === "EXPIRED" || quote.validUntil.getTime() <= Date.now()) {
      if (quote.status === "ACTIVE") {
        await tx.quote.update({
          where: { id: quote.id },
          data: { status: "EXPIRED" },
        });
      }
      throw new Error(`Cannot consume EXPIRED quote ${quote.quoteNumber}.`);
    }
    if (quote.status !== "ACTIVE") {
      throw new Error(`Only ACTIVE quotes can be consumed.`);
    }

    // 3. Create downstream RateReservation using quote's quoted rate
    const resType: ReservationType = quote.direction === "BUY" ? "PURCHASE" : "SALE";
    const reservationNumber = `RES-${resType === "PURCHASE" ? "PUR" : "SAL"}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // If deal IDs provided, validate UNFIXED status
    let purchaseId: string | null = null;
    let saleId: string | null = null;

    if (resType === "PURCHASE" && input.purchaseId) {
      const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: input.purchaseId } });
      if (purchase.status === "CANCELLED" || purchase.rateStatus === "FIXED") {
        throw new Error(`Purchase ${purchase.invoiceNumber} is not eligible for rate reservation.`);
      }
      purchaseId = purchase.id;
    } else if (resType === "SALE" && input.saleId) {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: input.saleId } });
      if (sale.status === "CANCELLED" || sale.rateStatus === "FIXED") {
        throw new Error(`Sale ${sale.invoiceNumber} is not eligible for rate reservation.`);
      }
      saleId = sale.id;
    }

    const reservation = await tx.rateReservation.create({
      data: {
        reservationNumber,
        type: resType,
        status: "ACTIVE",
        metalId: quote.metalId,
        purityId: quote.purityId,
        weightGrams: quote.weightGrams,
        reservedRatePerGram: quote.quotedRatePerGram,
        reservedAmount: quote.quotedAmount,
        expiresAt: quote.validUntil,
        notes: input.notes?.trim() || `Generated from Quote ${quote.quoteNumber}`,
        createdById: userId,
        purchaseId,
        saleId,
      },
    });

    // 4. Mark Quote as CONSUMED and link RateReservation
    const consumedQuote = await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: "CONSUMED",
        consumedById: userId,
        consumedAt: new Date(),
        rateReservationId: reservation.id,
      },
      include: {
        metal: true,
        purity: true,
        rateReservation: true,
      },
    });

    // 5. Audit trail
    await writeAudit(tx, {
      action: "UPDATE",
      entityType: "Quote",
      entityId: quote.id,
      actorId: userId,
      metalId: quote.metalId,
      purityId: quote.purityId,
      quoteId: quote.id,
      reservationId: reservation.id,
      description: `QUOTE_CONSUMED: Quote ${quote.quoteNumber} consumed into RateReservation ${reservation.reservationNumber} @ ₹${quote.quotedRatePerGram}/g`,
      prevState: { status: "ACTIVE" },
      nextState: { status: "CONSUMED", rateReservationId: reservation.id },
    });

    return {
      quote: consumedQuote,
      reservation,
    };
  });
}

/**
 * Converts an ACTIVE Quote directly into a commercial Purchase or Sale deal.
 * - Preserves the exact quoted rate, snapshots, and timestamps.
 * - Enforces Available-to-Sell checks for SELL quotes.
 * - Atomic with row-level locking.
 * - Does NOT create physical StockMovement or Payment.
 */
export async function convertQuoteToDeal(
  input: {
    quoteId: string;
    counterpartyId: string;
    invoiceNumber?: string | null;
    partyName?: string | null;
    partyContact?: string | null;
    notes?: string | null;
  },
  userId: string,
) {
  return await prisma.$transaction(async (tx) => {
    // 1. Lock Quote row to prevent double consumption / conversion
    try {
      if (typeof (tx as unknown as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function") {
        await (tx as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `SELECT id FROM "quote" WHERE id = $1 FOR UPDATE`,
          input.quoteId,
        );
      }
    } catch {
      // Fallback
    }

    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: input.quoteId },
      include: { metal: true, purity: true },
    });

    // 2. Validate status and expiration
    if (quote.status === "CONSUMED") {
      throw new Error(`Quote ${quote.quoteNumber} has already been consumed.`);
    }
    if (quote.status === "CANCELLED") {
      throw new Error(`Cannot convert CANCELLED quote ${quote.quoteNumber}.`);
    }
    if (quote.status === "EXPIRED" || quote.validUntil.getTime() <= Date.now()) {
      if (quote.status === "ACTIVE") {
        await tx.quote.update({
          where: { id: quote.id },
          data: { status: "EXPIRED" },
        });
      }
      throw new Error(`Cannot convert EXPIRED quote ${quote.quoteNumber}.`);
    }
    if (quote.status !== "ACTIVE") {
      throw new Error(`Only ACTIVE quotes can be converted into a deal.`);
    }

    // 3. Counterparty validation
    const cp = await tx.counterparty.findUniqueOrThrow({
      where: { id: input.counterpartyId },
    });
    if (!cp.isActive) {
      throw new Error(`Counterparty ${cp.name} is inactive and cannot be used.`);
    }

    const now = new Date();
    const weight = new Decimal(quote.weightGrams.toString());
    const rate = new Decimal(quote.quotedRatePerGram.toString());
    const totalAmount = new Decimal(quote.quotedAmount.toString());

    let purchase = null;
    let sale = null;

    if (quote.direction === "BUY") {
      // BUY Quote -> We buy from Counterparty (Supplier) -> Commercial PURCHASE
      const invNum =
        input.invoiceNumber?.trim() ||
        `PUR-Q-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

      purchase = await tx.purchase.create({
        data: {
          invoiceNumber: invNum,
          date: now,
          supplierName: input.partyName?.trim() || cp.name,
          supplierContact: input.partyContact?.trim() || cp.phone || undefined,
          counterpartyId: cp.id,
          metalId: quote.metalId,
          purityId: quote.purityId,
          weightGrams: weight,
          ratePerGram: rate,
          totalAmount,
          rateStatus: "FIXED",
          rateFixedAt: now,
          rateFixedById: userId,
          paymentMode: "BANK_TRANSFER",
          status: "POSTED",
          fulfilmentStatus: "PENDING",
          paymentStatus: "UNPAID",
          createdById: userId,
          quoteId: quote.id,
          notes: input.notes?.trim() || `Created from Quote ${quote.quoteNumber}`,
        },
      });

      // Audit purchase creation from quote
      await writeAudit(tx, {
        action: "CREATE",
        entityType: "Purchase",
        entityId: purchase.id,
        actorId: userId,
        purchaseId: purchase.id,
        metalId: purchase.metalId,
        purityId: purchase.purityId,
        quoteId: quote.id,
        nextState: {
          status: "POSTED",
          invoiceNumber: purchase.invoiceNumber,
          quoteId: quote.id,
          rateStatus: "FIXED",
          ratePerGram: rate.toString(),
          totalAmount: totalAmount.toString(),
        },
        description: `PURCHASE_CREATED_FROM_QUOTE: Created purchase ${purchase.invoiceNumber} from quote ${quote.quoteNumber} @ ₹${rate.toFixed(4)}/g`,
      });
    } else {
      // SELL Quote -> We sell to Counterparty (Buyer) -> Commercial SALE
      // Enforce Available-to-Sell stock check
      const { assertSufficientAvailableStock } = await import("./stock-service");
      await assertSufficientAvailableStock(tx, quote.metalId, quote.purityId, weight);

      const invNum =
        input.invoiceNumber?.trim() ||
        `SAL-Q-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

      sale = await tx.sale.create({
        data: {
          invoiceNumber: invNum,
          date: now,
          buyerName: input.partyName?.trim() || cp.name,
          buyerContact: input.partyContact?.trim() || cp.phone || undefined,
          counterpartyId: cp.id,
          metalId: quote.metalId,
          purityId: quote.purityId,
          weightGrams: weight,
          ratePerGram: rate,
          totalAmount,
          rateStatus: "FIXED",
          rateFixedAt: now,
          rateFixedById: userId,
          paymentMode: "BANK_TRANSFER",
          status: "POSTED",
          fulfilmentStatus: "PENDING",
          paymentStatus: "UNPAID",
          createdById: userId,
          quoteId: quote.id,
          notes: input.notes?.trim() || `Created from Quote ${quote.quoteNumber}`,
        },
      });

      // Audit sale creation from quote
      await writeAudit(tx, {
        action: "CREATE",
        entityType: "Sale",
        entityId: sale.id,
        actorId: userId,
        saleId: sale.id,
        metalId: sale.metalId,
        purityId: sale.purityId,
        quoteId: quote.id,
        nextState: {
          status: "POSTED",
          invoiceNumber: sale.invoiceNumber,
          quoteId: quote.id,
          rateStatus: "FIXED",
          ratePerGram: rate.toString(),
          totalAmount: totalAmount.toString(),
        },
        description: `SALE_CREATED_FROM_QUOTE: Created sale ${sale.invoiceNumber} from quote ${quote.quoteNumber} @ ₹${rate.toFixed(4)}/g`,
      });
    }

    // 4. Mark Quote as CONSUMED
    const consumedQuote = await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: "CONSUMED",
        consumedById: userId,
        consumedAt: now,
      },
      include: {
        metal: true,
        purity: true,
        purchase: true,
        sale: true,
      },
    });

    // 5. Audit Quote consumption into deal
    await writeAudit(tx, {
      action: "UPDATE",
      entityType: "Quote",
      entityId: quote.id,
      actorId: userId,
      metalId: quote.metalId,
      purityId: quote.purityId,
      quoteId: quote.id,
      purchaseId: purchase?.id,
      saleId: sale?.id,
      description: `QUOTE_CONVERTED_TO_DEAL: Quote ${quote.quoteNumber} converted to ${purchase ? `Purchase ${purchase.invoiceNumber}` : `Sale ${sale?.invoiceNumber}`} @ ₹${quote.quotedRatePerGram}/g`,
      prevState: { status: "ACTIVE" },
      nextState: {
        status: "CONSUMED",
        dealType: purchase ? "PURCHASE" : "SALE",
        dealId: purchase?.id || sale?.id,
      },
    });

    return {
      quote: consumedQuote,
      purchase,
      sale,
    };
  });
}

/**
 * Cancels an ACTIVE Quote.
 */
export async function cancelQuote(
  input: CancelQuoteInput,
  userId: string,
) {
  return await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: input.quoteId },
      include: { metal: true, purity: true },
    });

    if (quote.status !== "ACTIVE") {
      throw new Error(`Only ACTIVE quotes can be cancelled. Current status: ${quote.status}`);
    }

    const cancelled = await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: "CANCELLED",
        cancelledById: userId,
        cancelledAt: new Date(),
        notes: input.reason ? `${quote.notes ? quote.notes + " | " : ""}Cancelled: ${input.reason}` : quote.notes,
      },
      include: {
        metal: true,
        purity: true,
        createdBy: true,
      },
    });

    await writeAudit(tx, {
      action: "CANCEL",
      entityType: "Quote",
      entityId: quote.id,
      actorId: userId,
      metalId: quote.metalId,
      purityId: quote.purityId,
      quoteId: quote.id,
      description: `QUOTE_CANCELLED: Quote ${quote.quoteNumber} cancelled${input.reason ? ` - ${input.reason}` : ""}`,
      prevState: { status: "ACTIVE" },
      nextState: { status: "CANCELLED" },
    });

    return cancelled;
  });
}

/**
 * Report queries and KPI summary for Quotes.
 */
export async function getQuotesReport(filters: GetQuotesFilterInput = {}) {
  const where: Record<string, unknown> = {};

  if (filters.fromDate || filters.dateFrom) {
    const d = filters.fromDate || new Date(filters.dateFrom!);
    where.createdAt = { ...(where.createdAt as Record<string, unknown> || {}), gte: d };
  }
  if (filters.toDate || filters.dateTo) {
    const d = filters.toDate || new Date(filters.dateTo!);
    where.createdAt = { ...(where.createdAt as Record<string, unknown> || {}), lte: d };
  }
  if (filters.quoteNumber?.trim()) {
    where.quoteNumber = { contains: filters.quoteNumber.trim(), mode: "insensitive" };
  }
  if (filters.direction && filters.direction !== "ALL") {
    where.direction = filters.direction;
  }
  if (filters.metalId && filters.metalId !== "ALL") {
    where.metalId = filters.metalId;
  }
  if (filters.purityId && filters.purityId !== "ALL") {
    where.purityId = filters.purityId;
  }
  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    where.OR = [
      { quoteNumber: { contains: s, mode: "insensitive" } },
      { metal: { name: { contains: s, mode: "insensitive" } } },
      { purity: { label: { contains: s, mode: "insensitive" } } },
      { notes: { contains: s, mode: "insensitive" } },
    ];
  }

  const quotes = await prisma.quote.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      metal: true,
      purity: true,
      createdBy: { select: { id: true, name: true, email: true } },
      rateReservation: { select: { reservationNumber: true } },
    },
  });

  const now = Date.now();
  let totalQuotedWeightGrams = new Decimal(0);
  let totalQuotedAmount = new Decimal(0);
  let activeCount = 0;
  let consumedCount = 0;
  let expiredCount = 0;
  let cancelledCount = 0;

  const rows = quotes.map((q) => {
    let effectiveStatus: QuoteStatus = q.status;
    if (q.status === "ACTIVE" && q.validUntil.getTime() <= now) {
      effectiveStatus = "EXPIRED";
    }

    const weight = new Decimal(q.weightGrams.toString());
    const amount = new Decimal(q.quotedAmount.toString());

    totalQuotedWeightGrams = totalQuotedWeightGrams.plus(weight);
    totalQuotedAmount = totalQuotedAmount.plus(amount);

    if (effectiveStatus === "ACTIVE") activeCount++;
    else if (effectiveStatus === "CONSUMED") consumedCount++;
    else if (effectiveStatus === "EXPIRED") expiredCount++;
    else if (effectiveStatus === "CANCELLED") cancelledCount++;

    return {
      id: q.id,
      quoteNumber: q.quoteNumber,
      date: q.createdAt,
      direction: q.direction,
      metalId: q.metalId,
      metalName: q.metal.name,
      metalCode: q.metal.code,
      purityId: q.purityId,
      purityLabel: q.purity.label,
      weightGrams: weight,
      referenceRatePerGram: new Decimal(q.referenceRatePerGram.toString()),
      marginType: q.marginType,
      marginValue: new Decimal(q.marginValue.toString()),
      marginPerGram: new Decimal(q.marginPerGram.toString()),
      quotedRatePerGram: new Decimal(q.quotedRatePerGram.toString()),
      quotedAmount: amount,
      validUntil: q.validUntil,
      status: effectiveStatus,
      createdByName: q.createdBy.name,
      reservationNumber: q.rateReservation?.reservationNumber || null,
      notes: q.notes,
    };
  });

  return {
    summary: {
      totalQuotes: quotes.length,
      activeCount,
      consumedCount,
      expiredCount,
      cancelledCount,
      totalQuotedWeightGrams,
      totalQuotedAmount,
    },
    rows,
  };
}
