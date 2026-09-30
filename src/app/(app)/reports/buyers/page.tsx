import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportFilters } from "@/components/reports/report-filters";
import { BuyerWiseView } from "./buyer-wise-view";
import { requireUser } from "@/lib/auth/session";
import { getBuyerWiseSalesReport } from "@/lib/services/report-service";
import { prisma } from "@/lib/db/client";
import { serializeForClient } from "@/lib/utils/serialize";

export const metadata = { title: "Buyer-wise Sales — Bullion Reports" };

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    metalId?: string;
    purityId?: string;
    search?: string;
  }>;
}

export default async function BuyerWiseReportPage(props: PageProps) {
  await requireUser();
  const searchParams = await props.searchParams;

  const [metals, purities, report] = await Promise.all([
    prisma.metal.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    prisma.purity.findMany({ where: { isActive: true }, select: { id: true, label: true, metalId: true } }),
    getBuyerWiseSalesReport({
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
        title="Buyer-wise Sales Report"
        subtitle="Consolidated buyer revenue analytics with weighted average selling rates and account rankings"
      />

      <ReportsNav />

      <ReportFilters
        metals={metals}
        purities={purities}
        showStatus={false}
        showMetalPurity={true}
        showSearch={true}
        searchPlaceholder="Search buyer name or contact..."
      />

      <BuyerWiseView report={serializeForClient(report)} />
    </div>
  );
}
