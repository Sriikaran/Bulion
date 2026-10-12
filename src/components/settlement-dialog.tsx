"use client";

import React, { useState, useEffect, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/utils/helpers";
import {
  DollarSign,
  Plus,
  Loader2,
  AlertCircle,
  Ban,
  CheckCircle,
  Clock,
  CreditCard,
  X,
} from "lucide-react";
import {
  recordPaymentAction,
  cancelPaymentAction,
  getInvoiceSettlementAction,
} from "@/lib/actions/settlement-actions";
import type { PaymentMode, PaymentType } from "@prisma/client";

export interface SettlementPaymentItem {
  id: string;
  paymentNumber: string;
  type: PaymentType;
  date: string;
  amount: string;
  paymentMode: PaymentMode;
  referenceNumber?: string | null;
  notes?: string | null;
  status: "COMPLETED" | "CANCELLED";
  cancelReason?: string | null;
  cancelledAt?: string | null;
  createdByName?: string;
  createdAt?: string;
}

export interface SettlementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: "PURCHASE" | "SALE";
  counterpartyId?: string;
  counterpartyName: string;
  totalAmount?: string;
  invoiceTotal?: string;
  paidAmount?: string;
  outstandingAmount?: string;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  isCancelled?: boolean;
  payments?: SettlementPaymentItem[];
  userRole: "ADMIN" | "STAFF";
  onSuccess?: () => void;
}

