import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportFilters } from "@/components/reports/report-filters";
import { PurchaseRegisterView } from "./purchase-register-view";
import { requireUser } from "@/lib/auth/session";
import { getPurchaseRegisterReport } from "@/lib/services/report-service";
import { prisma } from "@/lib/db/client";
import { serializeForClient } from "@/lib/utils/serialize";

export const metadata = { title: "Purchase Register — Bullion Reports" };

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    metalId?: string;
    purityId?: string;
    status?: string;
    search?: string;
  }>;
}

export default async function PurchaseRegisterPage(props: PageProps) {
  await requireUser();
  const searchParams = await props.searchParams;

  const [metals, purities, report] = await Promise.all([
    prisma.metal.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    prisma.purity.findMany({ where: { isActive: true }, select: { id: true, label: true, metalId: true } }),
    getPurchaseRegisterReport({
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
      metalId: searchParams.metalId,
      purityId: searchParams.purityId,
      status: searchParams.status,
      search: searchParams.search,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Register"
        subtitle="Itemized bullion purchase journal with strict cancellation exclusion and weighted average cost derivation"
      />

      <ReportsNav />

      <ReportFilters
        metals={metals}
        purities={purities}
        showStatus={true}
        showMetalPurity={true}
        showSearch={true}
        searchPlaceholder="Search invoice #, supplier name, notes..."
      />

      <PurchaseRegisterView report={serializeForClient(report)} />
    </div>
  );
}
