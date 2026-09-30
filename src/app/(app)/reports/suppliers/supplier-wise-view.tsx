"use client";

import React from "react";
import { formatCurrency, formatGrams } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { Users, ShoppingCart, CheckCircle2, Award } from "lucide-react";
import type { SupplierWisePurchaseResult, SupplierWisePurchaseRow } from "@/lib/services/report-service";

interface SupplierWiseViewProps {
  report: SupplierWisePurchaseResult;
}

export function SupplierWiseView({ report }: SupplierWiseViewProps) {
  const { summary, rows } = report;

  const handleExport = () => {
    const columns: CsvColumn<SupplierWisePurchaseRow>[] = [
      { header: "Supplier Name", accessor: (r) => r.supplierName },
      { header: "Contact", accessor: (r) => r.supplierContact ?? "" },
      { header: "Number of Purchases", accessor: (r) => r.purchaseCount },
      { header: "Total Weight (g)", accessor: (r) => r.totalWeightGrams.toString() },
      { header: "Total Purchase Amount (INR)", accessor: (r) => r.totalPurchaseAmount.toString() },
      { header: "Weighted Average Rate (INR/g)", accessor: (r) => r.weightedAverageRate.toString() },
    ];

    const csv = generateCsv(rows, columns);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadCsv(`bullion-supplier-wise-purchases-${dateStr}.csv`, csv);
  };

  const cards = [
    {
      label: "Active Suppliers",
      value: summary.uniqueSuppliersCount.toString(),
      subtitle: `${summary.totalPurchasesCount} posted purchases`,
      icon: <Users className="w-4 h-4" />,
      accent: "#3B82F6",
    },
    {
      label: "Total Acquired Weight",
      value: formatGrams(summary.totalPurchaseWeightGrams.toString()),
      subtitle: "All suppliers combined",
      icon: <ShoppingCart className="w-4 h-4" />,
      accent: "#22C55E",
    },
    {
      label: "Total Purchase Value",
      value: formatCurrency(summary.totalPurchaseAmount.toString()),
      subtitle: "Total posted supplier payables",
      icon: <ShoppingCart className="w-4 h-4" />,
      accent: "#C59A58",
    },
    {
      label: "Overall Weighted Rate",
      value: `${formatCurrency(summary.overallWeightedAverageRate.toString())}/g`,
      subtitle: "Total Value / Total Weight",
      icon: <CheckCircle2 className="w-4 h-4" />,
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
              Supplier Purchase Aggregation
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Grouped by supplier. Excludes cancelled transactions. Weighted average rate derived per supplier.
            </p>
          </div>
          <ExportButton onExport={handleExport} label="Export Supplier CSV" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4 text-center">Purchases</th>
                <th className="py-3 px-4 text-right">Total Weight</th>
                <th className="py-3 px-4 text-right">Total Purchase Value</th>
                <th className="py-3 px-4 text-right">Weighted Avg Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]/40 text-[var(--text-primary)]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No supplier purchase transactions match the applied filters.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                    <td className="py-3 px-4 font-bold">
                      <div className="flex items-center gap-2">
                        {idx === 0 && <Award className="w-3.5 h-3.5 text-[#C59A58]" />}
                        <span>{row.supplierName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {row.supplierContact || "-"}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-semibold">
                      {row.purchaseCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#22C55E]">
                      {formatGrams(row.totalWeightGrams.toString())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-[#C59A58]">
                      {formatCurrency(row.totalPurchaseAmount.toString())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatCurrency(row.weightedAverageRate.toString())}/g
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-[var(--bg-card-hover)] font-bold text-xs border-t-2 border-[var(--border-primary)]">
                <tr>
                  <td colSpan={2} className="py-3 px-4 uppercase text-[var(--text-muted)]">
                    All Suppliers Total:
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold">
                    {summary.totalPurchasesCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-[#22C55E]">
                    {formatGrams(summary.totalPurchaseWeightGrams.toString())}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold text-[#C59A58]">
                    {formatCurrency(summary.totalPurchaseAmount.toString())}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {formatCurrency(summary.overallWeightedAverageRate.toString())}/g
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
