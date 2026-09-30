"use client";

import React from "react";
import { formatCurrency, formatGrams, formatDate } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { TrendingDown, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { SalesRegisterResult, SalesRegisterRow } from "@/lib/services/report-service";

interface SalesRegisterViewProps {
  report: SalesRegisterResult;
}

export function SalesRegisterView({ report }: SalesRegisterViewProps) {
  const { summary, rows } = report;

  const handleExport = () => {
    const columns: CsvColumn<SalesRegisterRow>[] = [
      { header: "Date", accessor: (r) => formatDate(r.date) },
      { header: "Invoice Number", accessor: (r) => r.invoiceNumber },
      { header: "Buyer Name", accessor: (r) => r.buyerName },
      { header: "Buyer Contact", accessor: (r) => r.buyerContact ?? "" },
      { header: "Metal", accessor: (r) => `${r.metalName} (${r.metalCode})` },
      { header: "Purity", accessor: (r) => r.purityLabel },
      { header: "Weight (g)", accessor: (r) => r.weightGrams.toString() },
      { header: "Selling Rate / g", accessor: (r) => r.ratePerGram.toString() },
      { header: "Total Amount (INR)", accessor: (r) => r.totalAmount.toString() },
      { header: "Payment Mode", accessor: (r) => r.paymentMode },
      { header: "Status", accessor: (r) => r.status },
      { header: "Cancel Reason", accessor: (r) => r.cancelReason ?? "" },
      { header: "Notes", accessor: (r) => r.notes ?? "" },
    ];

    const csv = generateCsv(rows, columns);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadCsv(`bullion-sales-register-${dateStr}.csv`, csv);
  };

  const cards = [
    {
      label: "Active Sold Weight",
      value: formatGrams(summary.totalSoldWeightGrams.toString()),
      subtitle: "Sum of POSTED sales only",
      icon: <TrendingDown className="w-4 h-4" />,
      accent: "#F59E0B",
    },
    {
      label: "Active Sales Revenue",
      value: formatCurrency(summary.totalSalesAmount.toString()),
      subtitle: "Realized POSTED turnover",
      icon: <TrendingDown className="w-4 h-4" />,
      accent: "#C59A58",
    },
    {
      label: "Weighted Average Rate",
      value: `${formatCurrency(summary.weightedAverageSellingRate.toString())}/g`,
      subtitle: "Derived: Total Revenue / Total Weight",
      icon: <CheckCircle2 className="w-4 h-4" />,
      accent: "#3B82F6",
    },
    {
      label: "Sales Count",
      value: `${summary.postedCount} Posted`,
      subtitle: `${summary.cancelledCount} Cancelled | ${summary.draftCount} Drafts`,
      icon: <Clock className="w-4 h-4" />,
      accent: "#A855F7",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <ReportSummaryCards cards={cards} />

      {/* Table Container */}
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-primary)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              Sales Register Journal
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Showing {rows.length} total entries. Cancelled sales are visibly flagged and excluded from active sales totals.
            </p>
          </div>
          <ExportButton onExport={handleExport} label="Export Sales CSV" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Buyer</th>
                <th className="py-3 px-4">Metal & Purity</th>
                <th className="py-3 px-4 text-right">Weight</th>
                <th className="py-3 px-4 text-right">Selling Rate / g</th>
                <th className="py-3 px-4 text-right">Total Amount</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]/40 text-[var(--text-primary)]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No sales transactions found matching the applied filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isCancelled = row.status === "CANCELLED";
                  const isDraft = row.status === "DRAFT";

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-[var(--bg-card-hover)] transition-colors ${
                        isCancelled ? "opacity-60 bg-red-500/5 line-through-accent" : ""
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap font-mono">
                        {formatDate(row.date)}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold">
                        {row.invoiceNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold">{row.buyerName}</div>
                        {row.buyerContact && (
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {row.buyerContact}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold">{row.metalName}</span>{" "}
                        <span className="text-[var(--text-muted)]">({row.purityLabel})</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        {formatGrams(row.weightGrams.toString())}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {formatCurrency(row.ratePerGram.toString())}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-[#C59A58]">
                        {formatCurrency(row.totalAmount.toString())}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-[var(--bg-input)] border border-[var(--border-primary)]">
                          {row.paymentMode}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isCancelled ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20"
                            title={row.cancelReason ? `Cancelled: ${row.cancelReason}` : "Cancelled"}
                          >
                            <XCircle className="w-3 h-3" />
                            CANCELLED
                          </span>
                        ) : isDraft ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            DRAFT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            POSTED
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-[var(--bg-card-hover)] font-bold text-xs border-t-2 border-[var(--border-primary)]">
                <tr>
                  <td colSpan={4} className="py-3 px-4 uppercase text-[var(--text-muted)]">
                    Active Posted Totals:
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-[#F59E0B]">
                    {formatGrams(summary.totalSoldWeightGrams.toString())}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[var(--text-muted)]">
                    {formatCurrency(summary.weightedAverageSellingRate.toString())}/g
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold text-[#C59A58]">
                    {formatCurrency(summary.totalSalesAmount.toString())}
                  </td>
                  <td colSpan={2} className="py-3 px-4 text-right text-[10px] text-[var(--text-muted)]">
                    Excludes {summary.cancelledCount} cancelled &amp; {summary.draftCount} draft records
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
