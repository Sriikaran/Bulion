import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { getAllMetals } from "@/lib/services/master-service";
import {
  getMarketRateHistory,
  getAllCurrentMarketRates,
} from "@/lib/services/market-rate-service";
import { MarketRatesClient } from "./market-rates-client";

export const metadata = {
  title: "Market Reference Rates — Bullion Masters",
};

export default async function MarketRatesMasterPage() {
  const user = await requireUser();
  const [metals, history, currentCards] = await Promise.all([
    getAllMetals(),
    getMarketRateHistory({}),
    getAllCurrentMarketRates(),
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Market Reference Rates (V3.4)"
        subtitle="Current market benchmark rates per metal & purity for quoting and operational decisions"
      />

      <MarketRatesClient
        initialRates={history}
        currentCards={currentCards}
        metals={serializedMetals}
        userRole={user.role}
      />
    </div>
  );
}
