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
    rateStatus: p.rateStatus,
    ratePerGram: p.ratePerGram != null ? p.ratePerGram.toString() : null,
    totalAmount: p.totalAmount != null ? p.totalAmount.toString() : null,
    rateFixedAt: p.rateFixedAt?.toISOString() || null,
    paymentMode: p.paymentMode,
    paymentStatus: p.paymentStatus,
    paidAmount: p.payments
      .filter((pay) => pay.status === "COMPLETED")
      .reduce((sum, pay) => sum + parseFloat(pay.amount.toString()), 0)
      .toFixed(2),
    outstandingAmount: p.status === "CANCELLED" || p.totalAmount == null
      ? "0.00"
      : Math.max(
          0,
          parseFloat(p.totalAmount.toString()) -
            p.payments
              .filter((pay) => pay.status === "COMPLETED")
              .reduce((sum, pay) => sum + parseFloat(pay.amount.toString()), 0),
        ).toFixed(2),
    fulfilmentStatus: p.fulfilmentStatus,
    fulfilledWeightGrams: (p.fulfilments || [])
      .filter((f) => f.status !== "CANCELLED")
      .reduce((sum, f) => sum + parseFloat(f.weightGrams.toString()), 0)
      .toFixed(4),
    remainingWeightGrams: Math.max(
      0,
      parseFloat(p.weightGrams.toString()) -
        (p.fulfilments || [])
          .filter((f) => f.status !== "CANCELLED")
          .reduce((sum, f) => sum + parseFloat(f.weightGrams.toString()), 0),
    ).toFixed(4),
    fulfilments: (p.fulfilments || []).map((f) => ({
      id: f.id,
      fulfilmentNumber: f.fulfilmentNumber,
      weightGrams: f.weightGrams.toString(),
      fulfilledAt: f.fulfilledAt.toISOString(),
      notes: f.notes,
      status: f.status,
    })),
    notes: p.notes,
    status: p.status,
    cancelReason: p.cancelReason,
    cancelledAt: p.cancelledAt?.toISOString() || null,
    createdAt: p.createdAt.toISOString(),
    metal: { id: p.metal.id, name: p.metal.name, code: p.metal.code },
    purity: { id: p.purity.id, label: p.purity.label, fineness: p.purity.fineness.toString() },
    counterparty: p.counterparty ? { id: p.counterparty.id, name: p.counterparty.name, phone: p.counterparty.phone } : null,
    createdBy: { id: p.createdBy.id, name: p.createdBy.name, email: p.createdBy.email },
    payments: p.payments.map((pay) => ({
      id: pay.id,
      paymentNumber: pay.paymentNumber,
      type: pay.type,
      date: pay.date.toISOString(),
      amount: pay.amount.toString(),
      paymentMode: pay.paymentMode,
      referenceNumber: pay.referenceNumber,
      notes: pay.notes,
      status: pay.status,
      cancelReason: pay.cancelReason,
      cancelledAt: pay.cancelledAt?.toISOString() || null,
      createdByName: pay.createdBy.name,
      createdAt: pay.createdAt.toISOString(),
    })),
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
