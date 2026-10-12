"use client";

import React, { useState } from "react";
import { formatCurrency, formatGrams, formatDate } from "@/lib/utils/helpers";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { Lock, Clock, AlertCircle, Filter, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { RateReservationReportResult, RateReservationRow } from "@/lib/services/reservation-service";

interface RateReservationsReportViewProps {
  report: RateReservationReportResult;
  metals: Array<{ id: string; name: string; code: string }>;
  purities: Array<{ id: string; label: string; metalId: string }>;
  counterparties: Array<{ id: string; name: string; type: string }>;
}

export function RateReservationsReportView({
  report,
  metals,
  purities,
  counterparties,
}: RateReservationsReportViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { summary, rows } = report;

  // Local filter states
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");
  const [type, setType] = useState(searchParams.get("type") ?? "ALL");
  const [status, setStatus] = useState(searchParams.get("status") ?? "ALL");
  const [metalId, setMetalId] = useState(searchParams.get("metalId") ?? "");
  const [purityId, setPurityId] = useState(searchParams.get("purityId") ?? "");
  const [counterpartyId, setCounterpartyId] = useState(searchParams.get("counterpartyId") ?? "");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const filteredPurities = metalId
    ? purities.filter((p) => p.metalId === metalId)
    : purities;

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams();

    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (type && type !== "ALL") params.set("type", type);
    if (status && status !== "ALL") params.set("status", status);
    if (metalId) params.set("metalId", metalId);
    if (purityId) params.set("purityId", purityId);
    if (counterpartyId) params.set("counterpartyId", counterpartyId);
    if (search && search.trim()) params.set("search", search.trim());

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleReset = () => {
    setDateFrom("");
    setDateTo("");
    setType("ALL");
    setStatus("ALL");
    setMetalId("");
    setPurityId("");
    setCounterpartyId("");
    setSearch("");
    router.push(pathname);
  };

  const handleExport = () => {
    const columns: CsvColumn<RateReservationRow>[] = [
      { header: "Reservation Number", accessor: (r) => r.reservationNumber },
      { header: "Reserved Date", accessor: (r) => formatDate(r.reservedAt) },
      { header: "Transaction Type", accessor: (r) => r.type },
      { header: "Counterparty", accessor: (r) => r.partyName },
      { header: "Invoice Number", accessor: (r) => r.invoiceNumber },
      { header: "Metal", accessor: (r) => `${r.metalName} (${r.metalCode})` },
      { header: "Purity", accessor: (r) => r.purityLabel },
      { header: "Reserved Weight (g)", accessor: (r) => r.weightGrams.toString() },
      { header: "Reserved Rate / g", accessor: (r) => r.reservedRatePerGram.toString() },
      { header: "Reserved Amount", accessor: (r) => r.reservedAmount.toString() },
      { header: "Expires At", accessor: (r) => formatDate(r.expiresAt) },
      { header: "Status", accessor: (r) => r.status },
      { header: "Notes", accessor: (r) => r.notes ?? "" },
    ];

    const csv = generateCsv(rows, columns);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadCsv(`bullion-rate-reservations-${dateStr}.csv`, csv);
  };

  const cards = [
    {
      label: "Total Reserved Weight",
      value: formatGrams(summary.totalReservedWeightGrams.toString()),
      subtitle: `${summary.totalCount} total reservations recorded`,
      icon: <Lock className="w-4 h-4" />,
      accent: "#C59A58",
    },
    {
      label: "Total Reserved Value",
      value: formatCurrency(summary.totalReservedAmount.toString()),
      subtitle: "Nominal monetary volume of rate blocks",
      icon: <Clock className="w-4 h-4" />,
      accent: "#3B82F6",
    },
    {
      label: "Active Rate Blocks",
      value: `${summary.activeCount} Active`,
      subtitle: `${summary.consumedCount} Consumed & Fixed`,
      icon: <ShieldCheck className="w-4 h-4" />,
      accent: "#22C55E",
    },
    {
      label: "Terminal Breakdown",
      value: `${summary.expiredCount} Expired`,
      subtitle: `${summary.cancelledCount} Cancelled rate blocks`,
      icon: <AlertCircle className="w-4 h-4" />,
      accent: "#EF4444",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <ReportSummaryCards cards={cards} />

      {/* Filter Section */}
      <form
        onSubmit={handleApply}
        className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] space-y-3"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-[#C59A58]" />
          <span>Rate Reservation Filters</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
          {/* Date From */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>

          {/* Type */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Deal Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            >
              <option value="ALL">All Types</option>
              <option value="PURCHASE">Purchases</option>
              <option value="SALE">Sales</option>
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="CONSUMED">Consumed</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Metal */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Metal</label>
            <select
              value={metalId}
              onChange={(e) => {
                setMetalId(e.target.value);
                setPurityId("");
              }}
              className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            >
              <option value="">All Metals</option>
              {metals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
          </div>

          {/* Purity */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Purity</label>
            <select
              value={purityId}
              onChange={(e) => setPurityId(e.target.value)}
              disabled={!metalId}
              className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] disabled:opacity-50"
            >
              <option value="">All Purities</option>
              {filteredPurities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Counterparty */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Counterparty</label>
            <select
              value={counterpartyId}
              onChange={(e) => setCounterpartyId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            >
              <option value="">All Parties</option>
              {counterparties.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name} ({cp.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search bar & Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-primary)]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reservation #, invoice #, party, notes..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border border-[var(--border-primary)] font-semibold text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-xl bg-[#C59A58] hover:bg-[#b08442] text-white font-semibold transition shadow-xs"
            >
              <span>Apply Filters</span>
            </button>
          </div>
        </div>
      </form>

      {/* Table Container */}
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-primary)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              Rate Reservations Register
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Showing {rows.length} rate block events with time-bound commitments
            </p>
          </div>
          <ExportButton onExport={handleExport} label="Export Reservations CSV" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Reservation #</th>
                <th className="py-3 px-4">Reserved Date</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Party</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Metal & Purity</th>
                <th className="py-3 px-4 text-right">Reserved Weight</th>
                <th className="py-3 px-4 text-right">Rate / g</th>
                <th className="py-3 px-4 text-right">Reserved Value</th>
                <th className="py-3 px-4">Expires At</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[var(--text-muted)]">
                    No rate reservations match the selected filters
                  </td>
                </tr>
              ) : (
                rows.map((r: RateReservationRow) => (
                  <tr
                    key={r.id}
                    className={`hover:bg-[var(--bg-table-hover)] transition-colors ${
                      r.status === "CANCELLED"
                        ? "opacity-60 bg-gray-500/5"
                        : r.status === "EXPIRED"
                        ? "opacity-75 bg-red-500/5"
                        : ""
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-[#C59A58]">
                      {r.reservationNumber}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {formatDate(r.reservedAt)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.type === "PURCHASE"
                            ? "bg-green-500/10 text-green-500 border border-green-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        }`}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                      {r.partyName}
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                      {r.invoiceNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {r.metalName}
                      </span>{" "}
                      <span className="text-[var(--text-muted)]">({r.purityLabel})</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)]">
                      {formatGrams(r.weightGrams.toString())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-amber-500">
                      {formatCurrency(r.reservedRatePerGram.toString())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#C59A58]">
                      {formatCurrency(r.reservedAmount.toString())}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-muted)] font-mono">
                      {formatDate(r.expiresAt)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          r.status === "ACTIVE"
                            ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                            : r.status === "CONSUMED"
                            ? "bg-green-500/10 text-green-500 border border-green-500/20"
                            : r.status === "EXPIRED"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-gray-500/10 text-gray-400 border border-gray-500/20"
                        }`}
                      >
                        <Lock className="w-2.5 h-2.5" />
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
