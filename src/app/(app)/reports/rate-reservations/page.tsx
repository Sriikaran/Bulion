import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { RateReservationsReportView } from "./rate-reservations-report-view";
import { requireUser } from "@/lib/auth/session";
import { getRateReservationsReport } from "@/lib/services/reservation-service";
import { prisma } from "@/lib/db/client";
import { serializeForClient } from "@/lib/utils/serialize";

export const metadata = { title: "Rate Reservations — Bullion Reports" };

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

export default async function RateReservationsReportPage(props: PageProps) {
  await requireUser();
  const searchParams = await props.searchParams;

  const [metals, purities, counterparties, report] = await Promise.all([
    prisma.metal.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    prisma.purity.findMany({ where: { isActive: true }, select: { id: true, label: true, metalId: true } }),
    prisma.counterparty.findMany({ where: { isActive: true }, select: { id: true, name: true, type: true } }),
    getRateReservationsReport({
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
        title="Rate Blocks & Rate Reservations Report"
        subtitle="Tracking controlled rate commitments, active quantities, consumption events, and expiry lifecycles"
      />

      <ReportsNav />

      <RateReservationsReportView
        report={serializeForClient(report)}
        metals={metals}
        purities={purities}
        counterparties={counterparties}
      />
    </div>
  );
}
