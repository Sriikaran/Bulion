"use client";

import React, { useState, useEffect, useTransition } from "react";
import Decimal from "decimal.js";
import {
  createRateReservationAction,
  consumeRateReservationAction,
  cancelRateReservationAction,
  getReservationsForTransactionAction,
} from "@/lib/actions/reservation-actions";
import { getCurrentMarketRateAction } from "@/lib/actions/market-rate-actions";
import { formatCurrency, formatGrams, formatDate } from "@/lib/utils/helpers";
import {
  Lock,
  Clock,
  XCircle,
  AlertCircle,
  Loader2,
  Check,
  Plus,
  ShieldAlert,
} from "lucide-react";

export interface RateReservationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  transaction: {
    id: string;
    invoiceNumber: string;
    type: "PURCHASE" | "SALE";
    metalId?: string;
    purityId?: string;
    metalName: string;
    metalCode: string;
    purityLabel: string;
    weightGrams: string | number;
    counterpartyName?: string;
    status?: string;
    rateStatus?: string;
  } | null;
}

interface ReservationItem {
  id: string;
  reservationNumber: string;
  status: "ACTIVE" | "CONSUMED" | "EXPIRED" | "CANCELLED";
  weightGrams: string;
  reservedRatePerGram: string;
  reservedAmount: string;
  reservedAt: string;
  expiresAt: string;
  notes?: string | null;
}

export function RateReservationDialog(props: RateReservationDialogProps) {
  if (!props.isOpen || !props.transaction) return null;
  return (
    <RateReservationDialogInner
      key={props.transaction.id}
      transaction={props.transaction}
      onClose={props.onClose}
      onSuccess={props.onSuccess}
    />
  );
}

