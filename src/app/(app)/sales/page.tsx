import { PageHeader } from "@/components/page-header";
import { listSales } from "@/lib/services/sale-service";
import { getAllMetals } from "@/lib/services/master-service";
import { listCounterparties } from "@/lib/services/counterparty-service";
import { requireUser } from "@/lib/auth/session";
import { SalesClient } from "./sales-client";

export const metadata = {
  title: "Sale Register — Bullion",
};

export default async function SalesPage() {
  const user = await requireUser();

  const [sales, metals, counterparties] = await Promise.all([
    listSales(),
    getAllMetals(true),
    listCounterparties({ isActive: true }),
  ]);

  // Buyers are counterparties with type CUSTOMER or BOTH
  const buyers = counterparties
    .filter((c) => c.type === "CUSTOMER" || c.type === "BOTH")
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

  const serializedSales = sales.map((s) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    date: s.date.toISOString(),
    buyerName: s.buyerName,
    buyerContact: s.buyerContact,
    counterpartyId: s.counterpartyId,
    metalId: s.metalId,
    purityId: s.purityId,
    weightGrams: s.weightGrams.toString(),
    ratePerGram: s.ratePerGram.toString(),
    totalAmount: s.totalAmount.toString(),
    paymentMode: s.paymentMode,
    notes: s.notes,
    status: s.status,
    cancelReason: s.cancelReason,
    cancelledAt: s.cancelledAt?.toISOString() || null,
    createdAt: s.createdAt.toISOString(),
    metal: { id: s.metal.id, name: s.metal.name, code: s.metal.code },
    purity: { id: s.purity.id, label: s.purity.label, fineness: s.purity.fineness.toString() },
    counterparty: s.counterparty ? { id: s.counterparty.id, name: s.counterparty.name, phone: s.counterparty.phone } : null,
    createdBy: { id: s.createdBy.id, name: s.createdBy.name, email: s.createdBy.email },
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sale Register"
        subtitle="Manage customer sales invoices, verify physical stock sufficiency, and record bullion dispatches"
      />
      <SalesClient
        initialSales={serializedSales}
        metals={serializedMetals}
        buyers={buyers}
        userRole={user.role}
      />
    </div>
  );
}
