"use client";

import React, { useState, useTransition } from "react";
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Send,
  Ban,
  Loader2,
  Calendar,
  DollarSign,
  Scale,
} from "lucide-react";
import {
  createPurchaseDraftAction,
  postPurchaseAction,
  createAndPostPurchaseAction,
  cancelPurchaseAction,
} from "@/lib/actions/purchase-actions";
import { formatCurrency, formatGrams, formatDate } from "@/lib/utils/helpers";
import type { PaymentMode, TransactionStatus } from "@prisma/client";

interface PurchaseRow {
  id: string;
  invoiceNumber: string;
  date: string | Date;
  supplierName: string;
  supplierContact?: string | null;
  counterpartyId?: string | null;
  metalId: string;
  purityId: string;
  weightGrams: string;
  ratePerGram: string;
  totalAmount: string;
  paymentMode: PaymentMode;
  notes?: string | null;
  status: TransactionStatus;
  cancelReason?: string | null;
  cancelledAt?: string | Date | null;
  createdAt: string | Date;
  metal: { id: string; name: string; code: string };
  purity: { id: string; label: string; fineness: string };
  counterparty?: { id: string; name: string; phone?: string | null } | null;
  createdBy: { id: string; name: string; email: string };
}

interface PurchasesClientProps {
  initialPurchases: PurchaseRow[];
  metals: Array<{
    id: string;
    name: string;
    code: string;
    purities: Array<{ id: string; label: string; fineness: string; isActive: boolean }>;
  }>;
  suppliers: Array<{ id: string; name: string; phone?: string | null }>;
  userRole: "ADMIN" | "STAFF";
}

