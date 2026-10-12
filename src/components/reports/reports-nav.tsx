"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ShoppingCart,
  TrendingDown,
  Package,
  Users,
  UserCheck,
  Scale,
  DollarSign,
  History,
  PackageCheck,
  Lock,
  TrendingUp,
  Calculator,
} from "lucide-react";

const REPORT_TABS = [
  { label: "Overview", href: "/reports", icon: BarChart3 },
  { label: "Purchase Register", href: "/reports/purchases", icon: ShoppingCart },
  { label: "Sales Register", href: "/reports/sales", icon: TrendingDown },
  { label: "Quotes", href: "/reports/quotes", icon: Calculator },
  { label: "Market Rates", href: "/reports/market-rates", icon: TrendingUp },
  { label: "Rate Reservations", href: "/reports/rate-reservations", icon: Lock },
  { label: "Fulfilments", href: "/reports/fulfilment", icon: PackageCheck },
  { label: "Current Stock", href: "/reports/stock", icon: Package },
  { label: "Supplier-wise", href: "/reports/suppliers", icon: Users },
  { label: "Buyer-wise", href: "/reports/buyers", icon: UserCheck },
  { label: "Purchase vs Sales", href: "/reports/purchase-vs-sales", icon: Scale },
  { label: "Bullion Profit", href: "/reports/profit", icon: DollarSign },
  { label: "Transaction History", href: "/reports/transactions", icon: History },
  { label: "Outstandings", href: "/reports/outstandings", icon: Users },
  { label: "Party Ledger", href: "/reports/ledger", icon: BarChart3 },
];

export function ReportsNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-[var(--border-primary)]">
      {REPORT_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          tab.href === "/reports"
            ? pathname === "/reports"
            : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
              isActive
                ? "bg-[#4D2D20] text-white shadow-sm border border-[#7A5035]/60"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#E4BE85]" : "text-[var(--text-muted)]"}`} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
