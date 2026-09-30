import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportFilters } from "@/components/reports/report-filters";
import { ProfitReportView } from "./profit-report-view";
import { requireUser } from "@/lib/auth/session";
import { getBullionProfitReport } from "@/lib/services/report-service";
import { prisma } from "@/lib/db/client";
import { ShieldAlert } from "lucide-react";
import { serializeForClient } from "@/lib/utils/serialize";

export const metadata = { title: "Bullion Profit Report — Bullion Reports" };

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    metalId?: string;
    purityId?: string;
  }>;
}

export default async function BullionProfitPage(props: PageProps) {
  const user = await requireUser();
  const searchParams = await props.searchParams;

  if (user.role !== "ADMIN") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Bullion Profit Report"
          subtitle="Realized gross profit analytics and acquisition cost basis"
        />
        <ReportsNav />
        <div className="p-8 rounded-2xl bg-[var(--bg-card)] border border-red-500/20 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            Access Restricted — ADMIN Only
          </h2>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            The Bullion Profit Report contains confidential financial valuation and margin metrics. Only users with the ADMIN role are authorized to view this report.
          </p>
        </div>
      </div>
    );
  }

  const [metals, purities, report] = await Promise.all([
    prisma.metal.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    prisma.purity.findMany({ where: { isActive: true }, select: { id: true, label: true, metalId: true } }),
    getBullionProfitReport({
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
      metalId: searchParams.metalId,
      purityId: searchParams.purityId,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bullion Profit Report"
        subtitle="Realized gross profit and cost basis derived using the Weighted Average Cost methodology"
      />

      <ReportsNav />

      <ReportFilters
        metals={metals}
        purities={purities}
        showStatus={false}
        showMetalPurity={true}
        showSearch={false}
      />

      <ProfitReportView report={serializeForClient(report)} />
    </div>
  );
}