export function SettlementDialog({
  isOpen,
  onClose,
  invoiceId,
  invoiceNumber,
  invoiceType,
  counterpartyName,
  totalAmount,
  invoiceTotal,
  paidAmount: initialPaid = "0",
  outstandingAmount: initialOutstanding,
  paymentStatus: initialStatus = "UNPAID",
  isCancelled = false,
  payments: initialPayments = [],
  userRole,
  onSuccess,
}: SettlementDialogProps) {
  const effectiveTotal = invoiceTotal || totalAmount || "0";
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);

  // Settlement state (live refreshed)
  const [currentTotal, setCurrentTotal] = useState(effectiveTotal);
  const [currentPaid, setCurrentPaid] = useState(initialPaid);
  const [currentOutstanding, setCurrentOutstanding] = useState(
    initialOutstanding || effectiveTotal
  );
  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const [paymentList, setPaymentList] = useState<SettlementPaymentItem[]>(initialPayments);
  const [fetchingSettlement, setFetchingSettlement] = useState(false);

  // Add Payment form state
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("BANK_TRANSFER");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  // Cancel Payment state
  const [cancellingPaymentId, setCancellingPaymentId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");

  const isAdmin = userRole === "ADMIN";
  const isPurchase = invoiceType === "PURCHASE";
  const directionText = isPurchase ? "Purchase Payment (To Supplier)" : "Sale Receipt (From Customer)";

  async function loadSettlementData() {
    setFetchingSettlement(true);
    try {
      const res = await getInvoiceSettlementAction(invoiceType, invoiceId);
      if (res.success && res.data) {
        setCurrentTotal(res.data.totalAmount != null ? res.data.totalAmount.toString() : "0");
        setCurrentPaid(res.data.totalPaid.toString());
        setCurrentOutstanding(res.data.outstandingAmount != null ? res.data.outstandingAmount.toString() : "0");
        setCurrentStatus(res.data.paymentStatus);
        setPaymentList(res.data.payments as unknown as SettlementPaymentItem[]);
      }
    } catch {
      // Keep existing state
    } finally {
      setFetchingSettlement(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    if (isOpen) {
      getInvoiceSettlementAction(invoiceType, invoiceId).then((res) => {
        if (!ignore && res.success && res.data) {
          setCurrentTotal(res.data.totalAmount != null ? res.data.totalAmount.toString() : "0");
          setCurrentPaid(res.data.totalPaid.toString());
          setCurrentOutstanding(res.data.outstandingAmount != null ? res.data.outstandingAmount.toString() : "0");
          setCurrentStatus(res.data.paymentStatus);
          setPaymentList(res.data.payments as unknown as SettlementPaymentItem[]);
        }
      });
    }
    return () => {
      ignore = true;
    };
  }, [isOpen, invoiceId, invoiceType]);

  if (!isOpen) return null;

  const handleRecord = () => {
    setFormError("");
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError("Please enter a valid amount strictly greater than 0");
      return;
    }

    const maxAllowed = parseFloat(currentOutstanding);
    if (parsedAmount > maxAllowed) {
      setFormError(
        `Amount cannot exceed the remaining balance of ${formatCurrency(maxAllowed.toString())}`
      );
      return;
    }

    startTransition(async () => {
      const res = await recordPaymentAction({
        type: isPurchase ? "PAYMENT" : "RECEIPT",
        date: new Date(paymentDate),
        amount: parsedAmount,
        paymentMode,
        referenceNumber: referenceNumber.trim() || null,
        notes: notes.trim() || null,
        purchaseId: isPurchase ? invoiceId : null,
        saleId: !isPurchase ? invoiceId : null,
      });

      if (res.success) {
        setAmount("");
        setReferenceNumber("");
        setNotes("");
        setShowAddForm(false);
        await loadSettlementData();
        if (onSuccess) onSuccess();
      } else {
        setFormError(res.error || "Failed to record transaction");
      }
    });
  };

  const handleCancelPayment = (paymentId: string) => {
    setCancelError("");
    if (!cancelReason.trim()) {
      setCancelError("A cancellation reason is required");
      return;
    }

    startTransition(async () => {
      const res = await cancelPaymentAction({
        id: paymentId,
        reason: cancelReason.trim(),
      });

      if (res.success) {
        setCancellingPaymentId(null);
        setCancelReason("");
        setCancelError("");
        await loadSettlementData();
        if (onSuccess) onSuccess();
      } else {
        setCancelError(res.error || "Failed to cancel transaction");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#C59A58]" />
              <span>Financial Settlement — {invoiceNumber}</span>
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {directionText} ({counterpartyName})
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div>
              {currentStatus === "PAID" && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/15 text-green-500 border border-green-500/30 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Fully Paid
                </span>
              )}
              {currentStatus === "PARTIALLY_PAID" && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Partially Paid
                </span>
              )}
              {currentStatus === "UNPAID" && !isCancelled && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-500/15 text-gray-400 border border-gray-500/30">
                  Unpaid
                </span>
              )}
              {isCancelled && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                  Invoice Cancelled
                </span>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-white/5 border border-[var(--border-primary)]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Invoice Total
            </span>
            <div className="text-base font-extrabold text-[var(--text-primary)] mt-0.5 font-mono">
              {formatCurrency(currentTotal)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
              Total {isPurchase ? "Paid" : "Received"}
            </span>
            <div className="text-base font-extrabold text-green-400 mt-0.5 font-mono">
              {formatCurrency(currentPaid)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Outstanding Balance
            </span>
            <div className="text-base font-extrabold text-amber-400 mt-0.5 font-mono">
              {formatCurrency(currentOutstanding)}
            </div>
          </div>
        </div>

        {/* Action Button: Add Payment */}
        {!isCancelled && currentStatus !== "PAID" && !showAddForm && (
          <div className="flex justify-end pt-1">
            <button
              onClick={() => {
                setAmount(parseFloat(currentOutstanding) > 0 ? currentOutstanding : "");
                setShowAddForm(true);
              }}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-[#C59A58] hover:bg-[#B38744] text-white flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Record {isPurchase ? "Payment" : "Receipt"}</span>
            </button>
          </div>
        )}

        {/* Add Payment / Receipt Form */}
        {showAddForm && (
          <div className="p-4 rounded-xl bg-black/20 border border-[var(--border-primary)] space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)]/50 pb-2">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-[#C59A58]" />
                Record New {isPurchase ? "Payment to Supplier" : "Receipt from Customer"}
              </span>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-xs text-[var(--text-muted)] hover:text-white"
              >
                Cancel
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Amount (INR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={currentOutstanding}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-white font-mono font-bold focus:outline-none focus:border-[#C59A58]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-white focus:outline-none focus:border-[#C59A58]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Payment Mode *
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-white font-medium focus:outline-none focus:border-[#C59A58]"
                >
                  <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CARD">Card</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Transaction / UTR Reference #
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="e.g. UTR12345678"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-white focus:outline-none focus:border-[#C59A58]"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional settlement notes"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-primary)] text-white focus:outline-none focus:border-[#C59A58]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-primary)]/40">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] text-xs text-[var(--text-secondary)] hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleRecord}
                className="px-4 py-1.5 rounded-xl bg-[#C59A58] hover:bg-[#B38744] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm & Record
              </button>
            </div>
          </div>
        )}

        {/* Payment History Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Settlement History ({paymentList.length})
            </span>
            {fetchingSettlement && (
              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Refreshing...
              </span>
            )}
          </div>

          {paymentList.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)] bg-white/5 rounded-xl border border-[var(--border-primary)]">
              No financial settlements recorded for this invoice yet.
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-primary)] overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-[var(--bg-card-hover)] text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Payment #</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3">Reference</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    {isAdmin && <th className="py-2.5 px-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)]/50 text-[var(--text-primary)]">
                  {paymentList.map((p) => {
                    const isPaymentCancelled = p.status === "CANCELLED";
                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-white/5 transition-colors ${
                          isPaymentCancelled ? "opacity-40 line-through bg-red-500/5" : ""
                        }`}
                      >
                        <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">
                          {formatDate(p.date)}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-[#C59A58] whitespace-nowrap">
                          {p.paymentNumber}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10">
                            {p.paymentMode}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[120px]">
                          {p.referenceNumber || "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-white whitespace-nowrap">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {isPaymentCancelled ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                              Cancelled
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                              Completed
                            </span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-2 px-3 text-right">
                            {!isPaymentCancelled && (
                              <button
                                onClick={() => {
                                  setCancellingPaymentId(p.id);
                                  setCancelReason("");
                                  setCancelError("");
                                }}
                                className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
                                title="Reverse / Cancel Payment"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cancellation Reason Modal */}
        {cancellingPaymentId && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 space-y-3">
            <h4 className="text-xs font-bold text-red-400 flex items-center gap-1.5">
              <Ban className="w-4 h-4" />
              <span>Confirm Financial Reversal</span>
            </h4>
            <p className="text-[11px] text-[var(--text-muted)]">
              Reversing this transaction will restore the outstanding balance on invoice {invoiceNumber} and record an audit log.
            </p>

            {cancelError && (
              <div className="p-2 rounded bg-red-500/20 text-red-300 text-xs">
                {cancelError}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                Reason for Reversal *
              </label>
              <input
                type="text"
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Dishonoured cheque, wrong bank account, duplicate entry"
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-red-500/30 text-white text-xs focus:outline-none focus:border-red-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCancellingPaymentId(null)}
                className="px-3 py-1 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-white/5"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={isPending || !cancelReason.trim()}
                onClick={() => handleCancelPayment(cancellingPaymentId)}
                className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                Confirm Reversal
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-[var(--border-primary)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold border border-[var(--border-primary)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
