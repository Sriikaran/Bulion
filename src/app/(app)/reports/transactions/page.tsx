import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportFilters } from "@/components/reports/report-filters";
import { TransactionHistoryView } from "./transaction-history-view";
import { requireUser } from "@/lib/auth/session";
import { getTransactionHistoryReport } from "@/lib/services/report-service";
import { prisma } from "@/lib/db/client";
import { serializeForClient } from "@/lib/utils/serialize";

export const metadata = { title: "Transaction History Report — Bullion Reports" };

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    metalId?: string;
    purityId?: string;
    search?: string;
  }>;
}

export default async function TransactionHistoryReportPage(props: PageProps) {
  await requireUser();
  const searchParams = await props.searchParams;

  const [metals, purities, report] = await Promise.all([
    prisma.metal.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    prisma.purity.findMany({ where: { isActive: true }, select: { id: true, label: true, metalId: true } }),
    getTransactionHistoryReport({
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
        title="Transaction History Report"
        subtitle="Immutable append-only StockMovement ledger entries with full audit traces"
      />

      <ReportsNav />

      <ReportFilters
        metals={metals}
        purities={purities}
        showStatus={false}
        showMetalPurity={true}
        showSearch={true}
        searchPlaceholder="Search reference, invoice, actor..."
      />

      <TransactionHistoryView report={serializeForClient(report)} />
    </div>
  );
}
