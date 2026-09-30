import { PageHeader } from "@/components/page-header";
import { listStockMovements } from "@/lib/services/stock-service";
import { getAllMetals } from "@/lib/services/master-service";
import { requireUser } from "@/lib/auth/session";
import { TransactionsClient } from "./transactions-client";

export const metadata = {
  title: "Transaction History — Stock Ledger Audit",
};

export default async function TransactionsPage() {
  await requireUser();

  const [movements, metals] = await Promise.all([
    listStockMovements({ limit: 200 }),
    getAllMetals(true),
  ]);

  const serializedMovements = movements.map((m) => ({
    id: m.id,
    movementType: m.movementType,
    weightGrams: m.weightGrams.toString(),
    reference: m.reference,
    createdAt: m.createdAt.toISOString(),
    metal: { id: m.metal.id, name: m.metal.name, code: m.metal.code },
    purity: { id: m.purity.id, label: m.purity.label, fineness: m.purity.fineness.toString() },
    createdBy: { id: m.createdBy.id, name: m.createdBy.name, role: m.createdBy.role },
    purchase: m.purchase ? {
      id: m.purchase.id,
      invoiceNumber: m.purchase.invoiceNumber,
      supplierName: m.purchase.supplierName,
      status: m.purchase.status,
    } : null,
    sale: m.sale ? {
      id: m.sale.id,
      invoiceNumber: m.sale.invoiceNumber,
      buyerName: m.sale.buyerName,
      status: m.sale.status,
    } : null,
    adjustment: m.adjustment ? {
      id: m.adjustment.id,
      reason: m.adjustment.reason,
      direction: m.adjustment.direction,
      status: m.adjustment.status,
    } : null,
    openingStock: m.openingStock ? {
      id: m.openingStock.id,
      effectiveDate: m.openingStock.effectiveDate.toISOString(),
    } : null,
  }));

  const serializedMetals = metals.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transaction History"
        subtitle="Complete operational audit trail of all physical stock movements across the system"
      />
      <TransactionsClient
        initialMovements={serializedMovements}
        metals={serializedMetals}
      />
    </div>
  );
}
