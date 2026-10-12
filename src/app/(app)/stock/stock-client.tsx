"use client";

import React, { useState, useTransition } from "react";
import {
  Package,
  Plus,
  Scale,
  History,
  AlertCircle,
  Loader2,
  TrendingUp,
  TrendingDown,
  Layers,
  Search,
  Filter,
} from "lucide-react";
import {
  setOpeningStockAction,
  getBucketMovementsAction,
} from "@/lib/actions/stock-actions";
import { formatCurrency, formatGrams, formatDate } from "@/lib/utils/helpers";

interface StockPositionRow {
  metalId: string;
  metalCode: string;
  metalName: string;
  purityId: string;
  purityLabel: string;
  fineness: string;
  openingWeightGrams: string;
  purchasedWeightGrams: string;
  soldWeightGrams: string;
  adjustmentIncreaseGrams: string;
  adjustmentDecreaseGrams: string;
  currentWeightGrams: string;
  reservedWeightGrams?: string;
  availableToSellWeightGrams?: string;
  averagePurchaseRate: string;
  totalPurchaseValue: string;
  averageSellingRate: string;
  totalSalesValue: string;
  hasOpeningStock: boolean;
}

interface StockClientProps {
  initialPositions: StockPositionRow[];
  metals: Array<{
    id: string;
    name: string;
    code: string;
    purities: Array<{ id: string; label: string; fineness: string; isActive: boolean }>;
  }>;
  userRole: "ADMIN" | "STAFF";
}

