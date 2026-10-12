"use client";

import React, { useState, useTransition } from "react";
import Decimal from "decimal.js";
import { formatCurrency, formatGrams } from "@/lib/utils/helpers";
import { fixPurchaseRateAction } from "@/lib/actions/purchase-actions";
import { fixSaleRateAction } from "@/lib/actions/sale-actions";
import { X, CheckCircle2, AlertCircle, Loader2, DollarSign } from "lucide-react";

export interface FixRateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId: string;
  invoiceNumber: string;
  transactionType: "PURCHASE" | "SALE";
  metalName: string;
  metalCode: string;
  purityLabel: string;
  weightGrams: string;
  counterpartyName: string;
  onSuccess: () => void;
}

export function FixRateDialog({
  isOpen,
  onClose,
  transactionId,
  invoiceNumber,
  transactionType,
  metalName,
  metalCode,
  purityLabel,
  weightGrams,
  counterpartyName,
  onSuccess,
}: FixRateDialogProps) {
  const [rateInput, setRateInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  // Calculate live preview
  let calculatedTotal: Decimal | null = null;
  let calculationError: string | null = null;

  if (rateInput.trim()) {
    try {
      const rate = new Decimal(rateInput.trim());
      const weight = new Decimal(weightGrams);
      if (rate.greaterThan(0) && weight.greaterThan(0)) {
        calculatedTotal = weight.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else if (rate.lessThanOrEqualTo(0)) {
        calculationError = "Rate must be strictly greater than zero.";
      }
    } catch {
      calculationError = "Please enter a valid numeric rate.";
    }
  }

  const handleConfirm = () => {
    setErrorMsg(null);
    if (!rateInput.trim()) {
      setErrorMsg("Rate per gram is required.");
      return;
    }
    if (calculationError || !calculatedTotal) {
      setErrorMsg(calculationError || "Invalid rate or calculation.");
      return;
    }

    startTransition(async () => {
      const payload = { id: transactionId, ratePerGram: rateInput.trim() };
      const res =
        transactionType === "PURCHASE"
          ? await fixPurchaseRateAction(payload)
          : await fixSaleRateAction(payload);

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMsg(res.error || "Failed to fix transaction rate.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div
        className="w-full max-w-lg rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fix-rate-title"
      >
        {/* Header */}
        <div className="p-5 border-b border-[var(--border-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 id="fix-rate-title" className="font-bold text-base text-[var(--text-primary)]">
                Fix Rate — {transactionType === "PURCHASE" ? "Purchase" : "Sale"} #{invoiceNumber}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {counterpartyName} • {metalName} ({purityLabel})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Transaction Summary Card */}
          <div className="p-4 rounded-xl bg-[var(--bg-card-hover)]/40 border border-[var(--border-primary)] space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Transaction:</span>
              <span className="font-bold font-mono">{invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Counterparty:</span>
              <span className="font-semibold">{counterpartyName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Metal & Purity:</span>
              <span>
                {metalName} ({metalCode}) • {purityLabel}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Agreed Weight:</span>
              <span className="font-bold font-mono text-[var(--text-primary)]">
                {formatGrams(weightGrams)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Current Rate Status:</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/30">
                UNFIXED
              </span>
            </div>
          </div>

          {/* New Rate Input */}
          <div className="space-y-2">
            <label
              htmlFor="newRateInput"
              className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              New Rate / Gram (₹) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">
                ₹
              </span>
              <input
                id="newRateInput"
                type="number"
                step="any"
                min="0.01"
                placeholder="e.g. 12250.00"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                disabled={isPending}
                className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm font-mono focus:outline-none focus:border-[#C59A58]"
                autoFocus
              />
            </div>
            {calculationError && (
              <p className="text-[11px] text-red-500">{calculationError}</p>
            )}
          </div>

          {/* Real-time Calculation Preview */}
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Formula & Calculated Amount
            </div>
            <div className="flex items-baseline justify-between text-xs font-mono">
              <span className="text-[var(--text-muted)]">Weight × Rate:</span>
              <span className="font-semibold">
                {formatGrams(weightGrams)} × {rateInput.trim() ? `₹${rateInput.trim()}/g` : "₹0/g"}
              </span>
            </div>
            <div className="pt-2 border-t border-amber-500/20 flex items-baseline justify-between">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Final Total Amount:
              </span>
              <span className="text-base font-extrabold font-mono text-[#C59A58]">
                {calculatedTotal ? formatCurrency(calculatedTotal.toString()) : "₹0.00"}
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] pt-1">
              Once fixed, this rate is immutable and permanently recorded in the audit journal.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--bg-card-hover)]/30 border-t border-[var(--border-primary)] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-xs font-medium rounded-xl hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || !calculatedTotal}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-[#C59A58] text-white hover:bg-[#B38947] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-[#C59A58]/20 transition-all"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Fixing Rate...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirm Rate Fixing
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
