"use client";

import React from "react";
import { formatCurrency, formatGrams } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { Package, ShieldCheck, ShoppingCart, TrendingDown } from "lucide-react";
import type { CurrentStockReportResult, CurrentStockReportRow } from "@/lib/services/report-service";

interface CurrentStockViewProps {
  report: CurrentStockReportResult;
}

export function CurrentStockView({ report }: CurrentStockViewProps) {
  const { summary, rows } = report;

  const handleExport = () => {
    const columns: CsvColumn<CurrentStockReportRow>[] = [
      { header: "Metal", accessor: (r) => `${r.metalName} (${r.metalCode})` },
      { header: "Purity", accessor: (r) => r.purityLabel },
      { header: "Fineness", accessor: (r) => r.fineness.toString() },
      { header: "Opening (g)", accessor: (r) => r.openingWeightGrams.toString() },
      { header: "Purchased (g)", accessor: (r) => r.purchasedWeightGrams.toString() },
      { header: "Sold (g)", accessor: (r) => r.soldWeightGrams.toString() },
      { header: "Adj In (g)", accessor: (r) => r.adjustmentIncreaseGrams.toString() },
      { header: "Adj Out (g)", accessor: (r) => r.adjustmentDecreaseGrams.toString() },
      { header: "Available (g)", accessor: (r) => r.availableWeightGrams.toString() },
      { header: "Avg Purchase Rate (INR/g)", accessor: (r) => r.averagePurchaseRate.toString() },
      { header: "Total Purchase Value (INR)", accessor: (r) => r.totalPurchaseValue.toString() },
      { header: "Avg Selling Rate (INR/g)", accessor: (r) => r.averageSellingRate.toString() },
      { header: "Total Sales Value (INR)", accessor: (r) => r.totalSalesValue.toString() },
    ];

    const csv = generateCsv(rows, columns);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadCsv(`bullion-current-stock-report-${dateStr}.csv`, csv);
  };

  const cards = [
    {
      label: "Total Gold Available",
      value: formatGrams(summary.totalGoldGrams.toString()),
      subtitle: "Authoritative physical gold balance",
      icon: <Package className="w-4 h-4" />,
      accent: "#C59A58",
    },
    {
      label: "Total Silver Available",
      value: formatGrams(summary.totalSilverGrams.toString()),
      subtitle: "Authoritative physical silver balance",
      icon: <Package className="w-4 h-4" />,
      accent: "#9CA3AF",
    },
    {
      label: "Total Inventory Weight",
      value: formatGrams(summary.totalInventoryGrams.toString()),
      subtitle: `${summary.activeBucketsCount} active (Metal × Purity) buckets`,
      icon: <ShieldCheck className="w-4 h-4" />,
      accent: "#22C55E",
    },
    {
      label: "Cumulative Purchase Valuation",
      value: formatCurrency(summary.totalPurchaseValuation.toString()),
      subtitle: `Sales realized: ${formatCurrency(summary.totalSalesRealized.toString())}`,
      icon: <ShoppingCart className="w-4 h-4" />,
      accent: "#3B82F6",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <ReportSummaryCards cards={cards} />

      {/* Invariant Banner */}
      <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-xs text-[var(--text-secondary)] flex items-center justify-between">
        <span className="font-mono text-[11px]">
          <strong>Core Invariant:</strong> Available = Opening + Purchases - Sales + Adjustment In - Adjustment Out
        </span>
        <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
          Reconciled with StockMovement
        </span>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-primary)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              Current Stock Valuation by Bucket
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Itemized stock balance and weighted valuation per (Metal × Purity).
            </p>
          </div>
          <ExportButton onExport={handleExport} label="Export Stock CSV" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Metal</th>
                <th className="py-3 px-4">Purity (Fineness)</th>
                <th className="py-3 px-3 text-right">Opening</th>
                <th className="py-3 px-3 text-right">Purchases</th>
                <th className="py-3 px-3 text-right">Sales</th>
                <th className="py-3 px-3 text-right">Adj In</th>
                <th className="py-3 px-3 text-right">Adj Out</th>
                <th className="py-3 px-4 text-right">Available Weight</th>
                <th className="py-3 px-3 text-right">Avg Buy Rate</th>
                <th className="py-3 px-3 text-right">Avg Sell Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]/40 text-[var(--text-primary)]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No active stock positions match the criteria.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.metalId}_${row.purityId}`} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                    <td className="py-3 px-4 font-bold">
                      <span className={row.metalCode === "GOLD" ? "text-[#E4BE85]" : "text-gray-300"}>
                        {row.metalName}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold">
                      {row.purityLabel}{" "}
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        ({(parseFloat(row.fineness.toString()) * 100).toFixed(2)}%)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--text-muted)]">
                      {formatGrams(row.openingWeightGrams.toString())}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[#22C55E]">
                      +{formatGrams(row.purchasedWeightGrams.toString())}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[#F59E0B]">
                      -{formatGrams(row.soldWeightGrams.toString())}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-blue-400">
                      +{formatGrams(row.adjustmentIncreaseGrams.toString())}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-red-400">
                      -{formatGrams(row.adjustmentDecreaseGrams.toString())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-[#C59A58] text-sm">
                      {formatGrams(row.availableWeightGrams.toString())}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                      {Number(row.averagePurchaseRate) > 0
                        ? `${formatCurrency(row.averagePurchaseRate.toString())}/g`
                        : "-"}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                      {Number(row.averageSellingRate) > 0
                        ? `${formatCurrency(row.averageSellingRate.toString())}/g`
                        : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-[var(--bg-card-hover)] font-bold text-xs border-t-2 border-[var(--border-primary)]">
                <tr>
                  <td colSpan={7} className="py-3 px-4 uppercase text-[var(--text-muted)]">
                    Total Physical Stock Available:
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold text-[#C59A58] text-sm">
                    {formatGrams(summary.totalInventoryGrams.toString())}
                  </td>
                  <td colSpan={2} className="py-3 px-4 text-right text-[10px] text-[var(--text-muted)]">
                    {summary.activeBucketsCount} tracked buckets
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
