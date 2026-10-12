"use client";

import React, { useState, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/utils/helpers";
import { createMarketRateAction } from "@/lib/actions/market-rate-actions";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import type { MarketRateRow, CurrentRateCard } from "@/lib/services/market-rate-service";
import {
  TrendingUp,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

interface MetalItem {
  id: string;
  name: string;
  code: string;
  purities: Array<{
    id: string;
    label: string;
    fineness: string;
    isActive: boolean;
  }>;
}

interface MarketRatesClientProps {
  initialRates: MarketRateRow[];
  currentCards: CurrentRateCard[];
  metals: MetalItem[];
  userRole: "ADMIN" | "STAFF";
}

export function MarketRatesClient({
  initialRates,
  currentCards,
  metals,
}: MarketRatesClientProps) {
  const rates = initialRates;
  const [showAddModal, setShowAddModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [metalFilter, setMetalFilter] = useState("ALL");
  const [purityFilter, setPurityFilter] = useState("ALL");
  const [sourceSearch, setSourceSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filteredPurities =
    metalFilter === "ALL"
      ? metals.flatMap((m) => m.purities)
      : metals.find((m) => m.id === metalFilter)?.purities || [];

  const filteredRates = rates.filter((r) => {
    if (metalFilter !== "ALL" && r.metalId !== metalFilter) return false;
    if (purityFilter !== "ALL" && r.purityId !== purityFilter) return false;
    if (
      sourceSearch.trim() &&
      !r.source?.toLowerCase().includes(sourceSearch.toLowerCase()) &&
      !r.notes?.toLowerCase().includes(sourceSearch.toLowerCase())
    ) {
      return false;
    }
    if (dateFrom && new Date(r.effectiveFrom) < new Date(dateFrom)) return false;
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(r.effectiveFrom) > to) return false;
    }
    return true;
  });

  const handleExportCsv = () => {
    const columns: CsvColumn<MarketRateRow>[] = [
      { header: "Effective From", accessor: (r) => formatDate(r.effectiveFrom) },
      { header: "Effective To", accessor: (r) => (r.effectiveTo ? formatDate(r.effectiveTo) : "Active / Open") },
      { header: "Metal", accessor: (r) => r.metalName },
      { header: "Purity", accessor: (r) => r.purityLabel },
      { header: "Rate / Gram (INR)", accessor: (r) => r.ratePerGram },
      { header: "Source", accessor: (r) => r.source || "—" },
      { header: "Status", accessor: (r) => (r.isCurrent ? "CURRENT" : new Date(r.effectiveFrom) > new Date() ? "SCHEDULED" : "HISTORICAL") },
      { header: "Created By", accessor: (r) => r.createdByName },
      { header: "Notes", accessor: (r) => r.notes || "" },
    ];
    const csv = generateCsv(filteredRates, columns);
    downloadCsv(csv, `bullion-market-rates-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-6">
      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
        <div className="flex items-center gap-2">
          <Link
            href="/masters"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-white hover:bg-white/5 transition"
          >
            Metals & Purities
          </Link>
          <div className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#C59A58] text-white shadow-sm flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Market Reference Rates</span>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-[#C59A58] text-white hover:bg-[#b08746] transition shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>New Market Rate</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold uppercase tracking-wider">
            Dismiss
          </button>
        </div>
      )}

      {/* STEP 14: CURRENT RATE CARDS */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#C59A58]" />
          <span>Current Market Reference Rates (Active)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {currentCards.map((card) => {
            const isGold = card.metalCode.toUpperCase() === "GOLD";
            return (
              <div
                key={`${card.metalId}-${card.purityId}`}
                className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] relative overflow-hidden flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                      isGold
                        ? "bg-[#C59A58]/20 text-[#E4BE85] border border-[#C59A58]/30"
                        : "bg-slate-500/20 text-slate-300 border border-slate-500/30"
                    }`}
                  >
                    {card.metalName}
                  </span>
                  <span className="text-xs font-bold text-[var(--text-primary)] font-mono">
                    {card.purityLabel}
                  </span>
                </div>

                <div className="my-1">
                  {card.hasRate && card.ratePerGram ? (
                    <div>
                      <div className="text-xl font-extrabold text-[var(--text-primary)] font-mono tracking-tight">
                        {formatCurrency(card.ratePerGram)}
                        <span className="text-xs font-normal text-[var(--text-muted)] ml-1">/ gram</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>As of {formatDate(card.effectiveFrom!)}</span>
                      </div>
                      {card.source && (
                        <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                          Source: <span className="font-semibold">{card.source}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)] italic">
                        No rate quoted
                      </span>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        Add a rate to establish baseline
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[var(--border-primary)]/50 mt-2 flex justify-between items-center text-[10px] text-[var(--text-muted)]">
                  <span>Fineness: {card.fineness}</span>
                  <span className="text-[9px] text-[#C59A58] uppercase font-bold">Reference Only</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FILTER & HISTORY SECTION */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#C59A58]" />
            <span>Rate Change History & Audit Logs</span>
          </h3>

          <ExportButton onExport={handleExportCsv} label="Export CSV" />
        </div>

        {/* Filters */}
        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
              Metal
            </label>
            <select
              value={metalFilter}
              onChange={(e) => {
                setMetalFilter(e.target.value);
                setPurityFilter("ALL");
              }}
              className="w-full p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            >
              <option value="ALL">All Metals</option>
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
              value={purityFilter}
              onChange={(e) => setPurityFilter(e.target.value)}
              className="w-full p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
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
            <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
              Source / Notes Search
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                placeholder="IBJA, MCX, desk..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
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
            >
            </input>
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
            >
            </input>
          </div>
        </div>

        {/* Rates Table */}
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
                {filteredRates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                      No market rates match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRates.map((r) => {
                    const now = new Date();
                    const isFuture = new Date(r.effectiveFrom) > now;

                    return (
                      <tr key={r.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-3 px-4">
                          <div className="font-mono text-[var(--text-primary)]">
                            {formatDate(r.effectiveFrom)}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            until {r.effectiveTo ? formatDate(r.effectiveTo) : "Active (open-ended)"}
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

      {/* NEW MARKET RATE MODAL */}
      {showAddModal && (
        <NewMarketRateModal
          metals={metals}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Market Rate Modal
// ---------------------------------------------------------------------------

function NewMarketRateModal({
  metals,
  onClose,
  onSuccess,
}: {
  metals: MetalItem[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedMetalId, setSelectedMetalId] = useState(metals[0]?.id || "");
  const [selectedPurityId, setSelectedPurityId] = useState(
    metals[0]?.purities[0]?.id || "",
  );
  const [rateInput, setRateInput] = useState("");
  const [effectiveFromIso, setEffectiveFromIso] = useState(() => {
    // Current local ISO string for datetime-local input
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [sourceInput, setSourceInput] = useState("IBJA");
  const [notesInput, setNotesInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentMetal = metals.find((m) => m.id === selectedMetalId);
  const availablePurities = currentMetal?.purities || [];

  const handleMetalChange = (metalId: string) => {
    setSelectedMetalId(metalId);
    const m = metals.find((item) => item.id === metalId);
    if (m && m.purities.length > 0) {
      setSelectedPurityId(m.purities[0].id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const rateNum = parseFloat(rateInput);
    if (isNaN(rateNum) || rateNum <= 0) {
      setError("Market rate must be a strictly positive number");
      return;
    }

    if (!effectiveFromIso) {
      setError("Effective date and time is required");
      return;
    }

    startTransition(async () => {
      const res = await createMarketRateAction({
        metalId: selectedMetalId,
        purityId: selectedPurityId,
        unit: "GRAM",
        ratePerGram: rateInput,
        effectiveFrom: new Date(effectiveFromIso),
        source: sourceInput || undefined,
        notes: notesInput || undefined,
      });

      if (res.success) {
        onSuccess();
      } else {
        setError(res.error || "Failed to set market reference rate");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#C59A58]/20 text-[#E4BE85] border border-[#C59A58]/30">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Record Market Reference Rate
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Reference rate for quoting & operational baseline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-white"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
                Metal *
              </label>
              <select
                value={selectedMetalId}
                onChange={(e) => handleMetalChange(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              >
                {metals.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
                Purity *
              </label>
              <select
                value={selectedPurityId}
                onChange={(e) => setSelectedPurityId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              >
                {availablePurities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
              Market Rate / Gram (₹) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              placeholder="e.g. 12500.00"
              className="w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
              Effective Date & Time *
            </label>
            <input
              type="datetime-local"
              required
              value={effectiveFromIso}
              onChange={(e) => setEffectiveFromIso(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
                Source Reference
              </label>
              <input
                type="text"
                value={sourceInput}
                onChange={(e) => setSourceInput(e.target.value)}
                placeholder="IBJA, MCX, Desk..."
                className="w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
                Unit
              </label>
              <input
                type="text"
                disabled
                value="GRAM"
                className="w-full p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] text-[var(--text-muted)] cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="e.g. Morning opening benchmark rate"
              className="w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>

          {/* Operational Disclaimer */}
          <div className="p-3 rounded-2xl bg-[#C59A58]/10 border border-[#C59A58]/20 text-[11px] text-[#E4BE85]">
            <span className="font-semibold block mb-0.5">Reference Separation:</span>
            Market rate is used for quoting and reservations. It does NOT automatically mutate
            existing Purchase/Sale rates, payments, or physical warehouse stock.
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs rounded-xl border border-[var(--border-primary)] text-[var(--text-secondary)] font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-xs rounded-xl bg-[#C59A58] hover:bg-[#b08746] text-white font-bold flex items-center gap-1.5 transition shadow-md disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Market Rate</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