function RateReservationDialogInner({
  transaction,
  onClose,
  onSuccess,
}: {
  transaction: NonNullable<RateReservationDialogProps["transaction"]>;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"NEW" | "LIST">("NEW");
  const [weightInput, setWeightInput] = useState(() => transaction.weightGrams.toString());
  const [rateInput, setRateInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [expiryHours, setExpiryHours] = useState("4");
  const [customExpiry, setCustomExpiry] = useState(() => {
    const defaultDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const tzOffset = defaultDate.getTimezoneOffset() * 60000;
    return new Date(defaultDate.getTime() - tzOffset).toISOString().slice(0, 16);
  });

  const [currentTime] = useState(() => Date.now());
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [marketRefRate, setMarketRefRate] = useState<{ ratePerGram: string; source: string | null } | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reloadReservations = React.useCallback(async () => {
    setLoadingList(true);
    const res = await getReservationsForTransactionAction(transaction.type, transaction.id);
    setLoadingList(false);
    if (res.success && res.data) {
      const list = res.data as unknown as ReservationItem[];
      setReservations(list);
      if (list.length > 0) {
        setActiveTab("LIST");
      }
    }
  }, [transaction.type, transaction.id]);

  useEffect(() => {
    let active = true;
    getReservationsForTransactionAction(transaction.type, transaction.id).then((res) => {
      if (!active) return;
      setLoadingList(false);
      if (res.success && res.data) {
        const list = res.data as unknown as ReservationItem[];
        setReservations(list);
        if (list.length > 0) {
          setActiveTab("LIST");
        }
      }
    });

    if (transaction.metalId && transaction.purityId) {
      getCurrentMarketRateAction(transaction.metalId, transaction.purityId).then((res) => {
        if (!active) return;
        if (res.success && res.data) {
          setMarketRefRate({
            ratePerGram: res.data.ratePerGram,
            source: res.data.source || null,
          });
        }
      });
    }

    return () => {
      active = false;
    };
  }, [transaction.type, transaction.id, transaction.metalId, transaction.purityId]);

  // Real-time calculation
  let parsedWeight = new Decimal(0);
  let parsedRate = new Decimal(0);
  let reservedAmount: Decimal | null = null;
  let calculationError: string | null = null;

  const totalAgreed = new Decimal(transaction.weightGrams.toString());

  // Compute active reserved weight
  const activeReservedTotal = reservations
    .filter((r) => r.status === "ACTIVE" && new Date(r.expiresAt).getTime() > currentTime)
    .reduce((sum, r) => sum.plus(new Decimal(r.weightGrams)), new Decimal(0));

  const reservableWeight = Decimal.max(0, totalAgreed.minus(activeReservedTotal));

  if (weightInput.trim() !== "" && rateInput.trim() !== "") {
    try {
      parsedWeight = new Decimal(weightInput);
      parsedRate = new Decimal(rateInput);

      if (parsedWeight.lessThanOrEqualTo(0)) {
        calculationError = "Reserved weight must be strictly positive.";
      } else if (parsedWeight.greaterThan(reservableWeight)) {
        calculationError = `Weight exceeds available unreserved quantity (${reservableWeight.toFixed(4)}g).`;
      } else if (parsedRate.lessThanOrEqualTo(0)) {
        calculationError = "Reserved rate must be strictly positive.";
      } else {
        reservedAmount = parsedWeight.times(parsedRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
    } catch {
      calculationError = "Please enter valid numeric weight and rate.";
    }
  }

  const handleCreate = () => {
    setError(null);
    if (!weightInput || !rateInput) {
      setError("Please fill in weight and reserved rate.");
      return;
    }

    let expiryDate: Date;
    if (expiryHours === "custom") {
      expiryDate = new Date(customExpiry);
    } else {
      const h = parseFloat(expiryHours);
      expiryDate = new Date(Date.now() + h * 3600 * 1000);
    }

    if (expiryDate.getTime() <= Date.now()) {
      setError("Expiry timestamp must be strictly in the future.");
      return;
    }

    startTransition(async () => {
      const res = await createRateReservationAction({
        type: transaction.type,
        transactionId: transaction.id,
        weightGrams: weightInput,
        reservedRatePerGram: rateInput,
        expiresAt: expiryDate,
        notes: notesInput || undefined,
      });

      if (res.success) {
        setWeightInput("");
        setRateInput("");
        setNotesInput("");
        await reloadReservations();
        setActiveTab("LIST");
        if (onSuccess) onSuccess();
      } else {
        setError(res.error || "Failed to create rate reservation");
      }
    });
  };

  const handleConsume = (reservationId: string) => {
    if (!confirm("Are you sure you want to consume this reservation and fix the final transaction rate?")) return;
    setError(null);

    startTransition(async () => {
      const res = await consumeRateReservationAction({
        reservationId,
      });

      if (res.success) {
        await reloadReservations();
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setError(res.error || "Failed to consume rate reservation");
      }
    });
  };

  const handleCancel = (reservationId: string) => {
    const reason = prompt("Enter reason for cancelling this reservation (optional):") || undefined;
    setError(null);

    startTransition(async () => {
      const res = await cancelRateReservationAction({
        reservationId,
        reason,
      });

      if (res.success) {
        await reloadReservations();
        if (onSuccess) onSuccess();
      } else {
        setError(res.error || "Failed to cancel rate reservation");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Rate Reservation / Rate Block
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                {transaction.type} — <span className="font-mono text-[#C59A58]">{transaction.invoiceNumber}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* Transaction Summary Card */}
        <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div>
            <span className="text-[10px] text-[var(--text-muted)] block uppercase">Metal & Purity</span>
            <span className="font-bold text-[var(--text-primary)]">
              {transaction.metalName} ({transaction.purityLabel})
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--text-muted)] block uppercase">Agreed Deal Weight</span>
            <span className="font-mono font-bold text-[var(--text-primary)]">
              {formatGrams(transaction.weightGrams)}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--text-muted)] block uppercase">Active Reserved</span>
            <span className="font-mono font-bold text-amber-500">
              {formatGrams(activeReservedTotal.toString())}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--text-muted)] block uppercase">Reservable Weight</span>
            <span className="font-mono font-bold text-emerald-500">
              {formatGrams(reservableWeight.toString())}
            </span>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 border-b border-[var(--border-primary)] pb-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("NEW")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition ${
              activeTab === "NEW"
                ? "bg-[#C59A58] text-white"
                : "text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Reservation</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("LIST")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition ${
              activeTab === "LIST"
                ? "bg-[#C59A58] text-white"
                : "text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Existing Reservations ({reservations.length})</span>
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: Create New Reservation */}
        {activeTab === "NEW" && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
                  Reserved Weight (Grams) *
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  max={reservableWeight.toString()}
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="e.g. 500.000"
                  className="w-full p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase">
                    Reserved Rate / Gram (₹) *
                  </label>
                  {marketRefRate && (
                    <button
                      type="button"
                      onClick={() => setRateInput(marketRefRate.ratePerGram)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition"
                      title="Populate with current reference rate"
                    >
                      <span>Ref: {formatCurrency(marketRefRate.ratePerGram)}/g</span>
                      <span className="text-[9px] underline">(Use)</span>
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="e.g. 12250.00"
                  className="w-full p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
                />
                {marketRefRate && (
                  <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">
                    Market reference rate — not the final transaction rate.
                  </span>
                )}
              </div>
            </div>

            {/* Expiry Presets */}
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
                Validity / Expiration *
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: "1 Hour", value: "1" },
                  { label: "4 Hours", value: "4" },
                  { label: "8 Hours", value: "8" },
                  { label: "24 Hours", value: "24" },
                  { label: "Custom", value: "custom" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExpiryHours(opt.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                      expiryHours === opt.value
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-500"
                        : "border-[var(--border-primary)] text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {expiryHours === "custom" && (
                <div className="mt-2">
                  <input
                    type="datetime-local"
                    value={customExpiry}
                    onChange={(e) => setCustomExpiry(e.target.value)}
                    className="w-full p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
                  />
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1">
                Notes / Reference
              </label>
              <input
                type="text"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="e.g. Rate locked per telephonic confirmation with trading desk"
                className="w-full p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>

            {/* Live calculation banner */}
            {reservedAmount && !calculationError && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 font-mono text-xs text-amber-500 flex items-center justify-between">
                <span>Formula: {formatGrams(parsedWeight.toString())} × {formatCurrency(parsedRate.toString())}/g</span>
                <span className="font-bold text-sm">= {formatCurrency(reservedAmount.toString())}</span>
              </div>
            )}

            {calculationError && (
              <div className="p-2 text-xs text-red-400 italic">
                {calculationError}
              </div>
            )}

            {/* Disclaimers */}
            <div className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20 text-[11px] text-blue-400 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Controlled Rate Block:</strong> This reserves the rate and quantity only.
                It does NOT move physical stock into/out of the vault and does NOT generate cash payments.
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs rounded-xl border border-[var(--border-primary)] text-[var(--text-secondary)] font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isPending || reservableWeight.lessThanOrEqualTo(0) || !reservedAmount || !!calculationError}
                onClick={handleCreate}
                className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-xl bg-[#C59A58] hover:bg-[#b08442] text-white font-semibold transition disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Create Reservation</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: List of Existing Reservations */}
        {activeTab === "LIST" && (
          <div className="space-y-3 text-xs">
            {loadingList ? (
              <div className="py-8 text-center text-[var(--text-muted)] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading reservations...</span>
              </div>
            ) : reservations.length === 0 ? (
              <div className="py-8 text-center text-[var(--text-muted)]">
                No rate reservations have been created for this transaction yet.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {reservations.map((r) => {
                  const isExpired = r.status === "ACTIVE" && new Date(r.expiresAt).getTime() <= currentTime;
                  const effectiveStatus = isExpired ? "EXPIRED" : r.status;

                  return (
                    <div
                      key={r.id}
                      className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#C59A58]">
                            {r.reservationNumber}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              effectiveStatus === "ACTIVE"
                                ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                                : effectiveStatus === "CONSUMED"
                                ? "bg-green-500/10 text-green-500 border border-green-500/30"
                                : effectiveStatus === "EXPIRED"
                                ? "bg-red-500/10 text-red-400 border border-red-500/30"
                                : "bg-gray-500/10 text-gray-400 border border-gray-500/30"
                            }`}
                          >
                            {effectiveStatus}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5">
                          {effectiveStatus === "ACTIVE" && (
                            <>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleConsume(r.id)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition"
                                title="Consume reservation and fix transaction rate"
                              >
                                <Check className="w-3 h-3" />
                                <span>Consume</span>
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleCancel(r.id)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition"
                                title="Cancel reservation and release quantity"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Cancel</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono">
                        <div>
                          <span className="text-[10px] text-[var(--text-muted)] block uppercase">Reserved Weight:</span>
                          <span className="font-semibold text-[var(--text-primary)]">
                            {formatGrams(r.weightGrams)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--text-muted)] block uppercase">Reserved Rate:</span>
                          <span className="font-semibold text-[var(--text-primary)]">
                            {formatCurrency(r.reservedRatePerGram)}/g
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--text-muted)] block uppercase">Reserved Amount:</span>
                          <span className="font-bold text-[#C59A58]">
                            {formatCurrency(r.reservedAmount)}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10px] text-[var(--text-muted)] flex items-center justify-between pt-1 border-t border-[var(--border-primary)]/50">
                        <span>Reserved: {formatDate(r.reservedAt)}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-500" />
                          <span>Expires: {formatDate(r.expiresAt)}</span>
                        </span>
                      </div>

                      {r.notes && (
                        <p className="text-[11px] text-[var(--text-secondary)] italic pt-0.5">
                          &quot;{r.notes}&quot;
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-[var(--border-primary)]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs rounded-xl border border-[var(--border-primary)] text-[var(--text-secondary)] font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
