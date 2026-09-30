"use client";

import React from "react";
import { formatCurrency, formatGrams } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { ShoppingCart, TrendingDown, Scale, Info, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { PurchaseVsSalesResult, BucketComparativeFlow } from "@/lib/services/report-service";

interface PurchaseVsSalesViewProps {
  report: PurchaseVsSalesResult;
}

export function PurchaseVsSalesView({ report }: PurchaseVsSalesViewProps) {
  const { summary, bucketRows, reportNote } = report;

  const handleExport = () => {
    const columns: CsvColumn<BucketComparativeFlow>[] = [
      { header: "Metal", accessor: (r) => `${r.metalName} (${r.metalCode})` },
      { header: "Purity", accessor: (r) => r.purityLabel },
      { header: "Purchase Weight (g)", accessor: (r) => r.purchaseWeightGrams.toString() },
      { header: "Purchase Value (INR)", accessor: (r) => r.purchaseAmount.toString() },
      { header: "Purchase Avg Rate (INR/g)", accessor: (r) => r.purchaseAverageRate.toString() },
      { header: "Sales Weight (g)", accessor: (r) => r.salesWeightGrams.toString() },
      { header: "Sales Value (INR)", accessor: (r) => r.salesAmount.toString() },
      { header: "Sales Avg Rate (INR/g)", accessor: (r) => r.salesAverageRate.toString() },
      { header: "Net Weight Diff (g)", accessor: (r) => r.differenceWeightGrams.toString() },
      { header: "Net Value Diff (INR)", accessor: (r) => r.differenceAmount.toString() },
    ];

    const csv = generateCsv(bucketRows, columns);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadCsv(`bullion-purchase-vs-sales-${dateStr}.csv`, csv);
  };

  const isNetInflowWeight = Number(summary.differenceWeightGrams) >= 0;
  const isNetInflowValue = Number(summary.differenceAmount) >= 0;

  const cards = [
    {
      label: "Period Purchases",
      value: formatGrams(summary.purchaseWeightGrams.toString()),
      subtitle: `${formatCurrency(summary.purchaseAmount.toString())} (${summary.purchaseCount} orders)`,
      icon: <ShoppingCart className="w-4 h-4" />,
      accent: "#22C55E",
    },
    {
      label: "Period Sales",
      value: formatGrams(summary.salesWeightGrams.toString()),
      subtitle: `${formatCurrency(summary.salesAmount.toString())} (${summary.salesCount} orders)`,
      icon: <TrendingDown className="w-4 h-4" />,
      accent: "#F59E0B",
    },
    {
      label: "Net Weight Trade Flow",
      value: `${isNetInflowWeight ? "+" : ""}${formatGrams(summary.differenceWeightGrams.toString())}`,
      subtitle: isNetInflowWeight ? "Net physical acquisition" : "Net physical reduction",
      icon: <Scale className="w-4 h-4" />,
      accent: isNetInflowWeight ? "#22C55E" : "#EF4444",
    },
    {
      label: "Net Financial Trade Flow",
      value: `${isNetInflowValue ? "+" : ""}${formatCurrency(summary.differenceAmount.toString())}`,
      subtitle: isNetInflowValue ? "Net cash invested in stock" : "Net cash surplus extracted",
      icon: <Scale className="w-4 h-4" />,
      accent: "#3B82F6",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-blue-200">Comparative Period Analysis</p>
          <p className="mt-0.5 leading-relaxed text-blue-300/90">{reportNote}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <ReportSummaryCards cards={cards} />

      {/* Rates Comparison Sub-Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Weighted Avg Purchase Rate
            </p>
            <p className="text-xl font-extrabold text-[var(--text-primary)] font-mono mt-1">
              {formatCurrency(summary.purchaseAverageRate.toString())}/g
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Based on {formatGrams(summary.purchaseWeightGrams.toString())} purchased
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Weighted Avg Sales Rate
            </p>
            <p className="text-xl font-extrabold text-[var(--text-primary)] font-mono mt-1">
              {formatCurrency(summary.salesAverageRate.toString())}/g
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Based on {formatGrams(summary.salesWeightGrams.toString())} sold
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Bucket Breakdown Table */}
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-primary)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              Bucket Comparative Flow Breakdown
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Period comparison of purchases vs sales broken down by precious metal and purity.
            </p>
          </div>
          <ExportButton onExport={handleExport} label="Export Comparison CSV" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Metal &amp; Purity</th>
                <th className="py-3 px-3 text-right">Purchase Weight</th>
                <th className="py-3 px-3 text-right">Purchase Value</th>
                <th className="py-3 px-3 text-right">Purchase Rate</th>
                <th className="py-3 px-3 text-right">Sales Weight</th>
                <th className="py-3 px-3 text-right">Sales Value</th>
                <th className="py-3 px-3 text-right">Sales Rate</th>
                <th className="py-3 px-4 text-right">Net Weight Diff</th>
                <th className="py-3 px-4 text-right">Net Value Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]/40 text-[var(--text-primary)]">
              {bucketRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No transactions recorded for the selected period and criteria.
                  </td>
                </tr>
              ) : (
                bucketRows.map((b, idx) => {
                  const netWeightPos = Number(b.differenceWeightGrams) >= 0;
                  const netValPos = Number(b.differenceAmount) >= 0;

                  return (
                    <tr key={idx} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                      <td className="py-3 px-4 font-bold">
                        <span>{b.metalName}</span>{" "}
                        <span className="text-[var(--text-muted)]">({b.purityLabel})</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[#22C55E]">
                        {formatGrams(b.purchaseWeightGrams.toString())}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[#C59A58]">
                        {formatCurrency(b.purchaseAmount.toString())}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                        {Number(b.purchaseAverageRate) > 0
                          ? `${formatCurrency(b.purchaseAverageRate.toString())}/g`
                          : "-"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[#F59E0B]">
                        {formatGrams(b.salesWeightGrams.toString())}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[#C59A58]">
                        {formatCurrency(b.salesAmount.toString())}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                        {Number(b.salesAverageRate) > 0
                          ? `${formatCurrency(b.salesAverageRate.toString())}/g`
                          : "-"}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          netWeightPos ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {netWeightPos ? "+" : ""}
                        {formatGrams(b.differenceWeightGrams.toString())}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          netValPos ? "text-blue-400" : "text-amber-400"
                        }`}
                      >
                        {netValPos ? "+" : ""}
                        {formatCurrency(b.differenceAmount.toString())}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {bucketRows.length > 0 && (
              <tfoot className="bg-[var(--bg-card-hover)] font-bold text-xs border-t-2 border-[var(--border-primary)]">
                <tr>
                  <td className="py-3 px-4 uppercase text-[var(--text-muted)]">
                    Total Period Trade:
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-[#22C55E]">
                    {formatGrams(summary.purchaseWeightGrams.toString())}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-extrabold text-[#C59A58]">
                    {formatCurrency(summary.purchaseAmount.toString())}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[var(--text-muted)]">
                    {formatCurrency(summary.purchaseAverageRate.toString())}/g
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-[#F59E0B]">
                    {formatGrams(summary.salesWeightGrams.toString())}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-extrabold text-[#C59A58]">
                    {formatCurrency(summary.salesAmount.toString())}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[var(--text-muted)]">
                    {formatCurrency(summary.salesAverageRate.toString())}/g
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold">
                    {Number(summary.differenceWeightGrams) >= 0 ? "+" : ""}
                    {formatGrams(summary.differenceWeightGrams.toString())}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold">
                    {Number(summary.differenceAmount) >= 0 ? "+" : ""}
                    {formatCurrency(summary.differenceAmount.toString())}
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
