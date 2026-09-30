"use client";

import React from "react";
import { formatCurrency, formatGrams } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { DollarSign, TrendingUp, Percent, Info, ShieldCheck } from "lucide-react";
import type { BullionProfitResult, BucketProfitRow } from "@/lib/services/report-service";

interface ProfitReportViewProps {
  report: BullionProfitResult;
}

export function ProfitReportView({ report }: ProfitReportViewProps) {
  const { summary, bucketRows, methodologyExplanation } = report;

  const handleExport = () => {
    const columns: CsvColumn<BucketProfitRow>[] = [
      { header: "Metal", accessor: (r) => `${r.metalName} (${r.metalCode})` },
      { header: "Purity", accessor: (r) => r.purityLabel },
      { header: "Sold Weight (g)", accessor: (r) => r.soldWeightGrams.toString() },
      { header: "Sales Revenue (INR)", accessor: (r) => r.salesValue.toString() },
      { header: "Unit Cost Basis (INR/g)", accessor: (r) => r.unitCostBasis.toString() },
      { header: "Total Cost Basis (INR)", accessor: (r) => r.totalCostBasis.toString() },
      { header: "Realized Gross Profit (INR)", accessor: (r) => r.grossProfit.toString() },
      { header: "Profit Margin (%)", accessor: (r) => `${r.profitMarginPercent.toString()}%` },
    ];

    const csv = generateCsv(bucketRows, columns);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadCsv(`bullion-profit-report-${dateStr}.csv`, csv);
  };

  const isProfitPositive = Number(summary.totalGrossProfit) >= 0;

  const cards = [
    {
      label: "Realized Sales Revenue",
      value: formatCurrency(summary.totalSalesValue.toString()),
      subtitle: `${formatGrams(summary.totalSoldWeightGrams.toString())} sold in period`,
      icon: <DollarSign className="w-4 h-4" />,
      accent: "#C59A58",
    },
    {
      label: "Cost of Goods Sold (Cost Basis)",
      value: formatCurrency(summary.totalCostBasis.toString()),
      subtitle: "Weighted avg purchase acquisition cost",
      icon: <ShieldCheck className="w-4 h-4" />,
      accent: "#64748B",
    },
    {
      label: "Realized Gross Profit",
      value: `${isProfitPositive ? "+" : ""}${formatCurrency(summary.totalGrossProfit.toString())}`,
      subtitle: "Sales Revenue - Cost Basis",
      icon: <TrendingUp className="w-4 h-4" />,
      accent: isProfitPositive ? "#10B981" : "#EF4444",
    },
    {
      label: "Gross Profit Margin",
      value: `${Number(summary.overallProfitMarginPercent || 0).toFixed(2)}%`,
      subtitle: "Gross Profit / Sales Revenue",
      icon: <Percent className="w-4 h-4" />,
      accent: isProfitPositive ? "#10B981" : "#EF4444",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Methodology Banner */}
      <div className="p-4 rounded-2xl bg-[#C59A58]/10 border border-[#C59A58]/30 text-xs text-[#E4BE85] flex items-start gap-3">
        <Info className="w-4 h-4 text-[#C59A58] shrink-0 mt-0.5" />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white uppercase tracking-wider text-[11px]">
              Profit Method: {summary.methodology}
            </span>
            <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold bg-[#C59A58]/20 text-[#E4BE85] border border-[#C59A58]/30">
              V1 Authoritative Cost Derivation
            </span>
          </div>
          <p className="mt-1 leading-relaxed text-[#D9CCC1]">{methodologyExplanation}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <ReportSummaryCards cards={cards} />

      {/* Bucket Breakdown Table */}
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-primary)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              Realized Profit Breakdown by Bucket
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Per-bucket unit cost basis, realized sales turnover, gross profit, and margin percentages.
            </p>
          </div>
          <ExportButton onExport={handleExport} label="Export Profit CSV" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Precious Metal</th>
                <th className="py-3 px-4">Purity</th>
                <th className="py-3 px-3 text-right">Sold Weight</th>
                <th className="py-3 px-3 text-right">Sales Revenue</th>
                <th className="py-3 px-3 text-right">Unit Cost Basis</th>
                <th className="py-3 px-3 text-right">Total Cost Basis</th>
                <th className="py-3 px-4 text-right">Gross Profit</th>
                <th className="py-3 px-4 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]/40 text-[var(--text-primary)]">
              {bucketRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No sales recorded in the selected period to calculate realized profit.
                  </td>
                </tr>
              ) : (
                bucketRows.map((row, idx) => {
                  const isRowProfitable = Number(row.grossProfit) >= 0;

                  return (
                    <tr key={idx} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                      <td className="py-3 px-4 font-bold text-white">
                        {row.metalName} ({row.metalCode})
                      </td>
                      <td className="py-3 px-4 font-semibold text-[var(--text-secondary)]">
                        {row.purityLabel}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-[#F59E0B]">
                        {formatGrams(row.soldWeightGrams.toString())}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-[#C59A58]">
                        {formatCurrency(row.salesValue.toString())}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-muted)]">
                        {formatCurrency(row.unitCostBasis.toString())}/g
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                        {formatCurrency(row.totalCostBasis.toString())}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-extrabold ${
                          isRowProfitable ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isRowProfitable ? "+" : ""}
                        {formatCurrency(row.grossProfit.toString())}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          isRowProfitable ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {Number(row.profitMarginPercent || 0).toFixed(2)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {bucketRows.length > 0 && (
              <tfoot className="bg-[var(--bg-card-hover)] font-bold text-xs border-t-2 border-[var(--border-primary)]">
                <tr>
                  <td colSpan={2} className="py-3 px-4 uppercase text-[var(--text-muted)]">
                    Total Realized Portfolio:
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-[#F59E0B]">
                    {formatGrams(summary.totalSoldWeightGrams.toString())}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-extrabold text-[#C59A58]">
                    {formatCurrency(summary.totalSalesValue.toString())}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[var(--text-muted)]">-</td>
                  <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                    {formatCurrency(summary.totalCostBasis.toString())}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono font-extrabold ${
                      isProfitPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isProfitPositive ? "+" : ""}
                    {formatCurrency(summary.totalGrossProfit.toString())}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono font-bold ${
                      isProfitPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {Number(summary.overallProfitMarginPercent || 0).toFixed(2)}%
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
