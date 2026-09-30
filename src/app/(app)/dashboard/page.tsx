import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Package, TrendingUp, TrendingDown, ShoppingCart, Sliders, History, ArrowRight } from "lucide-react";
import { getAllStockPositions } from "@/lib/services/stock-service";
import { listStockMovements } from "@/lib/services/stock-service";
import { prisma } from "@/lib/db/client";
import { formatCurrency, formatGrams, formatDate } from "@/lib/utils/helpers";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Dashboard — Bullion" };

export default async function DashboardPage() {
  await requireUser();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [positions, recentMovements, purchaseAgg, saleAgg] = await Promise.all([
    getAllStockPositions(),
    listStockMovements({ limit: 6 }),
    prisma.purchase.aggregate({
      where: {
        status: "POSTED",
        date: { gte: startOfMonth },
      },
      _sum: { totalAmount: true },
    }),
    prisma.sale.aggregate({
      where: {
        status: "POSTED",
        date: { gte: startOfMonth },
      },
      _sum: { totalAmount: true },
    }),
  ]);

  let totalGoldGrams = 0;
  let totalSilverGrams = 0;

  for (const pos of positions) {
    const w = parseFloat(pos.currentWeightGrams.toString()) || 0;
    if (pos.metalCode === "GOLD") totalGoldGrams += w;
    if (pos.metalCode === "SILVER") totalSilverGrams += w;
  }

  const thisMonthPurchases = purchaseAgg._sum.totalAmount != null
    ? purchaseAgg._sum.totalAmount.toString()
    : "0.00";

  const thisMonthSales = saleAgg._sum.totalAmount != null
    ? saleAgg._sum.totalAmount.toString()
    : "0.00";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Real-time bullion inventory, monthly financial flow, and recent ledger activity"
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total Gold Stock"
          value={formatGrams(totalGoldGrams)}
          icon={<Package className="w-5 h-5" />}
          accent="#C59A58"
          subtitle="Available physical gold"
        />
        <KpiCard
          label="Total Silver Stock"
          value={formatGrams(totalSilverGrams)}
          icon={<Package className="w-5 h-5" />}
          accent="#9CA3AF"
          subtitle="Available physical silver"
        />
        <KpiCard
          label="This Month Purchases"
          value={formatCurrency(thisMonthPurchases)}
          icon={<ShoppingCart className="w-5 h-5" />}
          accent="#22C55E"
          subtitle="Posted acquisition value"
        />
        <KpiCard
          label="This Month Sales"
          value={formatCurrency(thisMonthSales)}
          icon={<TrendingDown className="w-5 h-5" />}
          accent="#F59E0B"
          subtitle="Posted sales revenue"
        />
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link
          href="/purchases"
          className="glass-card-hover p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] flex items-center justify-between group transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-600 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-xs text-[var(--text-primary)]">Purchases</div>
              <div className="text-[11px] text-[var(--text-muted)]">Record metal intake</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[#C59A58] transition-transform group-hover:translate-x-1" />
        </Link>

        <Link
          href="/sales"
          className="glass-card-hover p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] flex items-center justify-between group transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-xs text-[var(--text-primary)]">Sales</div>
              <div className="text-[11px] text-[var(--text-muted)]">Dispatch bullion</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[#C59A58] transition-transform group-hover:translate-x-1" />
        </Link>

        <Link
          href="/stock"
          className="glass-card-hover p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] flex items-center justify-between group transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C59A58]/15 text-[#C59A58] flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-xs text-[var(--text-primary)]">Stock & Valuation</div>
              <div className="text-[11px] text-[var(--text-muted)]">View bucket breakdown</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[#C59A58] transition-transform group-hover:translate-x-1" />
        </Link>

        <Link
          href="/adjustments"
          className="glass-card-hover p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] flex items-center justify-between group transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-xs text-[var(--text-primary)]">Stock Adjustments</div>
              <div className="text-[11px] text-[var(--text-muted)]">Correct physical balance</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[#C59A58] transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      {/* Recent Ledger Activity */}
      <div className="glass-card rounded-2xl border border-[var(--border-primary)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#C59A58]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Recent Ledger Activity
            </h3>
          </div>
          <Link
            href="/transactions"
            className="text-xs font-semibold text-[#C59A58] hover:underline flex items-center gap-1"
          >
            <span>View All Ledger History</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-table-head)] text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Event</th>
                <th className="py-2.5 px-4">Metal & Purity</th>
                <th className="py-2.5 px-4 text-right">Signed Weight</th>
                <th className="py-2.5 px-4">Reference</th>
                <th className="py-2.5 px-4">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {recentMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                    No recent transactions in ledger
                  </td>
                </tr>
              ) : (
                recentMovements.map((m) => {
                  const w = parseFloat(m.weightGrams.toString());
                  const isPositive = w > 0;
                  return (
                    <tr key={m.id} className="hover:bg-[var(--bg-table-hover)]">
                      <td className="py-2.5 px-4 text-[var(--text-secondary)]">
                        {formatDate(m.createdAt)}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-[var(--text-primary)]">
                        {m.movementType}
                      </td>
                      <td className="py-2.5 px-4">
                        {m.metal.name} ({m.purity.label})
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono font-bold ${
                          isPositive
                            ? "text-green-600 dark:text-green-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isPositive ? `+${formatGrams(w)}` : formatGrams(w)}
                      </td>
                      <td className="py-2.5 px-4 text-[var(--text-muted)] truncate max-w-xs">
                        {m.reference || "—"}
                      </td>
                      <td className="py-2.5 px-4 text-[var(--text-secondary)]">
                        {m.createdBy.name}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  icon,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="kpi-card glass-card-hover p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}
        >
          {icon}
        </div>
      </div>
      <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
        {value}
      </div>
      {subtitle && (
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
          {subtitle}
        </p>
      )}
    </div>
  );
}
