"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  CreateMarginRuleSchema,
  GetMarginRulesFilterSchema,
} from "@/lib/validations/margin";
import {
  createMarginRule,
  getMarginRulesHistory,
  toggleMarginRuleActive,
} from "@/lib/services/margin-service";

export async function createMarginRuleAction(input: unknown) {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized: only administrators can create margin rules." };
    }

    const parsed = CreateMarginRuleSchema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
      return { success: false, error: errorMsg };
    }

    const rule = await createMarginRule(parsed.data, user.id);

    revalidatePath("/masters/margins");
    revalidatePath("/quotes");
    revalidatePath("/reports/quotes");

    return {
      success: true,
      data: {
        id: rule.id,
        metalName: rule.metal.name,
        purityLabel: rule.purity.label,
        direction: rule.direction,
        marginType: rule.marginType,
        marginValue: rule.marginValue.toString(),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create margin rule";
    return { success: false, error: message };
  }
}

export async function getMarginRulesHistoryAction(filters: unknown) {
  try {
    await requireUser();
    const parsed = GetMarginRulesFilterSchema.safeParse(filters);
    if (!parsed.success) {
      return { success: false, error: "Invalid filters" };
    }

    const rules = await getMarginRulesHistory(parsed.data);
    return {
      success: true,
      data: rules.map((r) => ({
        ...r,
        marginValue: r.marginValue.toString(),
        effectiveFrom: r.effectiveFrom.toISOString(),
        effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch margin rules";
    return { success: false, error: message };
  }
}

export async function toggleMarginRuleActiveAction(ruleId: string, isActive: boolean) {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized: only administrators can update margin rules." };
    }

    const rule = await toggleMarginRuleActive(ruleId, isActive, user.id);

    revalidatePath("/masters/margins");
    revalidatePath("/quotes");

    return { success: true, data: { id: rule.id, isActive: rule.isActive } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to toggle margin rule status";
    return { success: false, error: message };
  }
}
