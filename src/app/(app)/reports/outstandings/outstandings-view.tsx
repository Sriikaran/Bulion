"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Search,
  Filter,
  CheckCircle,
  Clock,
  BookOpen,
} from "lucide-react";
import type {
  CounterpartyOutstandingRow,
  CounterpartyOutstandingSummary,
} from "@/lib/services/settlement-service";

interface OutstandingsViewProps {
  initialRows: CounterpartyOutstandingRow[];
  initialSummary: CounterpartyOutstandingSummary;
}

export function OutstandingsView({ initialRows, initialSummary }: OutstandingsViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredRows = initialRows.filter((r) => {
    if (typeFilter !== "ALL" && r.counterpartyType !== typeFilter) return false;
    if (statusFilter === "OUTSTANDING_ONLY" && r.status === "SETTLED") return false;
    if (statusFilter === "SETTLED" && r.status !== "SETTLED") return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = r.counterpartyName.toLowerCase().includes(q);
      const matchPhone = r.counterpartyPhone?.toLowerCase().includes(q);
      if (!matchName && !matchPhone) return false;
    }
    return true;
  });

  const handleExport = () => {
    const columns: CsvColumn<CounterpartyOutstandingRow>[] = [
      { header: "Counterparty", accessor: (r) => r.counterpartyName },
      { header: "Phone", accessor: (r) => r.counterpartyPhone || "" },
      { header: "Type", accessor: (r) => r.counterpartyType },
      { header: "Total Purchases (INR)", accessor: (r) => r.totalPurchases.toString() },
      { header: "Payments Made (INR)", accessor: (r) => r.totalPaymentsMade.toString() },
      { header: "Net Payable (INR)", accessor: (r) => r.netPayable.toString() },
      { header: "Total Sales (INR)", accessor: (r) => r.totalSales.toString() },
      { header: "Receipts Received (INR)", accessor: (r) => r.totalReceiptsReceived.toString() },
      { header: "Net Receivable (INR)", accessor: (r) => r.netReceivable.toString() },
      { header: "Net Balance (INR)", accessor: (r) => r.netBalance.toString() },
      { header: "Status", accessor: (r) => r.status },
    ];

    const csv = generateCsv(filteredRows, columns);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadCsv(`bullion-counterparty-outstandings-${dateStr}.csv`, csv);
  };

  const cards = [
    {
      label: "Total Payables (Suppliers)",
      value: formatCurrency(initialSummary.totalPayables.toString()),
      subtitle: "Unsettled purchase obligations",
      icon: <ArrowUpRight className="w-4 h-4" />,
      accent: "#EF4444",
    },
    {
      label: "Total Receivables (Customers)",
      value: formatCurrency(initialSummary.totalReceivables.toString()),
      subtitle: "Uncollected sales receivables",
      icon: <ArrowDownLeft className="w-4 h-4" />,
      accent: "#10B981",
    },
    {
      label: "Net Market Exposure",
      value: `${Number(initialSummary.netMarketExposure) >= 0 ? "+" : ""}${formatCurrency(
        initialSummary.netMarketExposure.toString(),
      )}`,
      subtitle: "Net receivables minus payables",
      icon: <Wallet className="w-4 h-4" />,
      accent: "#C59A58",
    },
    {
      label: "Counterparty Accounts",
      value: initialSummary.totalCounterparties.toString(),
      subtitle: `${initialSummary.outstandingCount} with active balance, ${initialSummary.settledCount} settled`,
      icon: <Users className="w-4 h-4" />,
      accent: "#6366F1",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <ReportSummaryCards cards={cards} />

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search counterparty name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-white focus:outline-none focus:border-[#C59A58]"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-[var(--text-primary)] font-medium text-xs focus:outline-none focus:border-[#C59A58]"
            >
              <option value="ALL">All Party Types</option>
              <option value="SUPPLIER">Suppliers Only</option>
              <option value="CUSTOMER">Customers Only</option>
              <option value="BOTH">Dual Role (Both)</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-[var(--text-primary)] font-medium text-xs focus:outline-none focus:border-[#C59A58]"
            >
              <option value="ALL">All Balances</option>
              <option value="OUTSTANDING_ONLY">With Outstanding Only</option>
              <option value="SETTLED">Fully Settled Only</option>
            </select>
          </div>
        </div>

        <ExportButton onExport={handleExport} label="Export Outstandings CSV" />
      </div>

      {/* Main Table */}
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Counterparty</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3 text-right">Total Purchases</th>
                <th className="py-3 px-3 text-right">Payments Made</th>
                <th className="py-3 px-3 text-right font-bold text-red-400">Net Payable</th>
                <th className="py-3 px-3 text-right">Total Sales</th>
                <th className="py-3 px-3 text-right">Receipts</th>
                <th className="py-3 px-3 text-right font-bold text-emerald-400">Net Receivable</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]/40 text-[var(--text-primary)]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-xs text-[var(--text-muted)]">
                    No counterparty balances match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.counterpartyId} className="hover:bg-[var(--bg-card-hover)]/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[var(--text-primary)]">{r.counterpartyName}</div>
                      {r.counterpartyPhone && (
                        <div className="text-[11px] text-[var(--text-muted)]">{r.counterpartyPhone}</div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white/5 border border-white/10 text-[var(--text-secondary)]">
                        {r.counterpartyType}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                      {formatCurrency(r.totalPurchases.toString())}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--text-muted)]">
                      {formatCurrency(r.totalPaymentsMade.toString())}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-red-400">
                      {Number(r.netPayable) > 0 ? formatCurrency(r.netPayable.toString()) : "—"}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                      {formatCurrency(r.totalSales.toString())}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--text-muted)]">
                      {formatCurrency(r.totalReceiptsReceived.toString())}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                      {Number(r.netReceivable) > 0 ? formatCurrency(r.netReceivable.toString()) : "—"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {r.status === "SETTLED" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                          <CheckCircle className="w-3 h-3" />
                          Settled
                        </span>
                      )}
                      {r.status === "PAYABLE" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                          <Clock className="w-3 h-3" />
                          Payable
                        </span>
                      )}
                      {r.status === "RECEIVABLE" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Clock className="w-3 h-3" />
                          Receivable
                        </span>
                      )}
                      {r.status === "BALANCED" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Two-Way Bal
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/reports/ledger?counterpartyId=${r.counterpartyId}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#C59A58]/15 hover:bg-[#C59A58]/25 text-[#E4BE85] border border-[#C59A58]/30 transition"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Ledger</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
