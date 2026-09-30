import { PageHeader } from "@/components/page-header";
import { listAdjustments } from "@/lib/services/adjustment-service";
import { getAllMetals } from "@/lib/services/master-service";
import { requireUser } from "@/lib/auth/session";
import { AdjustmentsClient } from "./adjustments-client";

export const metadata = {
  title: "Stock Adjustments — Bullion",
};

export default async function AdjustmentsPage() {
  const user = await requireUser();

  const [adjustments, metals] = await Promise.all([
    listAdjustments(),
    getAllMetals(true),
  ]);

  const serializedAdjustments = adjustments.map((adj) => ({
    id: adj.id,
    date: adj.date.toISOString(),
    metalId: adj.metalId,
    purityId: adj.purityId,
    direction: adj.direction,
    weightGrams: adj.weightGrams.toString(),
    reason: adj.reason,
    notes: adj.notes,
    status: adj.status,
    cancelReason: adj.cancelReason,
    cancelledAt: adj.cancelledAt?.toISOString() || null,
    createdAt: adj.createdAt.toISOString(),
    metal: { id: adj.metal.id, name: adj.metal.name, code: adj.metal.code },
    purity: { id: adj.purity.id, label: adj.purity.label, fineness: adj.purity.fineness.toString() },
    createdBy: { id: adj.createdBy.id, name: adj.createdBy.name, email: adj.createdBy.email },
  }));

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Adjustments"
        subtitle="Authorized physical inventory balance corrections with auditable stock movements"
      />
      <AdjustmentsClient
        initialAdjustments={serializedAdjustments}
        metals={serializedMetals}
        userRole={user.role}
      />
    </div>
  );
}
