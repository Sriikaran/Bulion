import { PageHeader } from "@/components/page-header";
import { getAllMetals } from "@/lib/services/master-service";
import { requireUser } from "@/lib/auth/session";
import { MastersClient } from "./masters-client";

export const metadata = {
  title: "Master Data — Metals & Purities",
};

export default async function MastersPage() {
  const user = await requireUser();
  const metals = await getAllMetals();

  // Serialize Decimal types to strings for client components
  const serializedMetals = metals.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    type: m.type,
    isActive: m.isActive,
    purities: m.purities.map((p) => ({
      id: p.id,
      metalId: p.metalId,
      label: p.label,
      fineness: p.fineness.toString(),
      displayInfo: p.displayInfo,
      sortOrder: p.sortOrder,
      isActive: p.isActive,
    })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metals & Purities Master"
        subtitle="Manage precious metals catalog, purity standards, and fineness fractions"
      />
      <MastersClient
        initialMetals={serializedMetals}
        userRole={user.role}
      />
    </div>
  );
}
