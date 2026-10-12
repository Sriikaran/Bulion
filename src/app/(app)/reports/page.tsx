import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { requireUser } from "@/lib/auth/session";
import { getCurrentStockReport } from "@/lib/services/report-service";
import { prisma } from "@/lib/db/client";
import { formatCurrency, formatGrams } from "@/lib/utils/helpers";
import {
  ShoppingCart,
  TrendingDown,
  Package,
  Users,
  UserCheck,
  Scale,
  DollarSign,
  History,
  BarChart3,
  ArrowRight,
  ShieldAlert,
  Lock,
  TrendingUp,
  Calculator,
} from "lucide-react";

export const metadata = { title: "Reports — Bullion" };

export default async function ReportsHubPage() {
  const user = await requireUser();

  const [stockReport, purchaseAgg, saleAgg] = await Promise.all([
    getCurrentStockReport(),
    prisma.purchase.aggregate({
      where: { status: "POSTED" },
      _sum: { totalAmount: true, weightGrams: true },
    }),
    prisma.sale.aggregate({
      where: { status: "POSTED" },
      _sum: { totalAmount: true, weightGrams: true },
    }),
  ]);

  const cards = [
    {
      label: "Gold Stock Available",
      value: formatGrams(stockReport.summary.totalGoldGrams.toString()),
      subtitle: "Authoritative physical gold balance",
      icon: <Package className="w-4 h-4" />,
      accent: "#C59A58",
    },
    {
      label: "Silver Stock Available",
      value: formatGrams(stockReport.summary.totalSilverGrams.toString()),
      subtitle: "Authoritative physical silver balance",
      icon: <Package className="w-4 h-4" />,
      accent: "#9CA3AF",
    },
    {
      label: "Total Posted Purchases",
      value: formatCurrency(purchaseAgg._sum.totalAmount?.toString() ?? "0"),
      subtitle: `${formatGrams(purchaseAgg._sum.weightGrams?.toString() ?? "0")} acquired`,
      icon: <ShoppingCart className="w-4 h-4" />,
      accent: "#22C55E",
    },
    {
      label: "Total Posted Sales",
      value: formatCurrency(saleAgg._sum.totalAmount?.toString() ?? "0"),
      subtitle: `${formatGrams(saleAgg._sum.weightGrams?.toString() ?? "0")} sold`,
      icon: <TrendingDown className="w-4 h-4" />,
      accent: "#F59E0B",
    },
  ];

  const reportItems = [
    {
      title: "Purchase Register",
      description:
        "Itemized record of all bullion purchase invoices, rates, payment modes, and supplier information with active vs cancelled reconciliation.",
      href: "/reports/purchases",
      icon: ShoppingCart,
      accent: "#22C55E",
      role: "STAFF",
    },
    {
      title: "Sales Register",
      description:
        "Comprehensive sales invoice journal with buyers, selling rates, and real-time revenue reconciliation.",
      href: "/reports/sales",
      icon: TrendingDown,
      accent: "#F59E0B",
      role: "STAFF",
    },
    {
      title: "Current Stock Report",
      description:
        "Authoritative stock balance breakdown per (Metal × Purity) satisfying: Available = Opening + Purchases - Sales ± Adjustments.",
      href: "/reports/stock",
      icon: Package,
      accent: "#C59A58",
      role: "STAFF",
    },
    {
      title: "Supplier-wise Purchase",
      description:
        "Grouped purchases by supplier detailing purchase count, total weight, acquisition value, and mathematically weighted average rate.",
      href: "/reports/suppliers",
      icon: Users,
      accent: "#3B82F6",
      role: "STAFF",
    },
    {
      title: "Buyer-wise Sales",
      description:
        "Grouped sales by buyer showing transaction volume, total weight sold, sales value, and mathematically weighted average rate.",
      href: "/reports/buyers",
      icon: UserCheck,
      accent: "#8B5CF6",
      role: "STAFF",
    },
    {
      title: "Purchase vs Sales",
      description:
        "Comparative period trade flow report analyzing acquisition vs sales volume, value differences, and net flow per bucket.",
      href: "/reports/purchase-vs-sales",
      icon: Scale,
      accent: "#06B6D4",
      role: "STAFF",
    },
    {
      title: "Bullion Profit Report",
      description:
        "Realized gross profit analysis derived strictly using the Weighted Average Cost Basis methodology across posted transactions.",
      href: "/reports/profit",
      icon: DollarSign,
      accent: "#10B981",
      role: "ADMIN",
    },
    {
      title: "Transaction History",
      description:
        "Complete append-only StockMovement ledger report showing signed movements, audit linkages, and reversal tracking.",
      href: "/reports/transactions",
      icon: History,
      accent: "#EC4899",
      role: "STAFF",
    },
    {
      title: "Counterparty Outstandings (V2)",
      description:
        "Track real-time payables to suppliers and receivables from buyers derived from actual financial settlements.",
      href: "/reports/outstandings",
      icon: Users,
      accent: "#6366F1",
      role: "STAFF",
    },
    {
      title: "Party Financial Ledger (V2)",
      description:
        "Chronological running account statement of debits, credits, invoices, payments, and receipts per counterparty.",
      href: "/reports/ledger",
      icon: BarChart3,
      accent: "#C59A58",
      role: "STAFF",
    },
    {
      title: "Physical Fulfilment Report (V3.2)",
      description:
        "Physical delivery tracking showing agreed vs fulfilled weights, pending physical stock commitments, and partial deliveries.",
      href: "/reports/fulfilment",
      icon: Package,
      accent: "#10B981",
      role: "STAFF",
    },
    {
      title: "Rate Blocks & Reservations Report (V3.3)",
      description:
        "Active, consumed, and expired commercial rate blocks temporarily reserving price/weight for unfixed bullion deals.",
      href: "/reports/rate-reservations",
      icon: Lock,
      accent: "#C59A58",
      role: "STAFF",
    },
    {
      title: "Market Reference Rates Report (V3.4)",
      description:
        "Time-series log of benchmark market rates per metal & purity for quoting and operational baseline pricing.",
      href: "/reports/market-rates",
      icon: TrendingUp,
      accent: "#3B82F6",
      role: "STAFF",
    },
    {
      title: "Commercial Quotes Report (V3.5)",
      description:
        "Historical log of calculated commercial quotes, margin rules applied, and downstream rate reservations.",
      href: "/reports/quotes",
      icon: Calculator,
      accent: "#10B981",
      role: "STAFF",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Business Intelligence"
        subtitle="Authoritative transaction registers, inventory reconciliation, counterparty summaries, and profit analytics"
      />

      <ReportsNav />

      {/* KPI Summary Cards */}
      <ReportSummaryCards cards={cards} />

      {/* Reports Directory */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Standard V1 Bullion Reports
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportItems.map((item) => {
            const Icon = item.icon;
            const isRestricted = item.role === "ADMIN" && user.role !== "ADMIN";

            return (
              <div
                key={item.href}
                className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] flex flex-col justify-between hover:border-[var(--accent-border)] transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center border"
                      style={{
                        background: `${item.accent}15`,
                        borderColor: `${item.accent}30`,
                        color: item.accent,
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    {item.role === "ADMIN" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                        ADMIN ONLY
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-sm text-[var(--text-primary)] group-hover:text-[#C59A58] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-3 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-[var(--border-primary)]/40 flex items-center justify-between">
                  {isRestricted ? (
                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 italic">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                      Requires ADMIN role
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className="text-xs font-semibold text-[#C59A58] hover:text-[#E4BE85] inline-flex items-center gap-1.5 transition-colors"
                    >
                      <span>Open Report</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
