"use client";

import React, { useState, useTransition } from "react";
import Decimal from "decimal.js";
import { recordFulfilmentAction } from "@/lib/actions/fulfilment-actions";
import { PackageCheck, AlertCircle, Loader2 } from "lucide-react";

export interface FulfilmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  transaction?: {
    type: "PURCHASE" | "SALE";
    id: string;
    invoiceNumber: string;
    counterpartyName?: string;
    metalName: string;
    purityLabel: string;
    agreedWeightGrams: string | number;
    fulfilledWeightGrams: string | number;
    remainingWeightGrams: string | number;
  } | null;
  transactionId?: string;
  invoiceNumber?: string;
  transactionType?: "PURCHASE" | "SALE";
  metalName?: string;
  purityLabel?: string;
  agreedWeightGrams?: string | number;
  fulfilledWeightGrams?: string | number;
  remainingWeightGrams?: string | number;
  counterpartyName?: string;
}

export function FulfilmentDialog(props: FulfilmentDialogProps) {
  const { isOpen, onClose, onSuccess } = props;
  const transaction =
    props.transaction ||
    (props.transactionId
      ? {
          id: props.transactionId,
          type: props.transactionType || "PURCHASE",
          invoiceNumber: props.invoiceNumber || "",
          counterpartyName: props.counterpartyName,
          metalName: props.metalName || "",
          purityLabel: props.purityLabel || "",
          agreedWeightGrams: props.agreedWeightGrams || "0",
          fulfilledWeightGrams: props.fulfilledWeightGrams || "0",
          remainingWeightGrams: props.remainingWeightGrams || "0",
        }
      : null);

  const [weightInput, setWeightInput] = useState("");
  const [dateInput, setDateInput] = useState(() => new Date().toISOString().split("T")[0]);
  const [notesInput, setNotesInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen || !transaction) return null;

  const agreed = new Decimal(transaction.agreedWeightGrams.toString());
  const alreadyFulfilled = new Decimal(transaction.fulfilledWeightGrams.toString());
  const remaining = new Decimal(transaction.remainingWeightGrams.toString());

  // Real-time calculation
  let parsedWeight = new Decimal(0);
  let isWeightValid = false;
  let calculationError: string | null = null;

  if (weightInput.trim() !== "") {
    try {
      parsedWeight = new Decimal(weightInput);
      if (parsedWeight.lessThanOrEqualTo(0)) {
        calculationError = "Fulfilment weight must be strictly greater than zero.";
      } else if (parsedWeight.greaterThan(remaining)) {
        calculationError = `Weight cannot exceed remaining unfulfilled weight (${remaining.toFixed(4)}g).`;
      } else {
        isWeightValid = true;
      }
    } catch {
      calculationError = "Please enter a valid numeric weight.";
    }
  }

  const newTotalFulfilled = isWeightValid ? alreadyFulfilled.plus(parsedWeight) : alreadyFulfilled;
  const remainingAfter = isWeightValid ? remaining.minus(parsedWeight) : remaining;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isWeightValid) {
      setError(calculationError || "Please enter a valid fulfilment weight.");
      return;
    }

    startTransition(async () => {
      const res = await recordFulfilmentAction({
        type: transaction.type,
        transactionId: transaction.id,
        weightGrams: parsedWeight.toString(),
        date: new Date(dateInput),
        notes: notesInput.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || "Failed to record physical delivery.");
      } else {
        setWeightInput("");
        setNotesInput("");
        onClose();
        if (onSuccess) onSuccess();
      }
    });
  };

  const isPurchase = transaction.type === "PURCHASE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b bg-muted/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-base text-foreground">
              Record Physical Delivery ({isPurchase ? "Goods Inward" : "Goods Outward"})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-semibold rounded-lg p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Deal details overview */}
          <div className="bg-muted/30 p-3.5 rounded-lg border text-sm space-y-2">
            <div className="flex justify-between items-center text-xs text-muted-foreground uppercase font-medium">
              <span>{transaction.type} Deal</span>
              <span className="font-mono text-foreground font-semibold">#{transaction.invoiceNumber}</span>
            </div>
            {transaction.counterpartyName && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Counterparty:</span>
                <span className="font-medium text-foreground">{transaction.counterpartyName}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Metal & Purity:</span>
              <span className="font-medium text-foreground">
                {transaction.metalName} ({transaction.purityLabel})
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t mt-2 text-center">
              <div className="bg-background/80 p-2 rounded border">
                <div className="text-[10px] text-muted-foreground uppercase">Agreed</div>
                <div className="text-xs font-bold text-foreground font-mono">{agreed.toFixed(4)}g</div>
              </div>
              <div className="bg-background/80 p-2 rounded border">
                <div className="text-[10px] text-muted-foreground uppercase">Fulfilled</div>
                <div className="text-xs font-bold text-emerald-600 font-mono">{alreadyFulfilled.toFixed(4)}g</div>
              </div>
              <div className="bg-background/80 p-2 rounded border">
                <div className="text-[10px] text-muted-foreground uppercase">Remaining</div>
                <div className="text-xs font-bold text-amber-600 font-mono">{remaining.toFixed(4)}g</div>
              </div>
            </div>
          </div>

          {/* Input fields */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-foreground">
                  Delivery Weight (Grams) <span className="text-destructive">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setWeightInput(remaining.toString())}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Fulfil All ({remaining.toFixed(4)}g)
                </button>
              </div>
              <input
                type="number"
                step="any"
                min="0"
                max={remaining.toString()}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder={`Max: ${remaining.toFixed(4)}`}
                className="w-full h-10 px-3 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                autoFocus
                required
              />
              {calculationError && (
                <p className="text-destructive text-xs mt-1">{calculationError}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Delivery Date <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Vault / Challan Notes
                </label>
                <input
                  type="text"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="e.g. Delivery challan #104"
                  className="w-full h-10 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Live calculation breakdown */}
            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-amber-600 dark:text-amber-400">
                Delivery Breakdown:
              </div>
              <div className="font-mono text-muted-foreground">
                {alreadyFulfilled.toFixed(4)}g already fulfilled +{" "}
                <span className="text-foreground font-bold">{isWeightValid ? parsedWeight.toFixed(4) : "0.0000"}g</span> this delivery ={" "}
                <span className="text-foreground font-bold">{newTotalFulfilled.toFixed(4)}g</span> total fulfilled
              </div>
              <div className="text-[11px] text-muted-foreground pt-1 border-t border-amber-500/15 flex justify-between">
                <span>Remaining unfulfilled after this delivery:</span>
                <span className="font-mono font-bold text-foreground">{remainingAfter.toFixed(4)}g</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border hover:bg-muted text-muted-foreground"
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isWeightValid || isPending}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Confirm Delivery</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
