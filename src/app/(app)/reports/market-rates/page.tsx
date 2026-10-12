import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { requireUser } from "@/lib/auth/session";
import { getAllMetals } from "@/lib/services/master-service";
import { getMarketRatesReport } from "@/lib/services/market-rate-service";
import { MarketRatesReportView } from "./market-rates-report-view";

export const metadata = {
  title: "Market Reference Rates Report — Bullion",
};

interface MarketRatesReportPageProps {
  searchParams: Promise<{
    metalId?: string;
    purityId?: string;
    dateFrom?: string;
    dateTo?: string;
    source?: string;
  }>;
}

export default async function MarketRatesReportPage({
  searchParams,
}: MarketRatesReportPageProps) {
  await requireUser();
  const params = await searchParams;

  const filters = {
    metalId: params.metalId,
    purityId: params.purityId,
    dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
    dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
    source: params.source,
  };

  const [report, metals] = await Promise.all([
    getMarketRatesReport(filters),
    getAllMetals(),
  ]);

  const serializedMetals = metals.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
  }));

  const serializedPurities = metals.flatMap((m) =>
    m.purities.map((p) => ({
      id: p.id,
      label: p.label,
      metalId: m.id,
    })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Market Reference Rates Report"
        subtitle="Benchmark market pricing log, current quotes, and historical rate changes"
      />

      <ReportsNav />

      <MarketRatesReportView
        report={report}
        metals={serializedMetals}
        purities={serializedPurities}
      />
    </div>
  );
}
