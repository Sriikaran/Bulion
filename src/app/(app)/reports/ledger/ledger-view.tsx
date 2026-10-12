"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils/helpers";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ExportButton } from "@/components/reports/export-button";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  BookOpen,
  Calendar,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface CounterpartyOption {
  id: string;
  name: string;
  type: string;
  phone?: string | null;
}

interface LedgerEntryRow {
  id: string;
  date: string | Date;
  eventType: string;
  reference: string;
  description: string;
  debit: string | number;
  credit: string | number;
  runningBalance: string | number;
  isCancelled: boolean;
  paymentMode?: string | null;
}

interface LedgerSummaryData {
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  balanceDirection: "RECEIVABLE" | "PAYABLE" | "SETTLED";
}

interface LedgerViewProps {
  counterparties: CounterpartyOption[];
  selectedCounterpartyId?: string;
  counterpartyInfo?: {
    id: string;
    name: string;
    type: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  entries: LedgerEntryRow[];
  summary: LedgerSummaryData;
  fromDate?: string;
  toDate?: string;
}

export function LedgerView({
  counterparties,
  selectedCounterpartyId,
  counterpartyInfo,
  entries,
  summary,
  fromDate = "",
  toDate = "",
}: LedgerViewProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [counterpartyId, setCounterpartyId] = useState(selectedCounterpartyId || "");
  const [startDate, setStartDate] = useState(fromDate);
  const [endDate, setEndDate] = useState(toDate);

  function applyFilters(newPartyId = counterpartyId, newStart = startDate, newEnd = endDate) {
    if (!newPartyId) return;
    startTransition(() => {
      const params = new URLSearchParams();
      params.set("counterpartyId", newPartyId);
      if (newStart) params.set("fromDate", newStart);
      if (newEnd) params.set("toDate", newEnd);
      router.push(`/reports/ledger?${params.toString()}`);
    });
  }

  function handlePartyChange(id: string) {
    setCounterpartyId(id);
    applyFilters(id, startDate, endDate);
  }

  function handleExport() {
    if (!entries.length) return;
    const partyName = counterpartyInfo?.name || "Counterparty";
    const dateStr = new Date().toISOString().split("T")[0];

    const columns: CsvColumn<LedgerEntryRow>[] = [
      { header: "Date", accessor: (e) => formatDate(e.date) },
      { header: "Event Type", accessor: (e) => e.eventType },
      { header: "Reference No", accessor: (e) => e.reference },
      { header: "Description", accessor: (e) => e.description },
      { header: "Debit (INR)", accessor: (e) => (e.debit !== "0" ? e.debit : "") },
      { header: "Credit (INR)", accessor: (e) => (e.credit !== "0" ? e.credit : "") },
      { header: "Running Balance (INR)", accessor: (e) => e.runningBalance },
      { header: "Payment Mode", accessor: (e) => e.paymentMode || "" },
    ];

    const csv = generateCsv(entries, columns);
    downloadCsv(`bullion-ledger-${partyName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${dateStr}.csv`, csv);
  }

  const cards = [
    {
      label: "Total Debits (+ Receivables / Paid)",
      value: formatCurrency(summary.totalDebit),
      subtitle: "Increases net balance / payments made",
      icon: <ArrowUpRight className="w-4 h-4" />,
      accent: "#3B82F6",
    },
    {
      label: "Total Credits (+ Payables / Received)",
      value: formatCurrency(summary.totalCredit),
      subtitle: "Decreases net balance / receipts received",
      icon: <ArrowDownLeft className="w-4 h-4" />,
      accent: "#10B981",
    },
    {
      label: "Closing Balance",
      value: formatCurrency(Math.abs(Number(summary.closingBalance)).toString()),
      subtitle:
        summary.balanceDirection === "RECEIVABLE"
          ? "Receivable from Counterparty"
          : summary.balanceDirection === "PAYABLE"
          ? "Payable to Counterparty"
          : "Fully Settled (Nil Balance)",
      icon: <Wallet className="w-4 h-4" />,
      accent:
        summary.balanceDirection === "RECEIVABLE"
          ? "#10B981"
          : summary.balanceDirection === "PAYABLE"
          ? "#EF4444"
          : "#6B7280",
    },
    {
      label: "Settlement Status",
      value: summary.balanceDirection,
      subtitle: counterpartyInfo ? `${counterpartyInfo.type} Account` : "No Party Selected",
      icon:
        summary.balanceDirection === "SETTLED" ? (
          <CheckCircle className="w-4 h-4" />
        ) : (
          <AlertCircle className="w-4 h-4" />
        ),
      accent: "#C59A58",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#C59A58]" />
              Counterparty Financial Ledger
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Chronological running statement of purchases, sales, payments, receipts, and settlements.
            </p>
          </div>

          {entries.length > 0 && (
            <ExportButton onExport={handleExport} label="Export Ledger CSV" />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-[var(--border-primary)]/50">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Select Counterparty *
            </label>
            <select
              value={counterpartyId}
              onChange={(e) => handlePartyChange(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-[var(--text-primary)] font-medium focus:outline-none focus:border-[#C59A58]"
            >
              <option value="">-- Choose Supplier or Customer --</option>
              {counterparties.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name} ({cp.type}){cp.phone ? ` - ${cp.phone}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              From Date
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onBlur={() => applyFilters(counterpartyId, startDate, endDate)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-white focus:outline-none focus:border-[#C59A58]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              To Date
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onBlur={() => applyFilters(counterpartyId, startDate, endDate)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-white focus:outline-none focus:border-[#C59A58]"
              />
            </div>
          </div>
        </div>
      </div>

      {counterpartyInfo ? (
        <>
          {/* KPI Summary Cards */}
          <ReportSummaryCards cards={cards} />

          {/* Ledger Table */}
          <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] overflow-hidden">
            <div className="p-4 bg-[var(--bg-card-hover)]/40 border-b border-[var(--border-primary)] flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  Statement for {counterpartyInfo.name}
                </span>
                <span className="ml-2 text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[var(--text-muted)]">
                  {counterpartyInfo.type}
                </span>
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {entries.length} Transaction{entries.length === 1 ? "" : "s"} Recorded
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Reference #</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-3 text-right text-blue-400">Debit (+)</th>
                    <th className="py-3 px-3 text-right text-emerald-400">Credit (-)</th>
                    <th className="py-3 px-4 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)]/40 text-[var(--text-primary)]">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-xs text-[var(--text-muted)]">
                        No financial movements or trade entries found for this counterparty.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => {
                      const balanceNum = Number(entry.runningBalance);
                      return (
                        <tr
                          key={entry.id}
                          className={`hover:bg-[var(--bg-card-hover)]/60 transition-colors ${
                            entry.isCancelled ? "opacity-50" : ""
                          }`}
                        >
                          <td className="py-3 px-4 whitespace-nowrap text-[var(--text-secondary)]">
                            {formatDate(entry.date)}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                entry.eventType.startsWith("PURCHASE")
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : entry.eventType.startsWith("SALE")
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : entry.eventType.startsWith("PAYMENT")
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              }`}
                            >
                              {entry.eventType.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-medium text-[var(--text-primary)] whitespace-nowrap">
                            {entry.reference}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)] max-w-xs truncate">
                            {entry.description}
                            {entry.paymentMode && (
                              <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                                {entry.paymentMode}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-blue-400">
                            {Number(entry.debit) > 0 ? formatCurrency(entry.debit) : "—"}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-emerald-400">
                            {Number(entry.credit) > 0 ? formatCurrency(entry.credit) : "—"}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                            <span
                              className={
                                balanceNum > 0
                                  ? "text-emerald-400"
                                  : balanceNum < 0
                                  ? "text-red-400"
                                  : "text-[var(--text-muted)]"
                              }
                            >
                              {balanceNum > 0 ? "+" : ""}
                              {formatCurrency(balanceNum.toString())}
                            </span>
                            <span className="ml-1 text-[10px] uppercase font-bold text-[var(--text-muted)]">
                              {balanceNum > 0 ? "Dr" : balanceNum < 0 ? "Cr" : ""}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="py-16 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <BookOpen className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">No Counterparty Selected</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
            Please choose a supplier or customer from the dropdown above to view their financial statement and settlement history.
          </p>
        </div>
      )}
    </div>
  );
}
