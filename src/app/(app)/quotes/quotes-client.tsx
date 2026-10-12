"use client";

import React, { useState, useTransition } from "react";
import { formatDate } from "@/lib/utils/helpers";
import {
  calculateQuoteAction,
  createQuoteAction,
  consumeQuoteAction,
  cancelQuoteAction,
  convertQuoteToDealAction,
} from "@/lib/actions/quote-actions";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import {
  Calculator,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ArrowRight,
  FileCheck,
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

export interface SerializedQuoteRow {
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

interface CounterpartyItem {
  id: string;
  name: string;
  phone?: string | null;
  type: string;
}

interface QuotesClientProps {
  initialReport: {
    summary: QuotesReportSummary;
    rows: SerializedQuoteRow[];
  };
  metals: MetalItem[];
  counterparties?: CounterpartyItem[];
  userRole?: string;
}

export function QuotesClient({
  initialReport,
  metals,
  counterparties = [],
}: QuotesClientProps) {
  const [report] = useState(initialReport);
  const [isPending, startTransition] = useTransition();

  // Calculator Form State
  const [calcMetalId, setCalcMetalId] = useState(metals[0]?.id || "");
  const currentCalcMetal = metals.find((m) => m.id === calcMetalId) || metals[0];
  const [calcPurityId, setCalcPurityId] = useState(currentCalcMetal?.purities[0]?.id || "");
  const [calcDirection, setCalcDirection] = useState<"BUY" | "SELL">("SELL");
  const [calcWeight, setCalcWeight] = useState("100");
  const [validUntilMinutes, setValidUntilMinutes] = useState(30);
  const [calcNotes, setCalcNotes] = useState("");

  // Live calculation preview state
  const [calculation, setCalculation] = useState<{
    referenceRatePerGram: string;
    marginPerGram: string;
    marginType: string;
    marginValue: string;
    quotedRatePerGram: string;
    quotedAmount: string;
  } | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [createSuccessMsg, setCreateSuccessMsg] = useState<string | null>(null);

  // Consume modal state
  const [selectedQuoteForConsume, setSelectedQuoteForConsume] = useState<SerializedQuoteRow | null>(null);
  const [consumeNotes, setConsumeNotes] = useState("");
  const [consumeError, setConsumeError] = useState<string | null>(null);

  // Convert to Deal modal state (Gap 1)
  const [selectedQuoteForDeal, setSelectedQuoteForDeal] = useState<SerializedQuoteRow | null>(null);
  const [dealCounterpartyId, setDealCounterpartyId] = useState("");
  const [dealInvoiceNumber, setDealInvoiceNumber] = useState("");
  const [dealNotes, setDealNotes] = useState("");
  const [dealError, setDealError] = useState<string | null>(null);

  // Filters for Quotes Table
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [metalFilter, setMetalFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Handler for live calculation
  const handleCalculate = async () => {
    setCalcError(null);
    setCreateSuccessMsg(null);

    const res = await calculateQuoteAction({
      metalId: calcMetalId,
      purityId: calcPurityId,
      direction: calcDirection,
      weightGrams: calcWeight,
    });

    if (!res.success) {
      setCalcError(res.error || "Failed to calculate quote");
      setCalculation(null);
    } else if (res.data) {
      setCalculation({
        referenceRatePerGram: res.data.referenceRatePerGram,
        marginPerGram: res.data.marginPerGram,
        marginType: res.data.marginType,
        marginValue: res.data.marginValue,
        quotedRatePerGram: res.data.quotedRatePerGram,
        quotedAmount: res.data.quotedAmount,
      });
    }
  };

  // Handler for creating formal quote
  const handleCreateQuote = (e: React.FormEvent) => {
    e.preventDefault();
    setCalcError(null);
    setCreateSuccessMsg(null);

    startTransition(async () => {
      const res = await createQuoteAction({
        metalId: calcMetalId,
        purityId: calcPurityId,
        direction: calcDirection,
        weightGrams: calcWeight,
        validUntilMinutes: Number(validUntilMinutes),
        notes: calcNotes.trim() || undefined,
      });

      if (!res.success) {
        setCalcError(res.error || "Failed to create quote");
      } else {
        setCreateSuccessMsg(`Quote created successfully: ${res.data?.quoteNumber}`);
        window.location.reload();
      }
    });
  };

  // Handler for consuming quote into RateReservation
  const handleConfirmConsume = () => {
    if (!selectedQuoteForConsume) return;
    setConsumeError(null);

    startTransition(async () => {
      const res = await consumeQuoteAction({
        quoteId: selectedQuoteForConsume.id,
        notes: consumeNotes.trim() || undefined,
      });

      if (!res.success) {
        setConsumeError(res.error || "Failed to consume quote");
      } else {
        setSelectedQuoteForConsume(null);
        window.location.reload();
      }
    });
  };

  // Handler for converting quote into commercial deal (Gap 1)
  const handleConfirmConvertToDeal = () => {
    if (!selectedQuoteForDeal) return;
    if (!dealCounterpartyId) {
      setDealError("Please select a counterparty");
      return;
    }
    setDealError(null);

    startTransition(async () => {
      const res = await convertQuoteToDealAction({
        quoteId: selectedQuoteForDeal.id,
        counterpartyId: dealCounterpartyId,
        invoiceNumber: dealInvoiceNumber.trim() || undefined,
        notes: dealNotes.trim() || undefined,
      });

      if (!res.success) {
        setDealError(res.error || "Failed to convert quote to deal");
      } else {
        setSelectedQuoteForDeal(null);
        window.location.reload();
      }
    });
  };

  // Handler for cancelling quote
  const handleCancelQuote = (quoteId: string, quoteNumber: string) => {
    const reason = window.prompt(`Enter cancellation reason for quote ${quoteNumber}:`, "Customer declined");
    if (reason === null) return;

    startTransition(async () => {
      const res = await cancelQuoteAction({
        quoteId,
        reason: reason.trim() || undefined,
      });

      if (!res.success) {
        alert(res.error);
      } else {
        window.location.reload();
      }
    });
  };

  // Filter quotes rows
  const filteredRows = report.rows.filter((q) => {
    if (statusFilter !== "ALL" && q.status !== statusFilter) return false;
    if (directionFilter !== "ALL" && q.direction !== directionFilter) return false;
    if (metalFilter !== "ALL" && q.metalId !== metalFilter) return false;
    if (
      search.trim() &&
      !q.quoteNumber.toLowerCase().includes(search.toLowerCase()) &&
      !q.metalName.toLowerCase().includes(search.toLowerCase()) &&
      !q.purityLabel.toLowerCase().includes(search.toLowerCase()) &&
      !q.notes?.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleExportCsv = () => {
    const columns: CsvColumn<SerializedQuoteRow>[] = [
      { header: "Quote #", accessor: (r) => r.quoteNumber },
      { header: "Date", accessor: (r) => formatDate(r.date) },
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
    const csv = generateCsv(filteredRows, columns);
    downloadCsv(csv, `bullion-quotes-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-6">
      {/* Sub-Nav */}
      <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
        <div className="flex items-center gap-2">
          <Link
            href="/masters/market-rates"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
          >
            Market Reference Rates (V3.4)
          </Link>
          <Link
            href="/masters/margins"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
          >
            Margin Rules (V3.5)
          </Link>
          <Link
            href="/quotes"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent)] text-white shadow-xs"
          >
            Quote Calculator & Trading Desk
          </Link>
          <Link
            href="/reports/quotes"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
          >
            Quotes Report
          </Link>
        </div>
      </div>

      {/* Quote Calculator Component */}
      <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-[var(--accent)]" />
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Bullion Quoting Calculator
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Real-time commercial quote calculation from active benchmark rates + spread
              </p>
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            Commercial Reference Only
          </span>
        </div>

        {calcError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{calcError}</span>
          </div>
        )}

        {createSuccessMsg && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{createSuccessMsg}</span>
          </div>
        )}

        <form onSubmit={handleCreateQuote} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {/* Direction */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                Direction *
              </label>
              <select
                value={calcDirection}
                onChange={(e) => {
                  setCalcDirection(e.target.value as "BUY" | "SELL");
                  setCalculation(null);
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] font-bold focus:outline-hidden"
              >
                <option value="SELL">SELL (Customer Buys / +Margin)</option>
                <option value="BUY">BUY (Customer Sells / −Margin)</option>
              </select>
            </div>

            {/* Metal */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                Metal *
              </label>
              <select
                value={calcMetalId}
                onChange={(e) => {
                  const mId = e.target.value;
                  setCalcMetalId(mId);
                  const selMetal = metals.find((m) => m.id === mId);
                  setCalcPurityId(selMetal?.purities[0]?.id || "");
                  setCalculation(null);
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              >
                {metals.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Purity */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                Purity *
              </label>
              <select
                value={calcPurityId}
                onChange={(e) => {
                  setCalcPurityId(e.target.value);
                  setCalculation(null);
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              >
                {currentCalcMetal?.purities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Weight */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                Weight (Grams) *
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={calcWeight}
                onChange={(e) => {
                  setCalcWeight(e.target.value);
                  setCalculation(null);
                }}
                required
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono font-bold focus:outline-hidden"
              />
            </div>

            {/* Validity Duration */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                Validity Period
              </label>
              <select
                value={validUntilMinutes}
                onChange={(e) => setValidUntilMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={60}>1 Hour</option>
                <option value={120}>2 Hours</option>
                <option value={1440}>24 Hours</option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                Notes
              </label>
              <input
                type="text"
                placeholder="Optional notes..."
                value={calcNotes}
                onChange={(e) => setCalcNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Calculate Trigger & Live Result Box */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleCalculate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-secondary)] hover:bg-white/10 text-[var(--text-primary)] border border-[var(--border-primary)] transition-all cursor-pointer shadow-xs"
            >
              <Calculator className="w-3.5 h-3.5 text-[var(--accent)]" />
              Calculate Live Quote
            </button>

            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-[var(--accent)] hover:opacity-90 text-white transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileCheck className="w-4 h-4" />
              )}
              Create & Lock Quote
            </button>
          </div>

          {/* Results Display Breakdown */}
          {calculation && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/5 via-amber-500/10 to-amber-500/5 border border-amber-500/20 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block">Market Benchmark</span>
                  <span className="text-base font-bold font-mono text-[var(--text-primary)]">
                    ₹{parseFloat(calculation.referenceRatePerGram).toLocaleString("en-IN", { minimumFractionDigits: 2 })}/g
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block">Applied Margin</span>
                  <span className="text-base font-bold font-mono text-[var(--accent)]">
                    {calculation.marginType === "PERCENTAGE"
                      ? `${calculation.marginValue}% (₹${parseFloat(calculation.marginPerGram).toFixed(2)}/g)`
                      : `₹${parseFloat(calculation.marginPerGram).toFixed(2)}/g`}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block">Quoted Commercial Rate</span>
                  <span className="text-lg font-extrabold font-mono text-emerald-400">
                    ₹{parseFloat(calculation.quotedRatePerGram).toLocaleString("en-IN", { minimumFractionDigits: 2 })}/g
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block">Total Proposed Amount</span>
                  <span className="text-lg font-extrabold font-mono text-emerald-400">
                    ₹{parseFloat(calculation.quotedAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-amber-500/20 text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>
                  Direction: <strong className="text-[var(--text-primary)]">{calcDirection}</strong> ({calcDirection === "BUY" ? "Market Ref − Margin" : "Market Ref + Margin"})
                </span>
                <span className="text-amber-400/90 font-medium">
                  Quote is a calculated commercial reference and is not yet a transaction.
                </span>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="text-[11px] text-[var(--text-muted)]">Total Quotes</div>
          <div className="mt-1 text-2xl font-bold font-mono text-[var(--text-primary)]">
            {report.summary.totalQuotes}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="text-[11px] text-[var(--text-muted)]">Active Quotes</div>
          <div className="mt-1 text-2xl font-bold font-mono text-emerald-400">
            {report.summary.activeCount}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="text-[11px] text-[var(--text-muted)]">Consumed into Reservations</div>
          <div className="mt-1 text-2xl font-bold font-mono text-blue-400">
            {report.summary.consumedCount}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="text-[11px] text-[var(--text-muted)]">Expired / Cancelled</div>
          <div className="mt-1 text-2xl font-bold font-mono text-zinc-400">
            {report.summary.expiredCount + report.summary.cancelledCount}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="text-[11px] text-[var(--text-muted)]">Total Quoted Value</div>
          <div className="mt-1 text-xl font-bold font-mono text-amber-400 truncate">
            ₹{parseFloat(report.summary.totalQuotedAmount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Quotes History / Ledger Table */}
      <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Quotes Register
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono">
              {filteredRows.length} quotes
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ExportButton onExport={handleExportCsv} label="Export CSV" />
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="CONSUMED">CONSUMED</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Direction
            </label>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
            >
              <option value="ALL">All Directions</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Metal
            </label>
            <select
              value={metalFilter}
              onChange={(e) => setMetalFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
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
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Search Quote # / Notes
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              />
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2" />
            </div>
          </div>
        </div>

        {/* Quotes Table */}
        <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Quote #</th>
                <th className="px-3.5 py-2.5 font-semibold">Date & Time</th>
                <th className="px-3.5 py-2.5 font-semibold">Direction</th>
                <th className="px-3.5 py-2.5 font-semibold">Metal / Purity</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Weight</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Quoted Rate</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Total Amount</th>
                <th className="px-3.5 py-2.5 font-semibold">Valid Until</th>
                <th className="px-3.5 py-2.5 font-semibold">Status</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)] text-[var(--text-primary)]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3.5 py-8 text-center text-[var(--text-muted)]">
                    No quotes found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((q) => {
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
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-right space-x-1.5">
                        {q.status === "ACTIVE" && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedQuoteForDeal(q);
                                setDealCounterpartyId(counterparties[0]?.id || "");
                                setDealInvoiceNumber("");
                                setDealNotes("");
                                setDealError(null);
                              }}
                              className="px-2 py-1 rounded text-[11px] font-semibold bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition-colors cursor-pointer"
                              title={`Convert quote directly to commercial ${q.direction === "BUY" ? "Purchase" : "Sale"}`}
                            >
                              Create {q.direction === "BUY" ? "Purchase" : "Sale"}
                            </button>
                            <button
                              onClick={() => setSelectedQuoteForConsume(q)}
                              className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
                            >
                              Consume → Res
                            </button>
                            <button
                              onClick={() => handleCancelQuote(q.id, q.quoteNumber)}
                              className="px-2 py-1 rounded text-[11px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Consume Modal */}
      {selectedQuoteForConsume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Consume Quote into Rate Reservation
                </h3>
              </div>
              <button
                onClick={() => setSelectedQuoteForConsume(null)}
                className="text-[var(--text-muted)] hover:text-white text-xs px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            {consumeError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{consumeError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Quote Number:</span>
                <span className="font-mono font-bold text-[var(--accent)]">{selectedQuoteForConsume.quoteNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Type:</span>
                <span className="font-semibold">{selectedQuoteForConsume.direction === "BUY" ? "PURCHASE Reservation" : "SALE Reservation"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Metal & Purity:</span>
                <span>{selectedQuoteForConsume.metalName} {selectedQuoteForConsume.purityLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Weight:</span>
                <span className="font-mono">{parseFloat(selectedQuoteForConsume.weightGrams).toFixed(4)}g</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Quoted Rate:</span>
                <span className="font-mono font-bold text-emerald-400">₹{parseFloat(selectedQuoteForConsume.quotedRatePerGram).toFixed(2)}/g</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Total Amount:</span>
                <span className="font-mono font-bold text-emerald-400">₹{parseFloat(selectedQuoteForConsume.quotedAmount).toFixed(2)}</span>
              </div>
            </div>

            <div className="text-[11px] text-[var(--text-secondary)]">
              This will lock the quote rate into an active Rate Reservation. Subsequent market changes will not alter this rate.
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Counterparty quote acceptance"
                value={consumeNotes}
                onChange={(e) => setConsumeNotes(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
              <button
                type="button"
                onClick={() => setSelectedQuoteForConsume(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmConsume}
                disabled={isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm & Create Reservation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Deal Modal (Gap 1) */}
      {selectedQuoteForDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Convert Quote to Commercial {selectedQuoteForDeal.direction === "BUY" ? "Purchase" : "Sale"}
                </h3>
              </div>
              <button
                onClick={() => setSelectedQuoteForDeal(null)}
                className="text-[var(--text-muted)] hover:text-white text-xs px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            {dealError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{dealError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Quote Number:</span>
                <span className="font-mono font-bold text-[var(--accent)]">{selectedQuoteForDeal.quoteNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Deal Direction:</span>
                <span className="font-semibold">{selectedQuoteForDeal.direction === "BUY" ? "PURCHASE (From Supplier)" : "SALE (To Buyer)"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Metal & Purity:</span>
                <span>{selectedQuoteForDeal.metalName} {selectedQuoteForDeal.purityLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Weight:</span>
                <span className="font-mono">{parseFloat(selectedQuoteForDeal.weightGrams).toFixed(4)}g</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Locked Quoted Rate:</span>
                <span className="font-mono font-bold text-blue-400">₹{parseFloat(selectedQuoteForDeal.quotedRatePerGram).toFixed(2)}/g</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Total Amount:</span>
                <span className="font-mono font-bold text-blue-400">₹{parseFloat(selectedQuoteForDeal.quotedAmount).toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Counterparty *
                </label>
                <select
                  value={dealCounterpartyId}
                  onChange={(e) => setDealCounterpartyId(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
                >
                  <option value="">Select counterparty...</option>
                  {counterparties.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name} ({cp.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Invoice Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Auto-generated if left blank"
                  value={dealInvoiceNumber}
                  onChange={(e) => setDealInvoiceNumber(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Deal Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Converted from counterparty quote acceptance"
                  value={dealNotes}
                  onChange={(e) => setDealNotes(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="text-[11px] text-[var(--text-secondary)]">
              This will create a POSTED {selectedQuoteForDeal.direction === "BUY" ? "Purchase" : "Sale"} at the exact locked rate. No physical stock or payment is moved until separate fulfilment and settlement actions.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
              <button
                type="button"
                onClick={() => setSelectedQuoteForDeal(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmConvertToDeal}
                disabled={isPending || !dealCounterpartyId}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm & Create {selectedQuoteForDeal.direction === "BUY" ? "Purchase" : "Sale"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
