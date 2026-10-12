"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  CreateMarketRateSchema,
  GetMarketRateHistorySchema,
} from "@/lib/validations/market-rate";
import {
  createMarketRate,
  getCurrentMarketRate,
  getAllCurrentMarketRates,
  getMarketRateHistory,
} from "@/lib/services/market-rate-service";

export async function createMarketRateAction(input: unknown) {
  try {
    const user = await requireUser();

    const parsed = CreateMarketRateSchema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
      return { success: false, error: errorMsg };
    }

    const rate = await createMarketRate(parsed.data, user.id);

    revalidatePath("/masters/market-rates");
    revalidatePath("/reports/market-rates");
    revalidatePath("/purchases");
    revalidatePath("/sales");

    return { success: true, data: rate };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create market rate";
    return { success: false, error: message };
  }
}

export async function getCurrentMarketRateAction(
  metalId: string,
  purityId: string,
  asOfIso?: string,
) {
  try {
    await requireUser();
    const asOf = asOfIso ? new Date(asOfIso) : new Date();
    const rate = await getCurrentMarketRate(metalId, purityId, asOf);
    return {
      success: true,
      data: rate
        ? {
            id: rate.id,
            ratePerGram: rate.ratePerGram.toString(),
            effectiveFrom: rate.effectiveFrom.toISOString(),
            source: rate.source,
            metalName: rate.metal.name,
            purityLabel: rate.purity.label,
          }
        : null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch current market rate";
    return { success: false, error: message };
  }
}

export async function getAllCurrentMarketRatesAction() {
  try {
    await requireUser();
    const rates = await getAllCurrentMarketRates();
    return { success: true, data: rates };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch current market rates";
    return { success: false, error: message };
  }
}

export async function getMarketRateHistoryAction(filters: unknown) {
  try {
    await requireUser();
    const parsed = GetMarketRateHistorySchema.safeParse(filters);
    if (!parsed.success) {
      return { success: false, error: "Invalid filters" };
    }

    const history = await getMarketRateHistory(parsed.data);
    return { success: true, data: history };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch market rate history";
    return { success: false, error: message };
  }
}