export function PurchasesClient({
  initialPurchases,
  metals,
  suppliers,
  userRole,
}: PurchasesClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [metalFilter, setMetalFilter] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRow | null>(null);
  const [cancellingPurchase, setCancellingPurchase] = useState<PurchaseRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const isAdmin = userRole === "ADMIN";

  const filtered = initialPurchases.filter((p) => {
    const matchesSearch =
      p.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.supplierName.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    const matchesMetal = metalFilter === "ALL" || p.metalId === metalFilter;

    return matchesSearch && matchesStatus && matchesMetal;
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
              placeholder="Search invoice, supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#C59A58]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)] focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="POSTED">Posted</option>
            <option value="CANCELLED">Cancelled</option>
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

        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59A58] hover:bg-[#af813a] text-white font-semibold text-xs transition shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Purchase</span>
        </button>
      </div>

      {/* Purchases Register Table */}
      <div className="glass-card overflow-hidden border border-[var(--border-primary)] rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-table-head)] text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-4">Metal & Purity</th>
                <th className="py-3 px-4 text-right">Weight</th>
                <th className="py-3 px-4 text-right">Rate/g</th>
                <th className="py-3 px-4 text-right">Total Amount</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[var(--text-muted)]">
                    No purchase transactions found
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-[var(--bg-table-hover)] transition-colors ${
                      p.status === "CANCELLED" ? "opacity-60 bg-red-500/5" : ""
                    }`}
                  >
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {formatDate(p.date)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[#C59A58]">
                      {p.invoiceNumber}
                    </td>
                    <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                      {p.supplierName}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {p.metal.name}
                      </span>{" "}
                      <span className="text-[var(--text-muted)]">({p.purity.label})</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)]">
                      {formatGrams(p.weightGrams)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)]">
                      {formatCurrency(p.ratePerGram)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#C59A58]">
                      {formatCurrency(p.totalAmount)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/5 dark:bg-white/5 text-[var(--text-secondary)]">
                        {p.paymentMode}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          p.status === "POSTED"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                            : p.status === "DRAFT"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                        }`}
                      >
                        {p.status === "POSTED" ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : p.status === "DRAFT" ? (
                          <Clock className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedPurchase(p)}
                          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[#C59A58] hover:bg-black/5 dark:hover:bg-white/5"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {p.status === "DRAFT" && (
                          <button
                            disabled={isPending}
                            onClick={() => {
                              startTransition(async () => {
                                const res = await postPurchaseAction(p.id);
                                if (!res.success) setErrorMsg(res.error || "Failed to post purchase");
                              });
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 hover:bg-green-500/20 transition"
                            title="Post purchase to stock ledger"
                          >
                            <Send className="w-3 h-3" />
                            <span>Post</span>
                          </button>
                        )}
                        {p.status === "POSTED" && isAdmin && (
                          <button
                            onClick={() => setCancellingPurchase(p)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition"
                            title="Cancel purchase and reverse stock"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Cancel</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Purchase Modal */}
      {showNewModal && (
        <NewPurchaseModal
          metals={metals}
          suppliers={suppliers}
          onClose={() => setShowNewModal(false)}
          onError={(msg) => setErrorMsg(msg)}
        />
      )}

      {/* View Detail Modal */}
      {selectedPurchase && (
        <PurchaseDetailModal
          purchase={selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
        />
      )}

      {/* Cancel Reason Modal */}
      {cancellingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-red-500 flex items-center gap-2">
              <Ban className="w-4 h-4" />
              <span>Cancel Purchase {cancellingPurchase.invoiceNumber}</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              This action will reverse the physical stock (+{formatGrams(cancellingPurchase.weightGrams)})
              by creating an immutable PURCHASE_CANCEL movement in the ledger.
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
                placeholder="e.g. Invoiced in error, return to supplier, weight discrepancy"
                className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCancellingPurchase(null);
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
                    const res = await cancelPurchaseAction({
                      id: cancellingPurchase.id,
                      reason: cancelReason,
                    });
                    if (res.success) {
                      setCancellingPurchase(null);
                      setCancelReason("");
                    } else {
                      setErrorMsg(res.error || "Failed to cancel purchase");
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
// New Purchase Modal
// ---------------------------------------------------------------------------

function NewPurchaseModal({
  metals,
  suppliers,
  onClose,
  onError,
}: {
  metals: PurchasesClientProps["metals"];
  suppliers: PurchasesClientProps["suppliers"];
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState(
    () => `PUR-${Date.now().toString().slice(-6)}`
  );
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Supplier selection
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");

  // Metal & purity
  const [metalId, setMetalId] = useState(metals[0]?.id || "");
  const selectedMetal = metals.find((m) => m.id === metalId) || metals[0];
  const activePurities = selectedMetal?.purities.filter((p) => p.isActive) || [];
  const [purityId, setPurityId] = useState(activePurities[0]?.id || "");

  // Weight & rate
  const [weightGrams, setWeightGrams] = useState("");
  const [ratePerGram, setRatePerGram] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);

  // When metal changes, reset purity
  const handleMetalChange = (newMetalId: string) => {
    setMetalId(newMetalId);
    const m = metals.find((x) => x.id === newMetalId);
    const p = m?.purities.filter((x) => x.isActive) || [];
    setPurityId(p[0]?.id || "");
  };

  // When supplier dropdown changes
  const handleSupplierSelect = (id: string) => {
    setSelectedSupplierId(id);
    if (id) {
      const s = suppliers.find((x) => x.id === id);
      if (s) {
        setSupplierName(s.name);
        setSupplierContact(s.phone || "");
      }
    } else {
      setSupplierName("");
      setSupplierContact("");
    }
  };

  // Preview total
  const weightNum = parseFloat(weightGrams) || 0;
  const rateNum = parseFloat(ratePerGram) || 0;
  const previewTotal = weightNum > 0 && rateNum > 0 ? (weightNum * rateNum).toFixed(2) : "0.00";

  const handleSave = async (postImmediately: boolean) => {
    if (!supplierName.trim()) {
      onError("Supplier name is required");
      return;
    }
    if (!purityId) {
      onError("Please select an active purity");
      return;
    }
    if (weightNum <= 0) {
      onError("Weight must be greater than 0");
      return;
    }
    if (rateNum <= 0) {
      onError("Rate per gram must be greater than 0");
      return;
    }

    setLoading(true);
    const payload = {
      invoiceNumber: invoiceNumber.trim(),
      date: new Date(date),
      supplierName: supplierName.trim(),
      supplierContact: supplierContact.trim() || undefined,
      counterpartyId: selectedSupplierId || undefined,
      metalId,
      purityId,
      weightGrams,
      ratePerGram,
      paymentMode,
      notes: notes.trim() || undefined,
    };

    const res = postImmediately
      ? await createAndPostPurchaseAction(payload)
      : await createPurchaseDraftAction(payload);

    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      onError(res.error || "Failed to create purchase");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-[#C59A58]" />
            <span>New Purchase Entry</span>
          </h3>
          <span className="text-xs px-2 py-0.5 rounded bg-[#C59A58]/10 text-[#C59A58] font-bold font-mono">
            {invoiceNumber}
          </span>
        </div>

        <div className="space-y-4 text-xs">
          {/* Invoice & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Invoice #</label>
              <input
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
              />
            </div>
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Purchase Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* Supplier Select / Custom */}
          <div className="p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[var(--text-primary)]">Supplier Information</span>
              {suppliers.length > 0 && (
                <select
                  value={selectedSupplierId}
                  onChange={(e) => handleSupplierSelect(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-[var(--bg-card)] border border-[var(--border-primary)] text-[#C59A58] font-semibold"
                >
                  <option value="">Select Existing Supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Supplier Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Bullion Corp"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Contact / Phone</label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={supplierContact}
                  onChange={(e) => setSupplierContact(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>

          {/* Metal & Purity Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Precious Metal</label>
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

          {/* Weight & Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Weight (Grams) *</label>
              <input
                type="text"
                required
                placeholder="e.g. 50.0000"
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
              />
            </div>
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Purchase Rate / g (₹) *</label>
              <input
                type="text"
                required
                placeholder="e.g. 7200.00"
                value={ratePerGram}
                onChange={(e) => setRatePerGram(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
              />
            </div>
          </div>

          {/* Total Preview Pill */}
          <div className="p-3 rounded-xl bg-[#C59A58]/10 border border-[#C59A58]/30 flex items-center justify-between">
            <span className="font-semibold text-[var(--text-secondary)]">Calculated Purchase Total:</span>
            <span className="font-mono font-bold text-sm text-[#C59A58]">
              {formatCurrency(previewTotal)}
            </span>
          </div>

          {/* Payment & Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              >
                <option value="CASH">CASH</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">BANK TRANSFER (RTGS/NEFT)</option>
                <option value="CARD">CARD</option>
                <option value="CHEQUE">CHEQUE</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Notes / Reference</label>
              <input
                type="text"
                placeholder="e.g. Bank ref #12345"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-3 border-t border-[var(--border-primary)]">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 rounded-xl border border-[var(--border-primary)] font-semibold text-[var(--text-secondary)] hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSave(false)}
              className="w-full sm:w-auto px-4 py-2 rounded-xl border border-[#C59A58] text-[#C59A58] font-semibold hover:bg-[#C59A58]/10 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSave(true)}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#C59A58] text-white font-semibold hover:bg-[#af813a] disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save & Post to Ledger
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Purchase Detail Modal
// ---------------------------------------------------------------------------

function PurchaseDetailModal({
  purchase,
  onClose,
}: {
  purchase: PurchaseRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Purchase Invoice: {purchase.invoiceNumber}
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Created on {formatDate(purchase.createdAt)} by {purchase.createdBy.name}
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
              purchase.status === "POSTED"
                ? "bg-green-500/10 text-green-600 border border-green-500/20"
                : purchase.status === "DRAFT"
                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                : "bg-red-500/10 text-red-600 border border-red-500/20"
            }`}
          >
            {purchase.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-[var(--text-muted)] block">Supplier:</span>
            <span className="font-semibold text-[var(--text-primary)]">{purchase.supplierName}</span>
            {purchase.supplierContact && (
              <span className="text-[var(--text-secondary)] block text-[11px]">
                {purchase.supplierContact}
              </span>
            )}
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Transaction Date:</span>
            <span className="font-semibold text-[var(--text-primary)]">{formatDate(purchase.date)}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Metal:</span>
            <span className="font-semibold text-[var(--text-primary)]">{purchase.metal.name}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Purity:</span>
            <span className="font-semibold text-[var(--text-primary)]">{purchase.purity.label}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Weight:</span>
            <span className="font-mono font-bold text-[var(--text-primary)]">
              {formatGrams(purchase.weightGrams)}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Purchase Rate:</span>
            <span className="font-mono font-bold text-[var(--text-secondary)]">
              {formatCurrency(purchase.ratePerGram)} / g
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Total Amount:</span>
            <span className="font-mono font-bold text-sm text-[#C59A58]">
              {formatCurrency(purchase.totalAmount)}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Payment Mode:</span>
            <span className="font-semibold text-[var(--text-primary)]">{purchase.paymentMode}</span>
          </div>
        </div>

        {purchase.notes && (
          <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] text-xs">
            <span className="font-semibold text-[var(--text-secondary)] block mb-1">Notes:</span>
            <p className="text-[var(--text-primary)]">{purchase.notes}</p>
          </div>
        )}

        {purchase.status === "CANCELLED" && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
            <span className="font-bold block mb-1">Cancelled:</span>
            <p>Reason: {purchase.cancelReason || "No reason recorded"}</p>
            {purchase.cancelledAt && (
              <span className="text-[10px] text-[var(--text-muted)] block mt-1">
                At: {formatDate(purchase.cancelledAt)}
              </span>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-xl bg-[#C59A58] text-white font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
