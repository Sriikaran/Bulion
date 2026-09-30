import { PageHeader } from "@/components/page-header";
import { getDetailedStockPositions } from "@/lib/services/stock-service";
import { getAllMetals } from "@/lib/services/master-service";
import { requireUser } from "@/lib/auth/session";
import { StockClient } from "./stock-client";

export const metadata = {
  title: "Current Stock & Valuation — Bullion",
};

export default async function StockPage() {
  const user = await requireUser();

  const [positions, metals] = await Promise.all([
    getDetailedStockPositions(),
    getAllMetals(true),
  ]);

  const serializedPositions = positions.map((p) => ({
    metalId: p.metalId,
    metalCode: p.metalCode,
    metalName: p.metalName,
    purityId: p.purityId,
    purityLabel: p.purityLabel,
    fineness: p.fineness.toString(),
    openingWeightGrams: p.openingWeightGrams.toString(),
    purchasedWeightGrams: p.purchasedWeightGrams.toString(),
    soldWeightGrams: p.soldWeightGrams.toString(),
    adjustmentIncreaseGrams: p.adjustmentIncreaseGrams.toString(),
    adjustmentDecreaseGrams: p.adjustmentDecreaseGrams.toString(),
    currentWeightGrams: p.currentWeightGrams.toString(),
    averagePurchaseRate: p.averagePurchaseRate.toString(),
    totalPurchaseValue: p.totalPurchaseValue.toString(),
    averageSellingRate: p.averageSellingRate.toString(),
    totalSalesValue: p.totalSalesValue.toString(),
    hasOpeningStock: p.hasOpeningStock,
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
        title="Physical Stock & Valuation"
        subtitle="Authoritative inventory balances derived strictly from the append-only stock movement ledger"
      />
      <StockClient
        initialPositions={serializedPositions}
        metals={serializedMetals}
        userRole={user.role}
      />
    </div>
  );
}
