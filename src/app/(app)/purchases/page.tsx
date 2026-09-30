import { PageHeader } from "@/components/page-header";
import { listPurchases } from "@/lib/services/purchase-service";
import { getAllMetals } from "@/lib/services/master-service";
import { listCounterparties } from "@/lib/services/counterparty-service";
import { requireUser } from "@/lib/auth/session";
import { PurchasesClient } from "./purchases-client";

export const metadata = {
  title: "Purchase Register — Bullion",
};

export default async function PurchasesPage() {
  const user = await requireUser();

  const [purchases, metals, counterparties] = await Promise.all([
    listPurchases(),
    getAllMetals(true),
    listCounterparties({ isActive: true }),
  ]);

  // Suppliers are counterparties with type SUPPLIER or BOTH
  const suppliers = counterparties
    .filter((c) => c.type === "SUPPLIER" || c.type === "BOTH")
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
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

  const serializedPurchases = purchases.map((p) => ({
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    date: p.date.toISOString(),
    supplierName: p.supplierName,
    supplierContact: p.supplierContact,
    counterpartyId: p.counterpartyId,
    metalId: p.metalId,
    purityId: p.purityId,
    weightGrams: p.weightGrams.toString(),
    ratePerGram: p.ratePerGram.toString(),
    totalAmount: p.totalAmount.toString(),
    paymentMode: p.paymentMode,
    notes: p.notes,
    status: p.status,
    cancelReason: p.cancelReason,
    cancelledAt: p.cancelledAt?.toISOString() || null,
    createdAt: p.createdAt.toISOString(),
    metal: { id: p.metal.id, name: p.metal.name, code: p.metal.code },
    purity: { id: p.purity.id, label: p.purity.label, fineness: p.purity.fineness.toString() },
    counterparty: p.counterparty ? { id: p.counterparty.id, name: p.counterparty.name, phone: p.counterparty.phone } : null,
    createdBy: { id: p.createdBy.id, name: p.createdBy.name, email: p.createdBy.email },
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Register"
        subtitle="Record precious metal acquisitions, manage supplier invoices, and track inward stock"
      />
      <PurchasesClient
        initialPurchases={serializedPurchases}
        metals={serializedMetals}
        suppliers={suppliers}
        userRole={user.role}
      />
    </div>
  );
}
