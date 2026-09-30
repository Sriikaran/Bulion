"use client";

import React from "react";
import { formatGrams } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { History, ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import type { TransactionHistoryResult, TransactionHistoryRow } from "@/lib/services/report-service";

interface TransactionHistoryViewProps {
  report: TransactionHistoryResult;
}

export function TransactionHistoryView({ report }: TransactionHistoryViewProps) {
  const { summary, rows } = report;

  const handleExport = () => {
    const columns: CsvColumn<TransactionHistoryRow>[] = [
      { header: "Date & Time", accessor: (r) => new Date(r.createdAt).toISOString() },
      { header: "Movement Type", accessor: (r) => r.movementType },
      { header: "Metal", accessor: (r) => `${r.metalName} (${r.metalCode})` },
      { header: "Purity", accessor: (r) => r.purityLabel },
      { header: "Signed Weight (g)", accessor: (r) => r.signedWeightGrams.toString() },
      { header: "Reference", accessor: (r) => r.reference ?? "" },
      { header: "Operator", accessor: (r) => `${r.operatorName} (${r.operatorRole})` },
      { header: "Related Transaction", accessor: (r) => r.relatedInvoiceOrReason ?? "" },
      { header: "Status", accessor: (r) => r.status },
    ];

    const csv = generateCsv(rows, columns);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadCsv(`bullion-transaction-history-ledger-${dateStr}.csv`, csv);
  };

  const isNetPositive = Number(summary.netWeightMovementGrams) >= 0;

  const cards = [
    {
      label: "Total Ledger Movements",
      value: summary.totalMovementsCount.toString(),
      subtitle: "Append-only StockMovement entries",
      icon: <History className="w-4 h-4" />,
      accent: "#EC4899",
    },
    {
      label: "Total Stock Inflow",
      value: `+${formatGrams(summary.totalInflowGrams.toString())}`,
      subtitle: "Purchases, opening & positive adjustments",
      icon: <ArrowDownLeft className="w-4 h-4" />,
      accent: "#22C55E",
    },
    {
      label: "Total Stock Outflow",
      value: `-${formatGrams(summary.totalOutflowGrams.toString())}`,
      subtitle: "Sales & negative adjustments",
      icon: <ArrowUpRight className="w-4 h-4" />,
      accent: "#EF4444",
    },
    {
      label: "Net Ledger Movement",
      value: `${isNetPositive ? "+" : ""}${formatGrams(summary.netWeightMovementGrams.toString())}`,
      subtitle: "Net change in physical inventory",
      icon: <Scale className="w-4 h-4" />,
      accent: isNetPositive ? "#22C55E" : "#EF4444",
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
              StockMovement Ledger Report
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Authoritative append-only transaction ledger. Reversals and cancellations appear as explicit inverse movements.
            </p>
          </div>
          <ExportButton onExport={handleExport} label="Export Ledger CSV" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Event Type</th>
                <th className="py-3 px-4">Metal &amp; Purity</th>
                <th className="py-3 px-4 text-right">Signed Weight</th>
                <th className="py-3 px-4">Reference / Related</th>
                <th className="py-3 px-4">Operator</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]/40 text-[var(--text-primary)]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No transaction ledger records found matching the applied filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isPositive = Number(row.signedWeightGrams) > 0;
                  const isZero = Number(row.signedWeightGrams) === 0;
                  const isCancellation =
                    row.movementType === "PURCHASE_CANCEL" || row.movementType === "SALE_CANCEL";

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-[var(--bg-card-hover)] transition-colors ${
                        isCancellation ? "bg-amber-500/5" : ""
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[var(--text-secondary)]">
                        {new Date(row.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${
                            row.movementType === "PURCHASE"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : row.movementType === "PURCHASE_CANCEL"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : row.movementType === "SALE"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : row.movementType === "SALE_CANCEL"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : row.movementType === "OPENING"
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                              : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                          }`}
                        >
                          {row.movementType}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold">{row.metalName}</span>{" "}
                        <span className="text-[var(--text-muted)]">({row.purityLabel})</span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-extrabold ${
                          isPositive
                            ? "text-emerald-400"
                            : isZero
                            ? "text-[var(--text-muted)]"
                            : "text-rose-400"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {formatGrams(row.signedWeightGrams.toString())}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--text-primary)]">
                          {row.reference || "-"}
                        </div>
                        {row.relatedInvoiceOrReason && (
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {row.relatedInvoiceOrReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        <div className="font-medium">{row.operatorName}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{row.operatorRole}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-primary)]">
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-[var(--bg-card-hover)] font-bold text-xs border-t-2 border-[var(--border-primary)]">
                <tr>
                  <td colSpan={3} className="py-3 px-4 uppercase text-[var(--text-muted)]">
                    Net Ledger Signed Movement:
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold text-sm">
                    {Number(summary.netWeightMovementGrams) >= 0 ? "+" : ""}
                    {formatGrams(summary.netWeightMovementGrams.toString())}
                  </td>
                  <td colSpan={3} className="py-3 px-4 text-right text-[10px] text-[var(--text-muted)]">
                    Inflow: +{formatGrams(summary.totalInflowGrams.toString())} | Outflow: -{formatGrams(summary.totalOutflowGrams.toString())}
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
