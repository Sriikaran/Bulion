"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Sliders,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Ban,
  Loader2,
  AlertTriangle,
  Scale,
} from "lucide-react";
import {
  createAdjustmentAction,
  cancelAdjustmentAction,
  getAvailableStockAction,
} from "@/lib/actions/stock-actions";
import { formatGrams, formatDate } from "@/lib/utils/helpers";
import type { AdjustmentDirection, TransactionStatus } from "@prisma/client";

interface AdjustmentRow {
  id: string;
  date: string | Date;
  metalId: string;
  purityId: string;
  direction: AdjustmentDirection;
  weightGrams: string;
  reason: string;
  notes?: string | null;
  status: TransactionStatus;
  cancelReason?: string | null;
  cancelledAt?: string | Date | null;
  createdAt: string | Date;
  metal: { id: string; name: string; code: string };
  purity: { id: string; label: string; fineness: string };
  createdBy: { id: string; name: string; email: string };
}

interface AdjustmentsClientProps {
  initialAdjustments: AdjustmentRow[];
  metals: Array<{
    id: string;
    name: string;
    code: string;
    purities: Array<{ id: string; label: string; fineness: string; isActive: boolean }>;
  }>;
  userRole: "ADMIN" | "STAFF";
}

export function AdjustmentsClient({
  initialAdjustments,
  metals,
  userRole,
}: AdjustmentsClientProps) {
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("ALL");
  const [metalFilter, setMetalFilter] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [cancellingAdjustment, setCancellingAdjustment] = useState<AdjustmentRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const isAdmin = userRole === "ADMIN";

  const filtered = initialAdjustments.filter((adj) => {
    const matchesSearch =
      adj.reason.toLowerCase().includes(search.toLowerCase()) ||
      adj.metal.name.toLowerCase().includes(search.toLowerCase()) ||
      adj.purity.label.toLowerCase().includes(search.toLowerCase()) ||
      (adj.notes && adj.notes.toLowerCase().includes(search.toLowerCase()));

    const matchesDirection = directionFilter === "ALL" || adj.direction === directionFilter;
    const matchesMetal = metalFilter === "ALL" || adj.metalId === metalFilter;

    return matchesSearch && matchesDirection && matchesMetal;
  });

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

      {/* Filters and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search reason, metal..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#C59A58]"
            />
          </div>

          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)] focus:outline-none"
          >
            <option value="ALL">All Directions</option>
            <option value="INCREASE">Increase (+)</option>
            <option value="DECREASE">Decrease (-)</option>
          </select>

          <select
            value={metalFilter}
            onChange={(e) => setMetalFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)] focus:outline-none"
          >
            <option value="ALL">All Metals</option>
            {metals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59A58] hover:bg-[#af813a] text-white font-semibold text-xs transition shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Stock Adjustment</span>
          </button>
        )}
      </div>

      {/* Adjustments Table */}
      <div className="glass-card overflow-hidden border border-[var(--border-primary)] rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-table-head)] text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Metal & Purity</th>
                <th className="py-3 px-4">Direction</th>
                <th className="py-3 px-4 text-right">Adjusted Weight</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Authorized By</th>
                <th className="py-3 px-4">Status</th>
                {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[var(--text-muted)]">
                    No stock adjustments found
                  </td>
                </tr>
              ) : (
                filtered.map((adj) => (
                  <tr
                    key={adj.id}
                    className={`hover:bg-[var(--bg-table-hover)] transition-colors ${
                      adj.status === "CANCELLED" ? "opacity-60 bg-red-500/5" : ""
                    }`}
                  >
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {formatDate(adj.date)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {adj.metal.name}
                      </span>{" "}
                      <span className="text-[var(--text-muted)]">({adj.purity.label})</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          adj.direction === "INCREASE"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {adj.direction === "INCREASE" ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {adj.direction}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold ${
                        adj.direction === "INCREASE"
                          ? "text-green-600 dark:text-green-400"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {adj.direction === "INCREASE" ? "+" : "-"}
                      {formatGrams(adj.weightGrams)}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-[var(--text-primary)]">{adj.reason}</div>
                      {adj.notes && (
                        <div className="text-[10px] text-[var(--text-muted)] truncate">
                          {adj.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {adj.createdBy.name}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          adj.status === "POSTED"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                            : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                        }`}
                      >
                        {adj.status === "POSTED" ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {adj.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-right">
                        {adj.status === "POSTED" && (
                          <button
                            onClick={() => setCancellingAdjustment(adj)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition"
                            title="Cancel adjustment and reverse stock movement"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Cancel</span>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Adjustment Modal */}
      {showNewModal && (
        <NewAdjustmentModal
          metals={metals}
          onClose={() => setShowNewModal(false)}
          onError={(msg) => setErrorMsg(msg)}
        />
      )}

      {/* Cancel Adjustment Modal */}
      {cancellingAdjustment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-red-500 flex items-center gap-2">
              <Ban className="w-4 h-4" />
              <span>Cancel Stock Adjustment</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              This action will reverse the adjustment effect (
              {cancellingAdjustment.direction === "INCREASE" ? "-" : "+"}
              {formatGrams(cancellingAdjustment.weightGrams)}) by creating an immutable reversing
              StockMovement row in the ledger.
            </p>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                Reason for Cancellation *
              </label>
              <textarea
                rows={3}
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Physical recount confirmed original weight was correct"
                className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCancellingAdjustment(null);
                  setCancelReason("");
                }}
                className="px-4 py-2 text-xs rounded-xl border border-[var(--border-primary)] font-semibold text-[var(--text-secondary)]"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={!cancelReason.trim() || isPending}
                onClick={() => {
                  startTransition(async () => {
                    const res = await cancelAdjustmentAction({
                      id: cancellingAdjustment.id,
                      reason: cancelReason,
                    });
                    if (res.success) {
                      setCancellingAdjustment(null);
                      setCancelReason("");
                    } else {
                      setErrorMsg(res.error || "Failed to cancel adjustment");
                    }
                  });
                }}
                className="px-4 py-2 text-xs rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Adjustment Modal
// ---------------------------------------------------------------------------

function NewAdjustmentModal({
  metals,
  onClose,
  onError,
}: {
  metals: AdjustmentsClientProps["metals"];
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const [metalId, setMetalId] = useState(metals[0]?.id || "");
  const selectedMetal = metals.find((m) => m.id === metalId) || metals[0];
  const activePurities = selectedMetal?.purities.filter((p) => p.isActive) || [];
  const [purityId, setPurityId] = useState(activePurities[0]?.id || "");

  const [direction, setDirection] = useState<AdjustmentDirection>("INCREASE");
  const [weightGrams, setWeightGrams] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const [availableStockGrams, setAvailableStockGrams] = useState<string>("0.0000");
  const [checkingStock, setCheckingStock] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!metalId || !purityId) return;
    let isCurrent = true;

    async function fetchStock() {
      setCheckingStock(true);
      const res = await getAvailableStockAction(metalId, purityId);
      if (isCurrent) {
        setCheckingStock(false);
        if (res.success && res.availableGrams) {
          setAvailableStockGrams(res.availableGrams);
        } else {
          setAvailableStockGrams("0.0000");
        }
      }
    }

    void fetchStock();

    return () => {
      isCurrent = false;
    };
  }, [metalId, purityId]);

  const handleMetalChange = (newMetalId: string) => {
    setMetalId(newMetalId);
    const m = metals.find((x) => x.id === newMetalId);
    const p = m?.purities.filter((x) => x.isActive) || [];
    setPurityId(p[0]?.id || "");
  };

  const weightNum = parseFloat(weightGrams) || 0;
  const currentNum = parseFloat(availableStockGrams) || 0;
  const resultingStock =
    direction === "INCREASE" ? currentNum + weightNum : currentNum - weightNum;

  const isInsufficient = direction === "DECREASE" && weightNum > currentNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      onError("Reason is required");
      return;
    }
    if (weightNum <= 0) {
      onError("Weight must be greater than 0");
      return;
    }
    if (isInsufficient) {
      onError(
        `Cannot decrease stock below zero (Available: ${formatGrams(
          currentNum
        )}, Requested: ${formatGrams(weightNum)})`
      );
      return;
    }

    setLoading(true);
    const res = await createAdjustmentAction({
      date: new Date(date),
      metalId,
      purityId,
      direction,
      weightGrams,
      reason: reason.trim(),
      notes: notes.trim() || undefined,
    });
    setLoading(false);

    if (res.success) {
      onClose();
    } else {
      onError(res.error || "Failed to record adjustment");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#C59A58]" />
          <span>New Stock Adjustment</span>
        </h3>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Adjustment Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
          </div>

          {/* Direction Toggle */}
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">
              Adjustment Direction *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDirection("INCREASE")}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  direction === "INCREASE"
                    ? "bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400"
                    : "border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-black/5"
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>INCREASE (+)</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection("DECREASE")}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  direction === "DECREASE"
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400"
                    : "border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-black/5"
                }`}
              >
                <ArrowDownRight className="w-4 h-4" />
                <span>DECREASE (-)</span>
              </button>
            </div>
          </div>

          {/* Live Stock Comparison Card */}
          <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Current Available:</span>
              <span className="font-mono font-bold text-[var(--text-primary)]">
                {checkingStock ? (
                  <Loader2 className="w-3 h-3 animate-spin inline" />
                ) : (
                  formatGrams(availableStockGrams)
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Requested Change:</span>
              <span
                className={`font-mono font-bold ${
                  direction === "INCREASE"
                    ? "text-green-600 dark:text-green-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {direction === "INCREASE" ? "+" : "-"}
                {formatGrams(weightNum)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border-primary)] pt-1.5 font-bold">
              <span className="text-[var(--text-secondary)]">Resulting Stock Preview:</span>
              <span
                className={`font-mono text-sm ${
                  resultingStock < 0
                    ? "text-red-500"
                    : "text-[#C59A58]"
                }`}
              >
                {formatGrams(resultingStock)}
              </span>
            </div>
          </div>

          {/* Weight */}
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">
              Weight (Grams) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 5.0000"
              value={weightGrams}
              onChange={(e) => setWeightGrams(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border font-mono ${
                isInsufficient
                  ? "border-red-500 focus:border-red-500 text-red-500"
                  : "border-[var(--border-primary)] text-[var(--text-primary)]"
              }`}
            />
            {isInsufficient && (
              <p className="mt-1 text-[11px] font-semibold text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>Cannot decrease stock below zero</span>
              </p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Reason *</label>
            <input
              type="text"
              required
              placeholder="e.g. Refining loss, scale recalibration, physical count discrepancy"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Notes</label>
            <textarea
              rows={2}
              placeholder="Optional additional audit context"
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
              disabled={loading || isInsufficient}
              className="px-4 py-2 rounded-xl bg-[#C59A58] text-white font-semibold hover:bg-[#af813a] disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save & Post Adjustment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
