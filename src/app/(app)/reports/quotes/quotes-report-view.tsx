"use client";

import React, { useState } from "react";
import { formatDate } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { FileText, Filter } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

interface SerializedQuoteRow {
  id: string;
  quoteNumber: string;
  date: string;
  direction: "BUY" | "SELL";
  metalId: string;
  metalName: string;
  metalCode: string;
  purityId: string;
  purityLabel: string;
  weightGrams: string;
  referenceRatePerGram: string;
  marginType: "PERCENTAGE" | "FIXED_PER_GRAM";
  marginValue: string;
  marginPerGram: string;
  quotedRatePerGram: string;
  quotedAmount: string;
  validUntil: string;
  status: "ACTIVE" | "EXPIRED" | "CONSUMED" | "CANCELLED";
  createdByName: string;
  reservationNumber: string | null;
  notes: string | null;
}

interface QuotesReportSummary {
  totalQuotes: number;
  activeCount: number;
  consumedCount: number;
  expiredCount: number;
  cancelledCount: number;
  totalQuotedWeightGrams: string;
  totalQuotedAmount: string;
}

interface QuotesReportViewProps {
  report: {
    summary: QuotesReportSummary;
    rows: SerializedQuoteRow[];
  };
  metals: Array<{ id: string; name: string; code: string }>;
  purities: Array<{ id: string; label: string; metalId: string }>;
}

