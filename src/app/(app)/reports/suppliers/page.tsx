import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportFilters } from "@/components/reports/report-filters";
import { SupplierWiseView } from "./supplier-wise-view";
import { requireUser } from "@/lib/auth/session";
import { getSupplierWisePurchaseReport } from "@/lib/services/report-service";
import { prisma } from "@/lib/db/client";
import { serializeForClient } from "@/lib/utils/serialize";

export const metadata = { title: "Supplier-wise Purchases — Bullion Reports" };

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    metalId?: string;
    purityId?: string;
    search?: string;
  }>;
}

export default async function SupplierWiseReportPage(props: PageProps) {
  await requireUser();
  const searchParams = await props.searchParams;

  const [metals, purities, report] = await Promise.all([
    prisma.metal.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    prisma.purity.findMany({ where: { isActive: true }, select: { id: true, label: true, metalId: true } }),
    getSupplierWisePurchaseReport({
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
      metalId: searchParams.metalId,
      purityId: searchParams.purityId,
      search: searchParams.search,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier-wise Purchase Report"
        subtitle="Consolidated supplier procurement analysis with weighted average rate derivation and volume ranking"
      />

      <ReportsNav />

      <ReportFilters
        metals={metals}
        purities={purities}
        showStatus={false}
        showMetalPurity={true}
        showSearch={true}
        searchPlaceholder="Search supplier name or contact..."
      />

      <SupplierWiseView report={serializeForClient(report)} />
    </div>
  );
}
