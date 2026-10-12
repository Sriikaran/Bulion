import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { requireUser } from "@/lib/auth/session";
import { getAllMetals } from "@/lib/services/master-service";
import { getQuotesReport } from "@/lib/services/quote-service";
import { QuotesReportView } from "./quotes-report-view";

export const metadata = {
  title: "Commercial Quotes Report — Bullion",
};

interface QuotesReportPageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    quoteNumber?: string;
    direction?: "BUY" | "SELL" | "ALL";
    metalId?: string;
    purityId?: string;
    status?: "ACTIVE" | "EXPIRED" | "CONSUMED" | "CANCELLED" | "ALL";
    search?: string;
  }>;
}

export default async function QuotesReportPage({
  searchParams,
}: QuotesReportPageProps) {
  await requireUser();
  const params = await searchParams;

  const filters = {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    quoteNumber: params.quoteNumber,
    direction: params.direction,
    metalId: params.metalId,
    purityId: params.purityId,
    status: params.status,
    search: params.search,
  };

  const [report, metals] = await Promise.all([
    getQuotesReport(filters),
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

  const serializedReport = {
    summary: {
      totalQuotes: report.summary.totalQuotes,
      activeCount: report.summary.activeCount,
      consumedCount: report.summary.consumedCount,
      expiredCount: report.summary.expiredCount,
      cancelledCount: report.summary.cancelledCount,
      totalQuotedWeightGrams: report.summary.totalQuotedWeightGrams.toString(),
      totalQuotedAmount: report.summary.totalQuotedAmount.toString(),
    },
    rows: report.rows.map((r) => ({
      ...r,
      date: r.date.toISOString(),
      validUntil: r.validUntil.toISOString(),
      weightGrams: r.weightGrams.toString(),
      referenceRatePerGram: r.referenceRatePerGram.toString(),
      marginValue: r.marginValue.toString(),
      marginPerGram: r.marginPerGram.toString(),
      quotedRatePerGram: r.quotedRatePerGram.toString(),
      quotedAmount: r.quotedAmount.toString(),
    })),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Commercial Quotes Report (V3.5)"
        subtitle="Historical audit log of calculated commercial quotes, margin rules applied, and downstream rate reservations"
      />

      <ReportsNav />

      <QuotesReportView
        report={serializedReport}
        metals={serializedMetals}
        purities={serializedPurities}
      />
    </div>
  );
}
