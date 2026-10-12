import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { getAllMetals } from "@/lib/services/master-service";
import { getMarginRulesHistory } from "@/lib/services/margin-service";
import { MarginsClient } from "./margins-client";

export const metadata = {
  title: "Margin Rules — Bullion Masters",
};

export default async function MarginsMasterPage() {
  const user = await requireUser();
  const [metals, history] = await Promise.all([
    getAllMetals(),
    getMarginRulesHistory({}),
  ]);

  const serializedMetals = metals.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    purities: m.purities.map((p) => ({
      id: p.id,
      label: p.label,
      fineness: p.fineness.toString(),
      isActive: p.isActive,
    })),
  }));

  const serializedHistory = history.map((r) => ({
    ...r,
    marginValue: r.marginValue.toString(),
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Margin Rules (V3.5)"
        subtitle="Manage buy and sell commercial margin spreads per metal and purity for the Quoting Engine"
      />

      <MarginsClient
        initialRules={serializedHistory}
        metals={serializedMetals}
        userRole={user.role}
      />
    </div>
  );
}