export function StockClient({
  initialPositions,
  metals,
  userRole,
}: StockClientProps) {
  const [metalFilter, setMetalFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [preselectedBucket, setPreselectedBucket] = useState<{
    metalId: string;
    purityId: string;
  } | null>(null);

  const [drilldownBucket, setDrilldownBucket] = useState<StockPositionRow | null>(null);
  const [drilldownMovements, setDrilldownMovements] = useState<Array<{
    id: string;
    movementType: string;
    weightGrams: string;
    reference?: string | null;
    createdAt: string;
    createdByName: string;
  }>>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  const isAdmin = userRole === "ADMIN";

  const filtered = initialPositions.filter((pos) => {
    const matchesMetal = metalFilter === "ALL" || pos.metalId === metalFilter;
    const matchesSearch =
      pos.metalName.toLowerCase().includes(search.toLowerCase()) ||
      pos.purityLabel.toLowerCase().includes(search.toLowerCase());
    return matchesMetal && matchesSearch;
  });

  // KPI Calculations
  let totalGoldGrams = 0;
  let totalSilverGrams = 0;
  let totalInventoryValue = 0;

  for (const pos of initialPositions) {
    const current = parseFloat(pos.currentWeightGrams) || 0;
    const avgRate = parseFloat(pos.averagePurchaseRate) || 0;
    if (pos.metalCode === "GOLD") totalGoldGrams += current;
    if (pos.metalCode === "SILVER") totalSilverGrams += current;
    totalInventoryValue += current * avgRate;
  }

  const handleOpenDrilldown = async (pos: StockPositionRow) => {
    setDrilldownBucket(pos);
    setLoadingMovements(true);
    const res = await getBucketMovementsAction(pos.metalId, pos.purityId);
    setLoadingMovements(false);
    if (res.success && res.movements) {
      setDrilldownMovements(res.movements);
    } else {
      setDrilldownMovements([]);
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-xs uppercase font-bold tracking-wider hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card glass-card-hover p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
              Total Gold In Stock
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#C59A58]/15 text-[#C59A58] flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
            {formatGrams(totalGoldGrams)}
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">Across all gold purities</span>
        </div>

        <div className="kpi-card glass-card-hover p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
              Total Silver In Stock
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-500/15 text-slate-500 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
            {formatGrams(totalSilverGrams)}
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">Across all silver purities</span>
        </div>

        <div className="kpi-card glass-card-hover p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
              Est. Purchase Valuation
            </span>
            <div className="w-8 h-8 rounded-xl bg-green-500/15 text-green-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-[#C59A58]">
            {formatCurrency(totalInventoryValue)}
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">Weight × Avg Purchase Rate</span>
        </div>

        <div className="kpi-card glass-card-hover p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
              Tracked Stock Buckets
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-500 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
            {initialPositions.length}
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">Independent (Metal × Purity) buckets</span>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search metal, purity..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#C59A58]"
            />
          </div>

          <select
            value={metalFilter}
            onChange={(e) => setMetalFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)] focus:outline-none"
          >
            <option value="ALL">All Precious Metals</option>
            {metals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setPreselectedBucket(null);
              setShowOpeningModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59A58] hover:bg-[#af813a] text-white font-semibold text-xs transition shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Set Opening Stock</span>
          </button>
        )}
      </div>

      {/* Comprehensive Stock Inventory Table */}
      <div className="glass-card overflow-hidden border border-[var(--border-primary)] rounded-2xl shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-[var(--bg-table-head)] text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-3">Metal</th>
                <th className="py-3 px-3">Purity</th>
                <th className="py-3 px-3 text-right">Opening</th>
                <th className="py-3 px-3 text-right">Purchased</th>
                <th className="py-3 px-3 text-right">Sold</th>
                <th className="py-3 px-3 text-right">Adj In</th>
                <th className="py-3 px-3 text-right">Adj Out</th>
                <th className="py-3 px-3 text-right bg-[#C59A58]/10 text-[#966727] dark:text-[#E4BE85] font-bold">
                  On-Hand
                </th>
                <th className="py-3 px-3 text-right text-amber-500 font-semibold">
                  Reserved
                </th>
                <th className="py-3 px-4 text-right bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                  Avail to Sell
                </th>
                <th className="py-3 px-3 text-right">Avg Pur. Rate</th>
                <th className="py-3 px-3 text-right">Purchase Val</th>
                <th className="py-3 px-3 text-right">Avg Sale Rate</th>
                <th className="py-3 px-3 text-right">Sales Val</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-[var(--text-muted)]">
                    No stock buckets found
                  </td>
                </tr>
              ) : (
                filtered.map((pos) => {
                  const currentGrams = parseFloat(pos.currentWeightGrams) || 0;
                  const reservedGrams = parseFloat(pos.reservedWeightGrams || "0") || 0;
                  const availToSellGrams = pos.availableToSellWeightGrams != null
                    ? parseFloat(pos.availableToSellWeightGrams)
                    : currentGrams - reservedGrams;
                  return (
                    <tr
                      key={`${pos.metalId}_${pos.purityId}`}
                      className="hover:bg-[var(--bg-table-hover)] transition-colors"
                    >
                      <td className="py-3 px-3 font-bold text-[#C59A58]">
                        {pos.metalName}
                      </td>
                      <td className="py-3 px-3 font-semibold text-[var(--text-primary)]">
                        {pos.purityLabel}{" "}
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          ({Number(pos.fineness).toFixed(4)})
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                        {formatGrams(pos.openingWeightGrams)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-green-600 dark:text-green-400 font-semibold">
                        +{formatGrams(pos.purchasedWeightGrams)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold">
                        -{formatGrams(pos.soldWeightGrams)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                        +{formatGrams(pos.adjustmentIncreaseGrams)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                        -{formatGrams(pos.adjustmentDecreaseGrams)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold bg-[#C59A58]/10 text-[#966727] dark:text-[#E4BE85]">
                        {formatGrams(pos.currentWeightGrams)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-amber-500">
                        {reservedGrams > 0 ? `${formatGrams(reservedGrams.toString())}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {formatGrams(availToSellGrams.toString())}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                        {parseFloat(pos.averagePurchaseRate) > 0
                          ? formatCurrency(pos.averagePurchaseRate)
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-[var(--text-primary)]">
                        {formatCurrency(pos.totalPurchaseValue)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                        {parseFloat(pos.averageSellingRate) > 0
                          ? formatCurrency(pos.averageSellingRate)
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-[var(--text-primary)]">
                        {formatCurrency(pos.totalSalesValue)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenDrilldown(pos)}
                            className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[#C59A58] hover:bg-black/5"
                            title="View Bucket Ledger Movements"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          {!pos.hasOpeningStock && isAdmin && (
                            <button
                              onClick={() => {
                                setPreselectedBucket({
                                  metalId: pos.metalId,
                                  purityId: pos.purityId,
                                });
                                setShowOpeningModal(true);
                              }}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#C59A58]/20 text-[#C59A58] hover:bg-[#C59A58]/30"
                              title="Set Opening Physical Stock"
                            >
                              Set Opening
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Opening Stock Modal */}
      {showOpeningModal && (
        <OpeningStockModal
          metals={metals}
          preselected={preselectedBucket}
          onClose={() => {
            setShowOpeningModal(false);
            setPreselectedBucket(null);
          }}
          onError={(msg) => setErrorMsg(msg)}
        />
      )}

      {/* Drilldown Bucket History Modal */}
      {drilldownBucket && (
        <BucketHistoryModal
          bucket={drilldownBucket}
          movements={drilldownMovements}
          loading={loadingMovements}
          onClose={() => setDrilldownBucket(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opening Stock Modal
// ---------------------------------------------------------------------------

function OpeningStockModal({
  metals,
  preselected,
  onClose,
  onError,
}: {
  metals: StockClientProps["metals"];
  preselected?: { metalId: string; purityId: string } | null;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [metalId, setMetalId] = useState(preselected?.metalId || metals[0]?.id || "");
  const selectedMetal = metals.find((m) => m.id === metalId) || metals[0];
  const activePurities = selectedMetal?.purities.filter((p) => p.isActive) || [];
  const [purityId, setPurityId] = useState(
    preselected?.purityId || activePurities[0]?.id || ""
  );

  const [weightGrams, setWeightGrams] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleMetalChange = (newMetalId: string) => {
    setMetalId(newMetalId);
    const m = metals.find((x) => x.id === newMetalId);
    const p = m?.purities.filter((x) => x.isActive) || [];
    setPurityId(p[0]?.id || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(weightGrams);
    if (isNaN(w) || w < 0) {
      onError("Weight must be zero or a positive decimal number");
      return;
    }

    setLoading(true);
    const res = await setOpeningStockAction({
      metalId,
      purityId,
      weightGrams,
      effectiveDate: new Date(effectiveDate),
      notes: notes.trim() || undefined,
    });
    setLoading(false);

    if (res.success) {
      onClose();
    } else {
      onError(res.error || "Failed to set opening stock");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Scale className="w-4 h-4 text-[#C59A58]" />
          <span>Establish Opening Physical Stock</span>
        </h3>

        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <p>
            Opening stock establishes the starting baseline for this (Metal × Purity)
            bucket and is <strong>IMMUTABLE</strong> once created. Subsequent corrections
            must be executed via Stock Adjustments.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Metal</label>
            <select
              value={metalId}
              onChange={(e) => handleMetalChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            >
              {metals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Purity</label>
            <select
              value={purityId}
              onChange={(e) => setPurityId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            >
              {activePurities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} (Fineness: {Number(p.fineness).toFixed(4)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">
                Opening Weight (Grams) *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 100.0000"
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
              />
            </div>
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">
                Effective Date *
              </label>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Notes</label>
            <textarea
              rows={2}
              placeholder="e.g. Verified during physical audit on 01/01/2026"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[var(--border-primary)] font-semibold text-[var(--text-secondary)] hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-[#C59A58] text-white font-semibold hover:bg-[#af813a] disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Set Opening Stock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bucket History Drilldown Modal
// ---------------------------------------------------------------------------

function BucketHistoryModal({
  bucket,
  movements,
  loading,
  onClose,
}: {
  bucket: StockPositionRow;
  movements: Array<{
    id: string;
    movementType: string;
    weightGrams: string;
    reference?: string | null;
    createdAt: string;
    createdByName: string;
  }>;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Stock Ledger: {bucket.metalName} ({bucket.purityLabel})
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Fineness: {Number(bucket.fineness).toFixed(4)} | Current Available Balance:{" "}
              <strong className="text-[#C59A58]">{formatGrams(bucket.currentWeightGrams)}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-black/5"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
              <Loader2 className="w-6 h-6 animate-spin text-[#C59A58]" />
              <span className="text-xs">Loading ledger entries...</span>
            </div>
          ) : movements.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              No stock movements recorded for this bucket yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-table-head)] text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)] sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3 text-right">Signed Weight</th>
                  <th className="py-2.5 px-3">Reference</th>
                  <th className="py-2.5 px-3">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)]">
                {movements.map((m) => {
                  const w = parseFloat(m.weightGrams);
                  const isPositive = w > 0;
                  return (
                    <tr key={m.id} className="hover:bg-[var(--bg-table-hover)]">
                      <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                        {formatDate(m.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[var(--text-primary)]">
                        {m.movementType}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-bold ${
                          isPositive
                            ? "text-green-600 dark:text-green-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isPositive ? `+${formatGrams(w)}` : formatGrams(w)}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-muted)] truncate max-w-xs">
                        {m.reference || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                        {m.createdByName}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
