"use client";

import React from "react";
import { formatCurrency, formatGrams } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { UserCheck, TrendingDown, CheckCircle2, Award } from "lucide-react";
import type { BuyerWiseSalesResult, BuyerWiseSalesRow } from "@/lib/services/report-service";

interface BuyerWiseViewProps {
  report: BuyerWiseSalesResult;
}

export function BuyerWiseView({ report }: BuyerWiseViewProps) {
  const { summary, rows } = report;

  const handleExport = () => {
    const columns: CsvColumn<BuyerWiseSalesRow>[] = [
      { header: "Buyer Name", accessor: (r) => r.buyerName },
      { header: "Contact", accessor: (r) => r.buyerContact ?? "" },
      { header: "Number of Sales", accessor: (r) => r.saleCount },
      { header: "Total Weight Sold (g)", accessor: (r) => r.totalWeightGrams.toString() },
      { header: "Total Sales Amount (INR)", accessor: (r) => r.totalSalesAmount.toString() },
      { header: "Weighted Average Selling Rate (INR/g)", accessor: (r) => r.weightedAverageSellingRate.toString() },
    ];

    const csv = generateCsv(rows, columns);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadCsv(`bullion-buyer-wise-sales-${dateStr}.csv`, csv);
  };

  const cards = [
    {
      label: "Active Buyers",
      value: summary.uniqueBuyersCount.toString(),
      subtitle: `${summary.totalSalesCount} posted sales transactions`,
      icon: <UserCheck className="w-4 h-4" />,
      accent: "#8B5CF6",
    },
    {
      label: "Total Sold Weight",
      value: formatGrams(summary.totalSoldWeightGrams.toString()),
      subtitle: "Combined across all buyers",
      icon: <TrendingDown className="w-4 h-4" />,
      accent: "#F59E0B",
    },
    {
      label: "Total Sales Revenue",
      value: formatCurrency(summary.totalSalesAmount.toString()),
      subtitle: "Realized buyer receivables",
      icon: <TrendingDown className="w-4 h-4" />,
      accent: "#C59A58",
    },
    {
      label: "Overall Weighted Rate",
      value: `${formatCurrency(summary.overallWeightedAverageRate.toString())}/g`,
      subtitle: "Total Revenue / Total Weight",
      icon: <CheckCircle2 className="w-4 h-4" />,
      accent: "#22C55E",
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
              Buyer Sales Aggregation
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Grouped by buyer. Excludes cancelled transactions. Weighted average selling rate derived per buyer.
            </p>
          </div>
          <ExportButton onExport={handleExport} label="Export Buyer CSV" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Buyer</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4 text-center">Sales Count</th>
                <th className="py-3 px-4 text-right">Total Weight Sold</th>
                <th className="py-3 px-4 text-right">Total Sales Revenue</th>
                <th className="py-3 px-4 text-right">Weighted Avg Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]/40 text-[var(--text-primary)]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No buyer sales transactions match the applied filters.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                    <td className="py-3 px-4 font-bold">
                      <div className="flex items-center gap-2">
                        {idx === 0 && <Award className="w-3.5 h-3.5 text-[#C59A58]" />}
                        <span>{row.buyerName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {row.buyerContact || "-"}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-semibold">
                      {row.saleCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#F59E0B]">
                      {formatGrams(row.totalWeightGrams.toString())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-[#C59A58]">
                      {formatCurrency(row.totalSalesAmount.toString())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatCurrency(row.weightedAverageSellingRate.toString())}/g
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-[var(--bg-card-hover)] font-bold text-xs border-t-2 border-[var(--border-primary)]">
                <tr>
                  <td colSpan={2} className="py-3 px-4 uppercase text-[var(--text-muted)]">
                    All Buyers Total:
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold">
                    {summary.totalSalesCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-[#F59E0B]">
                    {formatGrams(summary.totalSoldWeightGrams.toString())}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold text-[#C59A58]">
                    {formatCurrency(summary.totalSalesAmount.toString())}
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
