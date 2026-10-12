import { requireUser } from "@/lib/auth/session";
import { listCounterparties } from "@/lib/services/counterparty-service";
import { getCounterpartyLedgerReport } from "@/lib/services/settlement-service";
import { serializeForClient } from "@/lib/utils/serialize";
import { LedgerView } from "./ledger-view";

export const metadata = {
  title: "Counterparty Ledger — Bullion V2",
  description: "Chronological running ledger and settlement history for counterparties",
};

interface LedgerPageProps {
  searchParams: Promise<{
    counterpartyId?: string;
    fromDate?: string;
    toDate?: string;
  }>;
}

export default async function CounterpartyLedgerPage({ searchParams }: LedgerPageProps) {
  await requireUser();

  const resolvedParams = await searchParams;
  const counterparties = await listCounterparties({ isActive: true });

  const selectedPartyId =
    resolvedParams.counterpartyId || (counterparties.length > 0 ? counterparties[0].id : undefined);

  let reportData = null;
  if (selectedPartyId) {
    try {
      reportData = await getCounterpartyLedgerReport(selectedPartyId, {
        dateFrom: resolvedParams.fromDate || null,
        dateTo: resolvedParams.toDate || null,
      });
    } catch {
      reportData = null;
    }
  }

  const summary = reportData
    ? {
        totalDebit: reportData.totalDebits.toString(),
        totalCredit: reportData.totalCredits.toString(),
        closingBalance: reportData.closingBalance.toString(),
        balanceDirection: reportData.closingBalance.isZero()
          ? ("SETTLED" as const)
          : reportData.closingBalance.isPositive()
          ? ("RECEIVABLE" as const)
          : ("PAYABLE" as const),
      }
    : {
        totalDebit: "0",
        totalCredit: "0",
        closingBalance: "0",
        balanceDirection: "SETTLED" as const,
      };

  return (
    <div className="space-y-6">
      <LedgerView
        counterparties={serializeForClient(
          counterparties.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            phone: c.phone,
          }))
        )}
        selectedCounterpartyId={selectedPartyId}
        counterpartyInfo={reportData ? serializeForClient(reportData.counterparty) : null}
        entries={
          reportData
            ? serializeForClient(
                reportData.entries.map((e) => ({
                  ...e,
                  date: e.date.toISOString(),
                  debit: e.debit.toString(),
                  credit: e.credit.toString(),
                  runningBalance: e.runningBalance.toString(),
                }))
              )
            : []
        }
        summary={serializeForClient(summary)}
        fromDate={resolvedParams.fromDate}
        toDate={resolvedParams.toDate}
      />
    </div>
  );
}
