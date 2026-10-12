"use client";

import React, { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import {
  Clock,
  CheckCircle2,
  Filter,
  RotateCcw,
  Search,
  Sparkles,
  Layers,
} from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { MarketRateReportResult, MarketRateRow } from "@/lib/services/market-rate-service";

interface MarketRatesReportViewProps {
  report: MarketRateReportResult;
  metals: Array<{ id: string; name: string; code: string }>;
  purities: Array<{ id: string; label: string; metalId: string }>;
}

export function MarketRatesReportView({
  report,
  metals,
  purities,
}: MarketRatesReportViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { summary, rates, currentRates } = report;

  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");
  const [metalId, setMetalId] = useState(searchParams.get("metalId") ?? "");
  const [purityId, setPurityId] = useState(searchParams.get("purityId") ?? "");
  const [source, setSource] = useState(searchParams.get("source") ?? "");

  const filteredPurities = metalId
    ? purities.filter((p) => p.metalId === metalId)
    : purities;

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams();

    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (metalId) params.set("metalId", metalId);
    if (purityId) params.set("purityId", purityId);
    if (source) params.set("source", source);

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleReset = () => {
    setDateFrom("");
    setDateTo("");
    setMetalId("");
    setPurityId("");
    setSource("");
    router.push(pathname);
  };

  const handleExportCsv = () => {
    const columns: CsvColumn<MarketRateRow>[] = [
      { header: "Effective From", accessor: (r) => formatDate(r.effectiveFrom) },
      { header: "Effective To", accessor: (r) => (r.effectiveTo ? formatDate(r.effectiveTo) : "Active / Open") },
      { header: "Metal", accessor: (r) => r.metalName },
      { header: "Purity", accessor: (r) => r.purityLabel },
      { header: "Rate / Gram (INR)", accessor: (r) => r.ratePerGram },
      { header: "Source", accessor: (r) => r.source || "—" },
      { header: "Status", accessor: (r) => (r.isCurrent ? "CURRENT" : new Date(r.effectiveFrom) > new Date() ? "SCHEDULED" : "HISTORICAL") },
      { header: "Entered By", accessor: (r) => r.createdByName },
      { header: "Notes", accessor: (r) => r.notes || "" },
    ];
    const csv = generateCsv(rates, columns);
    downloadCsv(csv, `bullion-market-rates-report-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const cards = [
    {
      label: "Active Benchmark Rates",
      value: summary.activeQuotedCount.toString(),
      subtitle: "Current metal/purity quotes",
      icon: <Layers className="w-4 h-4" />,
      accent: "#3B82F6",
    },
    {
      label: "Gold 24K Benchmark",
      value: summary.gold24kRate ? `${formatCurrency(summary.gold24kRate)}/g` : "Not Quoted",
      subtitle: "Benchmark reference rate",
      icon: <Sparkles className="w-4 h-4" />,
      accent: "#C59A58",
    },
    {
      label: "Silver 999 Benchmark",
      value: summary.silver999Rate ? `${formatCurrency(summary.silver999Rate)}/g` : "Not Quoted",
      subtitle: "Benchmark reference rate",
      icon: <Sparkles className="w-4 h-4" />,
      accent: "#9CA3AF",
    },
    {
      label: "Total Historical Quotes",
      value: summary.totalRatesCount.toString(),
      subtitle: summary.latestUpdated ? `Latest: ${formatDate(summary.latestUpdated)}` : "No entries",
      icon: <Clock className="w-4 h-4" />,
      accent: "#10B981",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <ReportSummaryCards cards={cards} />

      {/* Current Rates Bar */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#C59A58]" />
          <span>Active Reference Rates Snapshot</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {currentRates.map((c) => (
            <div
              key={`${c.metalId}-${c.purityId}`}
              className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-[var(--text-primary)]">{c.metalName}</span>
                <span className="text-[#C59A58] font-mono font-semibold">{c.purityLabel}</span>
              </div>
              <div className="mt-1">
                {c.hasRate && c.ratePerGram ? (
                  <span className="text-sm font-extrabold text-[var(--text-primary)] font-mono">
                    {formatCurrency(c.ratePerGram)}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text-muted)] italic">Not set</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter and Export Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-[#C59A58]" />
          <span>Historical Benchmark Log</span>
        </h3>

        <ExportButton onExport={handleExportCsv} label="Export CSV" />
      </div>

      {/* Filters Form */}
      <form
        onSubmit={handleApply}
        className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 text-xs"
      >
        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
            Metal
          </label>
          <select
            value={metalId}
            onChange={(e) => {
              setMetalId(e.target.value);
              setPurityId("");
            }}
            className="w-full p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          >
            <option value="">All Metals</option>
            {metals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
            Purity
          </label>
          <select
            value={purityId}
            onChange={(e) => setPurityId(e.target.value)}
            className="w-full p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          >
            <option value="">All Purities</option>
            {filteredPurities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
            Source
          </label>
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="IBJA, MCX..."
              className="w-full pl-7 pr-2.5 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
            From Date
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          />
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
            To Date
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          />
        </div>

        <div className="flex items-end gap-1.5">
          <button
            type="submit"
            className="flex-1 py-2 rounded-xl bg-[#C59A58] text-white font-bold hover:bg-[#b08746] transition"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="p-2 rounded-xl border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-white"
            title="Reset Filters"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/5 dark:bg-white/5 border-b border-[var(--border-primary)] text-[var(--text-muted)] font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Effective Interval</th>
                <th className="py-3 px-4">Metal & Purity</th>
                <th className="py-3 px-4 text-right">Reference Rate / g</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Entered By</th>
                <th className="py-3 px-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)] font-medium">
              {rates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                    No market rates recorded matching criteria.
                  </td>
                </tr>
              ) : (
                rates.map((r) => {
                  const now = new Date();
                  const isFuture = new Date(r.effectiveFrom) > now;

                  return (
                    <tr key={r.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 px-4">
                        <div className="font-mono text-[var(--text-primary)]">
                          {formatDate(r.effectiveFrom)}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          to {r.effectiveTo ? formatDate(r.effectiveTo) : "Active (open)"}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-[var(--text-primary)]">{r.metalName}</div>
                        <div className="text-[11px] text-[#C59A58] font-mono">{r.purityLabel}</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-bold text-[var(--text-primary)] text-sm">
                          {formatCurrency(r.ratePerGram)}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] block">per gram</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] text-[11px] font-semibold text-[var(--text-primary)]">
                          {r.source || "Manual Entry"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            r.isCurrent
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : isFuture
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                          }`}
                        >
                          {r.isCurrent ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>CURRENT</span>
                            </>
                          ) : isFuture ? (
                            <>
                              <Clock className="w-3 h-3" />
                              <span>SCHEDULED</span>
                            </>
                          ) : (
                            <span>HISTORICAL</span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {r.createdByName}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-muted)] max-w-xs truncate">
                        {r.notes || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
