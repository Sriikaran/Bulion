import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportFilters } from "@/components/reports/report-filters";
import { PurchaseVsSalesView } from "./purchase-vs-sales-view";
import { requireUser } from "@/lib/auth/session";
import { getPurchaseVsSalesReport } from "@/lib/services/report-service";
import { prisma } from "@/lib/db/client";
import { serializeForClient } from "@/lib/utils/serialize";

export const metadata = { title: "Purchase vs Sales — Bullion Reports" };

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    metalId?: string;
    purityId?: string;
  }>;
}

export default async function PurchaseVsSalesPage(props: PageProps) {
  await requireUser();
  const searchParams = await props.searchParams;

  const [metals, purities, report] = await Promise.all([
    prisma.metal.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    prisma.purity.findMany({ where: { isActive: true }, select: { id: true, label: true, metalId: true } }),
    getPurchaseVsSalesReport({
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
      metalId: searchParams.metalId,
      purityId: searchParams.purityId,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase vs Sales Report"
        subtitle="Comparative analysis of period trade volumes, unit rates, and net flows"
      />

      <ReportsNav />

      <ReportFilters
        metals={metals}
        purities={purities}
        showStatus={false}
        showMetalPurity={true}
        showSearch={false}
      />

      <PurchaseVsSalesView report={serializeForClient(report)} />
    </div>
  );
}
