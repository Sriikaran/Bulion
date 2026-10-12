import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { FulfilmentReportView } from "./fulfilment-report-view";
import { requireUser } from "@/lib/auth/session";
import { getFulfilmentReport } from "@/lib/services/fulfilment-service";
import { prisma } from "@/lib/db/client";
import { serializeForClient } from "@/lib/utils/serialize";

export const metadata = { title: "Fulfilment Report — Bullion Reports" };

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    type?: string;
    status?: string;
    metalId?: string;
    purityId?: string;
    counterpartyId?: string;
    search?: string;
  }>;
}

export default async function FulfilmentReportPage(props: PageProps) {
  await requireUser();
  const searchParams = await props.searchParams;

  const [metals, purities, counterparties, report] = await Promise.all([
    prisma.metal.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    prisma.purity.findMany({ where: { isActive: true }, select: { id: true, label: true, metalId: true } }),
    prisma.counterparty.findMany({ where: { isActive: true }, select: { id: true, name: true, type: true } }),
    getFulfilmentReport({
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
      type: searchParams.type,
      status: searchParams.status,
      metalId: searchParams.metalId,
      purityId: searchParams.purityId,
      counterpartyId: searchParams.counterpartyId,
      search: searchParams.search,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Physical Fulfilment Report"
        subtitle="Commercial deal delivery tracking, showing physical stock fulfilled vs remaining commitments"
      />

      <ReportsNav />

      <FulfilmentReportView
        report={serializeForClient(report)}
        metals={metals}
        purities={purities}
        counterparties={counterparties}
      />
    </div>
  );
}
