import { requireUser } from "@/lib/auth/session";
import { getCounterpartyOutstandingsReport } from "@/lib/services/settlement-service";
import { serializeForClient } from "@/lib/utils/serialize";
import { OutstandingsView } from "./outstandings-view";

export const metadata = {
  title: "Counterparty Outstandings — Bullion V2",
  description: "Outstanding balances and exposure across suppliers and customers",
};

export default async function OutstandingsReportPage() {
  await requireUser();

  const report = await getCounterpartyOutstandingsReport();

  return (
    <div className="space-y-6">
      <OutstandingsView
        initialRows={serializeForClient(report.rows)}
        initialSummary={serializeForClient(report.summary)}
      />
    </div>
  );
}
