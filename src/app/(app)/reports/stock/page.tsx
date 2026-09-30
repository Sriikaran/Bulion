import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportFilters } from "@/components/reports/report-filters";
import { CurrentStockView } from "./current-stock-view";
import { requireUser } from "@/lib/auth/session";
import { getCurrentStockReport } from "@/lib/services/report-service";
import { prisma } from "@/lib/db/client";
import { serializeForClient } from "@/lib/utils/serialize";

export const metadata = { title: "Current Stock Report — Bullion Reports" };

interface PageProps {
  searchParams: Promise<{
    metalId?: string;
    purityId?: string;
    search?: string;
  }>;
}

export default async function CurrentStockReportPage(props: PageProps) {
  await requireUser();
  const searchParams = await props.searchParams;

  const [metals, purities, report] = await Promise.all([
    prisma.metal.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    prisma.purity.findMany({ where: { isActive: true }, select: { id: true, label: true, metalId: true } }),
    getCurrentStockReport({
      metalId: searchParams.metalId,
      purityId: searchParams.purityId,
      search: searchParams.search,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Current Stock Report"
        subtitle="Authoritative physical stock balance derived strictly from the StockMovement ledger"
      />

      <ReportsNav />

      <ReportFilters
        metals={metals}
        purities={purities}
        showStatus={false}
        showMetalPurity={true}
        showSearch={true}
        searchPlaceholder="Filter metal or purity label..."
      />

      <CurrentStockView report={serializeForClient(report)} />
    </div>
  );
}