export function QuotesReportView({
  report,
  metals,
  purities,
}: QuotesReportViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") || "");
  const [direction, setDirection] = useState(searchParams.get("direction") || "ALL");
  const [metalId, setMetalId] = useState(searchParams.get("metalId") || "ALL");
  const [purityId, setPurityId] = useState(searchParams.get("purityId") || "ALL");
  const [status, setStatus] = useState(searchParams.get("status") || "ALL");
  const [search, setSearch] = useState(searchParams.get("search") || "");

  const filteredPurities =
    metalId === "ALL"
      ? purities
      : purities.filter((p) => p.metalId === metalId);

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (direction !== "ALL") params.set("direction", direction);
    if (metalId !== "ALL") params.set("metalId", metalId);
    if (purityId !== "ALL") params.set("purityId", purityId);
    if (status !== "ALL") params.set("status", status);
    if (search.trim()) params.set("search", search.trim());

    router.push(`/reports/quotes?${params.toString()}`);
  };

  const resetFilters = () => {
    setDateFrom("");
    setDateTo("");
    setDirection("ALL");
    setMetalId("ALL");
    setPurityId("ALL");
    setStatus("ALL");
    setSearch("");
    router.push("/reports/quotes");
  };

  const handleExportCsv = () => {
    const columns: CsvColumn<SerializedQuoteRow>[] = [
      { header: "Quote #", accessor: (r) => r.quoteNumber },
      { header: "Date & Time", accessor: (r) => formatDate(r.date) },
      { header: "Direction", accessor: (r) => r.direction },
      { header: "Metal", accessor: (r) => r.metalName },
      { header: "Purity", accessor: (r) => r.purityLabel },
      { header: "Weight (g)", accessor: (r) => r.weightGrams },
      { header: "Reference Rate (₹/g)", accessor: (r) => r.referenceRatePerGram },
      {
        header: "Margin",
        accessor: (r) =>
          r.marginType === "PERCENTAGE" ? `${r.marginValue}%` : `₹${r.marginValue}/g`,
      },
      { header: "Quoted Rate (₹/g)", accessor: (r) => r.quotedRatePerGram },
      { header: "Quoted Amount (₹)", accessor: (r) => r.quotedAmount },
      { header: "Valid Until", accessor: (r) => formatDate(r.validUntil) },
      { header: "Status", accessor: (r) => r.status },
      { header: "Reservation #", accessor: (r) => r.reservationNumber || "—" },
      { header: "Created By", accessor: (r) => r.createdByName },
      { header: "Notes", accessor: (r) => r.notes || "" },
    ];
    const csv = generateCsv(report.rows, columns);
    downloadCsv(csv, `bullion-quotes-report-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-6">
      {/* Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="text-[11px] text-[var(--text-muted)]">Total Quotes</div>
          <div className="mt-1 text-2xl font-bold font-mono text-[var(--text-primary)]">
            {report.summary.totalQuotes}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">Historical quote snapshots</div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="text-[11px] text-[var(--text-muted)]">Active Quotes</div>
          <div className="mt-1 text-2xl font-bold font-mono text-emerald-400">
            {report.summary.activeCount}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">Available for lock/deal</div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="text-[11px] text-[var(--text-muted)]">Consumed into Reservations</div>
          <div className="mt-1 text-2xl font-bold font-mono text-blue-400">
            {report.summary.consumedCount}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">Locked downstream rates</div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="text-[11px] text-[var(--text-muted)]">Expired / Cancelled</div>
          <div className="mt-1 text-2xl font-bold font-mono text-zinc-400">
            {report.summary.expiredCount + report.summary.cancelledCount}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">Not executed</div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="text-[11px] text-[var(--text-muted)]">Total Quoted Value</div>
          <div className="mt-1 text-xl font-bold font-mono text-amber-400 truncate">
            ₹{parseFloat(report.summary.totalQuotedAmount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">Commercial quote volume</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
          <Filter className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Filter Quotes Ledger</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden text-xs"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden text-xs"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
              Direction
            </label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden text-xs"
            >
              <option value="ALL">All Directions</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
              Metal
            </label>
            <select
              value={metalId}
              onChange={(e) => {
                setMetalId(e.target.value);
                setPurityId("ALL");
              }}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden text-xs"
            >
              <option value="ALL">All Metals</option>
              {metals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
              Purity
            </label>
            <select
              value={purityId}
              onChange={(e) => setPurityId(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden text-xs"
            >
              <option value="ALL">All Purities</option>
              {filteredPurities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden text-xs"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="CONSUMED">CONSUMED</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Quote # / Notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden text-xs"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={resetFilters}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
          >
            Reset
          </button>
          <button
            onClick={applyFilters}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:opacity-90 text-white transition-all cursor-pointer shadow-sm"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Quotes Audit Register
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono">
              {report.rows.length} records
            </span>
          </div>

          <ExportButton onExport={handleExportCsv} label="Export CSV" />
        </div>

        <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Quote #</th>
                <th className="px-3.5 py-2.5 font-semibold">Date & Time</th>
                <th className="px-3.5 py-2.5 font-semibold">Direction</th>
                <th className="px-3.5 py-2.5 font-semibold">Metal / Purity</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Weight</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Ref Rate</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Margin Spread</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Quoted Rate</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Quoted Amount</th>
                <th className="px-3.5 py-2.5 font-semibold">Valid Until</th>
                <th className="px-3.5 py-2.5 font-semibold">Status</th>
                <th className="px-3.5 py-2.5 font-semibold">Created By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)] text-[var(--text-primary)]">
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3.5 py-8 text-center text-[var(--text-muted)]">
                    No quotes found.
                  </td>
                </tr>
              ) : (
                report.rows.map((q) => {
                  return (
                    <tr key={q.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3.5 py-2.5 whitespace-nowrap font-mono font-bold text-[var(--accent)]">
                        {q.quoteNumber}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-[11px] text-[var(--text-secondary)]">
                        {formatDate(q.date)}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            q.direction === "BUY"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {q.direction}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="font-semibold">{q.metalName}</div>
                        <div className="text-[10px] text-[var(--text-secondary)]">{q.purityLabel}</div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-right font-mono">
                        {parseFloat(q.weightGrams).toFixed(3)}g
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-right font-mono text-[var(--text-secondary)]">
                        ₹{parseFloat(q.referenceRatePerGram).toFixed(2)}/g
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-right font-mono text-[var(--accent)]">
                        {q.marginType === "PERCENTAGE"
                          ? `${q.marginValue}% (₹${parseFloat(q.marginPerGram).toFixed(2)}/g)`
                          : `₹${parseFloat(q.marginPerGram).toFixed(2)}/g`}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-right font-mono font-semibold">
                        ₹{parseFloat(q.quotedRatePerGram).toLocaleString("en-IN", { minimumFractionDigits: 2 })}/g
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-right font-mono font-bold text-emerald-400">
                        ₹{parseFloat(q.quotedAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-[11px] text-[var(--text-secondary)]">
                        {formatDate(q.validUntil)}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            q.status === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : q.status === "CONSUMED"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : q.status === "EXPIRED"
                              ? "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {q.status}
                        </span>
                        {q.reservationNumber && (
                          <div className="text-[9px] font-mono text-[var(--text-muted)] mt-0.5">
                            {q.reservationNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-[11px] text-[var(--text-secondary)]">
                        {q.createdByName}
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
