import { PageHeader } from "@/components/page-header";
import { listCounterparties } from "@/lib/services/counterparty-service";
import { requireUser } from "@/lib/auth/session";
import { CounterpartiesClient } from "./counterparties-client";

import { serializeForClient } from "@/lib/utils/serialize";

export const metadata = {
  title: "Counterparty Master — Bullion",
};

export default async function CounterpartiesPage() {
  const user = await requireUser();
  const counterparties = await listCounterparties();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Counterparties Master"
        subtitle="Manage suppliers, buyers, and refiners with operational transaction histories"
      />
      <CounterpartiesClient
        initialCounterparties={serializeForClient(counterparties)}
        userRole={user.role}
      />
    </div>
  );
}
