"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  CalculateQuoteSchema,
  CreateQuoteSchema,
  ConsumeQuoteSchema,
  CancelQuoteSchema,
  GetQuotesFilterSchema,
} from "@/lib/validations/quote";
import {
  calculateQuote,
  createQuote,
  consumeQuote,
  cancelQuote,
  getQuotesReport,
} from "@/lib/services/quote-service";

export async function calculateQuoteAction(input: unknown) {
  try {
    await requireUser();
    const parsed = CalculateQuoteSchema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
      return { success: false, error: errorMsg };
    }

    const calc = await calculateQuote(parsed.data);
    return {
      success: true,
      data: {
        metalId: calc.metalId,
        metalName: calc.metalName,
        metalCode: calc.metalCode,
        purityId: calc.purityId,
        purityLabel: calc.purityLabel,
        direction: calc.direction,
        weightGrams: calc.weightGrams.toString(),
        marketRateId: calc.marketRateId,
        referenceRatePerGram: calc.referenceRatePerGram.toString(),
        marketRateEffectiveFrom: calc.marketRateEffectiveFrom.toISOString(),
        marginRuleId: calc.marginRuleId,
        marginType: calc.marginType,
        marginValue: calc.marginValue.toString(),
        marginPerGram: calc.marginPerGram.toString(),
        quotedRatePerGram: calc.quotedRatePerGram.toString(),
        quotedAmount: calc.quotedAmount.toString(),
        calculatedAt: calc.calculatedAt.toISOString(),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to calculate quote";
    return { success: false, error: message };
  }
}

export async function createQuoteAction(input: unknown) {
  try {
    const user = await requireUser();
    const parsed = CreateQuoteSchema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
      return { success: false, error: errorMsg };
    }

    const quote = await createQuote(parsed.data, user.id);

    revalidatePath("/quotes");
    revalidatePath("/reports/quotes");

    return {
      success: true,
      data: {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        direction: quote.direction,
        metalName: quote.metal.name,
        purityLabel: quote.purity.label,
        weightGrams: quote.weightGrams.toString(),
        referenceRatePerGram: quote.referenceRatePerGram.toString(),
        quotedRatePerGram: quote.quotedRatePerGram.toString(),
        quotedAmount: quote.quotedAmount.toString(),
        validUntil: quote.validUntil.toISOString(),
        status: quote.status,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create quote";
    return { success: false, error: message };
  }
}

export async function consumeQuoteAction(input: unknown) {
  try {
    const user = await requireUser();
    const parsed = ConsumeQuoteSchema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
      return { success: false, error: errorMsg };
    }

    const result = await consumeQuote(parsed.data, user.id);

    revalidatePath("/quotes");
    revalidatePath("/reports/quotes");
    revalidatePath("/reports/rate-reservations");
    revalidatePath("/purchases");
    revalidatePath("/sales");

    return {
      success: true,
      data: {
        quoteId: result.quote.id,
        quoteNumber: result.quote.quoteNumber,
        reservationId: result.reservation.id,
        reservationNumber: result.reservation.reservationNumber,
        reservedRatePerGram: result.reservation.reservedRatePerGram.toString(),
        reservedAmount: result.reservation.reservedAmount.toString(),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to consume quote";
    return { success: false, error: message };
  }
}

export async function cancelQuoteAction(input: unknown) {
  try {
    const user = await requireUser();
    const parsed = CancelQuoteSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid cancel input" };
    }

    const cancelled = await cancelQuote(parsed.data, user.id);

    revalidatePath("/quotes");
    revalidatePath("/reports/quotes");

    return {
      success: true,
      data: {
        id: cancelled.id,
        quoteNumber: cancelled.quoteNumber,
        status: cancelled.status,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to cancel quote";
    return { success: false, error: message };
  }
}

export async function convertQuoteToDealAction(input: unknown) {
  try {
    const user = await requireUser();
    const { ConvertQuoteToDealSchema } = await import("@/lib/validations/quote");
    const { convertQuoteToDeal } = await import("@/lib/services/quote-service");
    const parsed = ConvertQuoteToDealSchema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
      return { success: false, error: errorMsg };
    }

    const res = await convertQuoteToDeal(parsed.data, user.id);

    revalidatePath("/quotes");
    revalidatePath("/reports/quotes");
    if (res.purchase) {
      revalidatePath("/purchases");
      revalidatePath(`/purchases/${res.purchase.id}`);
      revalidatePath("/reports/purchases");
    }
    if (res.sale) {
      revalidatePath("/sales");
      revalidatePath(`/sales/${res.sale.id}`);
      revalidatePath("/reports/sales");
      revalidatePath("/stock");
    }

    return {
      success: true,
      data: {
        quoteId: res.quote.id,
        quoteNumber: res.quote.quoteNumber,
        purchaseId: res.purchase?.id ?? null,
        purchaseInvoice: res.purchase?.invoiceNumber ?? null,
        saleId: res.sale?.id ?? null,
        saleInvoice: res.sale?.invoiceNumber ?? null,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to convert quote to deal";
    return { success: false, error: message };
  }
}

export async function getQuotesReportAction(filters: unknown) {
  try {
    await requireUser();
    const parsed = GetQuotesFilterSchema.safeParse(filters);
    if (!parsed.success) {
      return { success: false, error: "Invalid filters" };
    }

    const report = await getQuotesReport(parsed.data);
    return {
      success: true,
      data: {
        summary: {
          totalQuotes: report.summary.totalQuotes,
          activeCount: report.summary.activeCount,
          consumedCount: report.summary.consumedCount,
          expiredCount: report.summary.expiredCount,
          cancelledCount: report.summary.cancelledCount,
          totalQuotedWeightGrams: report.summary.totalQuotedWeightGrams.toString(),
          totalQuotedAmount: report.summary.totalQuotedAmount.toString(),
        },
        rows: report.rows.map((r) => ({
          ...r,
          date: r.date.toISOString(),
          validUntil: r.validUntil.toISOString(),
          weightGrams: r.weightGrams.toString(),
          referenceRatePerGram: r.referenceRatePerGram.toString(),
          marginValue: r.marginValue.toString(),
          marginPerGram: r.marginPerGram.toString(),
          quotedRatePerGram: r.quotedRatePerGram.toString(),
          quotedAmount: r.quotedAmount.toString(),
        })),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch quotes report";
    return { success: false, error: message };
  }
}
