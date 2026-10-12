import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { getAllMetals } from "@/lib/services/master-service";
import { getQuotesReport } from "@/lib/services/quote-service";
import { listCounterparties } from "@/lib/services/counterparty-service";
import { QuotesClient } from "./quotes-client";

export const metadata = {
  title: "Quote Calculator & Trading Quotes — Bullion",
};

export default async function QuotesPage() {
  const user = await requireUser();
  const [metals, report, counterparties] = await Promise.all([
    getAllMetals(),
    getQuotesReport({}),
    listCounterparties({ isActive: true }),
  ]);

  const serializedMetals = metals.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    purities: m.purities.map((p) => ({
      id: p.id,
      label: p.label,
      fineness: p.fineness.toString(),
      isActive: p.isActive,
    })),
  }));

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

  const serializedCounterparties = counterparties.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    type: c.type,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quoting Engine & Calculator (V3.5)"
        subtitle="Propose commercial buy/sell transaction quotes calculated from market reference rates and margin spreads"
      />

      <QuotesClient
        initialReport={serializedReport}
        metals={serializedMetals}
        counterparties={serializedCounterparties}
        userRole={user.role}
      />
    </div>
  );
}
