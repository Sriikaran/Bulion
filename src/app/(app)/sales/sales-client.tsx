"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  TrendingDown,
  Plus,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Send,
  Ban,
  Loader2,
  AlertTriangle,
  Scale,
  Wallet,
  DollarSign,
  PackageCheck,
  Lock,
} from "lucide-react";
import {
  createSaleDraftAction,
  postSaleAction,
  createAndPostSaleAction,
  cancelSaleAction,
  closeSaleAction,
} from "@/lib/actions/sale-actions";
import { getAvailableStockAction } from "@/lib/actions/stock-actions";
import { formatCurrency, formatGrams, formatDate } from "@/lib/utils/helpers";
import type { PaymentMode, TransactionStatus } from "@prisma/client";
import { SettlementDialog } from "@/components/settlement-dialog";
import { FixRateDialog } from "@/components/fix-rate-dialog";
import { FulfilmentDialog } from "@/components/fulfilment-dialog";
import { RateReservationDialog } from "@/components/rate-reservation-dialog";

interface SaleRow {
  id: string;
  invoiceNumber: string;
  date: string | Date;
  buyerName: string;
  buyerContact?: string | null;
  counterpartyId?: string | null;
  metalId: string;
  purityId: string;
  weightGrams: string;
  rateStatus?: "FIXED" | "UNFIXED";
  ratePerGram?: string | null;
  totalAmount?: string | null;
  rateFixedAt?: string | Date | null;
  paymentMode: PaymentMode;
  notes?: string | null;
  status: TransactionStatus;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  paidAmount?: string;
  outstandingAmount?: string;
  payments?: unknown[];
  fulfilmentStatus?: "PENDING" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED";
  fulfilledWeightGrams?: string;
  remainingWeightGrams?: string;
  fulfilments?: Array<{
    id: string;
    weightGrams: string;
    status: string;
    fulfilledAt: string | Date;
    fulfilledBy?: { name: string };
  }>;
  cancelReason?: string | null;
  cancelledAt?: string | Date | null;
  createdAt: string | Date;
  metal: { id: string; name: string; code: string };
  purity: { id: string; label: string; fineness: string };
  counterparty?: { id: string; name: string; phone?: string | null } | null;
  createdBy: { id: string; name: string; email: string };
}

interface SalesClientProps {
  initialSales: SaleRow[];
  metals: Array<{
    id: string;
    name: string;
    code: string;
    purities: Array<{ id: string; label: string; fineness: string; isActive: boolean }>;
  }>;
  buyers: Array<{ id: string; name: string; phone?: string | null }>;
  userRole: "ADMIN" | "STAFF";
}

export function SalesClient({
  initialSales,
  metals,
  buyers,
  userRole,
}: SalesClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [metalFilter, setMetalFilter] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null);
  const [settlementSale, setSettlementSale] = useState<SaleRow | null>(null);
  const [fixRateSale, setFixRateSale] = useState<SaleRow | null>(null);
  const [reservationSale, setReservationSale] = useState<SaleRow | null>(null);
  const [fulfilmentSale, setFulfilmentSale] = useState<SaleRow | null>(null);
  const [cancellingSale, setCancellingSale] = useState<SaleRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const isAdmin = userRole === "ADMIN";

  const filtered = initialSales.filter((s) => {
    const matchesSearch =
      s.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      s.buyerName.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || s.status === statusFilter;
    const matchesMetal = metalFilter === "ALL" || s.metalId === metalFilter;

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
              placeholder="Search invoice, buyer..."
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
          <span>New Sale</span>
        </button>
      </div>

      {/* Sales Register Table */}
      <div className="glass-card overflow-hidden border border-[var(--border-primary)] rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-table-head)] text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Buyer</th>
                <th className="py-3 px-4">Metal & Purity</th>
                <th className="py-3 px-4 text-right">Weight</th>
                <th className="py-3 px-4 text-right">Selling Rate/g</th>
                <th className="py-3 px-4 text-right">Total Amount</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Fulfilment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[var(--text-muted)]">
                    No sale transactions found
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr
                    key={s.id}
                    className={`hover:bg-[var(--bg-table-hover)] transition-colors ${
                      s.status === "CANCELLED" ? "opacity-60 bg-red-500/5" : ""
                    }`}
                  >
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {formatDate(s.date)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[#C59A58]">
                      {s.invoiceNumber}
                    </td>
                    <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                      {s.buyerName}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {s.metal.name}
                      </span>{" "}
                      <span className="text-[var(--text-muted)]">({s.purity.label})</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)]">
                      {formatGrams(s.weightGrams)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)]">
                      {s.rateStatus === "UNFIXED" || !s.ratePerGram ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/30">
                          UNFIXED
                        </span>
                      ) : (
                        formatCurrency(s.ratePerGram)
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#C59A58]">
                      {s.rateStatus === "UNFIXED" || !s.totalAmount ? (
                        <span className="text-[11px] text-[var(--text-muted)] italic font-normal">
                          Pending fixing
                        </span>
                      ) : (
                        formatCurrency(s.totalAmount)
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] w-fit">
                          {s.paymentMode}
                        </span>
                        {s.status === "POSTED" && s.paymentStatus && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded w-fit ${
                              s.paymentStatus === "PAID"
                                ? "bg-green-500/10 text-green-500 border border-green-500/20"
                                : s.paymentStatus === "PARTIALLY_PAID"
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                            }`}
                          >
                            {s.paymentStatus === "PAID" ? "PAID" : s.paymentStatus === "PARTIALLY_PAID" ? "PARTIAL" : "UNPAID"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded w-fit ${
                            s.fulfilmentStatus === "FULFILLED"
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                              : s.fulfilmentStatus === "PARTIALLY_FULFILLED"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : s.fulfilmentStatus === "CANCELLED"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          }`}
                        >
                          <PackageCheck className="w-2.5 h-2.5" />
                          {s.fulfilmentStatus === "FULFILLED"
                            ? "FULFILLED"
                            : s.fulfilmentStatus === "PARTIALLY_FULFILLED"
                            ? "PARTIAL"
                            : s.fulfilmentStatus === "CANCELLED"
                            ? "CANCELLED"
                            : "PENDING"}
                        </span>
                        {s.fulfilledWeightGrams !== undefined && (
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            {formatGrams(s.fulfilledWeightGrams)} / {formatGrams(s.weightGrams)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          s.status === "POSTED"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                            : s.status === "DRAFT"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                        }`}
                      >
                        {s.status === "POSTED" ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : s.status === "DRAFT" ? (
                          <Clock className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedSale(s)}
                          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[#C59A58] hover:bg-black/5 dark:hover:bg-white/5"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {s.status === "POSTED" && s.fulfilmentStatus !== "FULFILLED" && s.fulfilmentStatus !== "CANCELLED" && (
                          <button
                            onClick={() => setFulfilmentSale(s)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition"
                            title="Fulfil physical delivery"
                          >
                            <PackageCheck className="w-3 h-3" />
                            <span>Fulfil</span>
                          </button>
                        )}
                        {s.rateStatus === "UNFIXED" && s.status !== "CANCELLED" && (
                          <>
                            <button
                              onClick={() => setReservationSale(s)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25 transition"
                              title="Reserve rate for this sale"
                            >
                              <Lock className="w-3 h-3" />
                              <span>Reserve</span>
                            </button>
                            <button
                              onClick={() => setFixRateSale(s)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30 hover:bg-amber-500/25 transition"
                              title="Fix Rate for this sale"
                            >
                              <DollarSign className="w-3 h-3" />
                              <span>Fix Rate</span>
                            </button>
                          </>
                        )}
                        {s.status === "POSTED" && s.rateStatus !== "UNFIXED" && (
                          <button
                            onClick={() => setSettlementSale(s)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#C59A58]/15 text-[#E4BE85] border border-[#C59A58]/30 hover:bg-[#C59A58]/25 transition"
                            title="Manage receipts and settlements"
                          >
                            <Wallet className="w-3 h-3" />
                            <span>Receive</span>
                          </button>
                        )}
                        {s.status === "POSTED" &&
                          s.rateStatus === "FIXED" &&
                          s.fulfilmentStatus === "FULFILLED" &&
                          s.paymentStatus === "PAID" && (
                            <button
                              disabled={isPending}
                              onClick={() => {
                                if (window.confirm(`Close sale ${s.invoiceNumber}? This transaction is fully fulfilled and paid.`)) {
                                  startTransition(async () => {
                                    const res = await closeSaleAction({ saleId: s.id });
                                    if (!res.success) setErrorMsg(res.error || "Failed to close sale");
                                    else window.location.reload();
                                  });
                                }
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition cursor-pointer"
                              title="Explicitly close settled and fulfilled deal"
                            >
                              <CheckCircle className="w-3 h-3" />
                              <span>Close Deal</span>
                            </button>
                          )}
                        {s.status === "CLOSED" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <CheckCircle className="w-3 h-3" />
                            CLOSED
                          </span>
                        )}
                        {s.status === "DRAFT" && (
                          <button
                            disabled={isPending}
                            onClick={() => {
                              startTransition(async () => {
                                const res = await postSaleAction(s.id);
                                if (!res.success) setErrorMsg(res.error || "Failed to post sale");
                              });
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 hover:bg-green-500/20 transition"
                            title="Post sale to stock ledger"
                          >
                            <Send className="w-3 h-3" />
                            <span>Post</span>
                          </button>
                        )}
                        {s.status === "POSTED" && isAdmin && (
                          <button
                            onClick={() => setCancellingSale(s)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition"
                            title="Cancel sale and restore stock"
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

      {/* New Sale Modal */}
      {showNewModal && (
        <NewSaleModal
          metals={metals}
          buyers={buyers}
          onClose={() => setShowNewModal(false)}
          onError={(msg) => setErrorMsg(msg)}
        />
      )}

      {/* View Detail Modal */}
      {selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onOpenSettlement={(s) => {
            setSelectedSale(null);
            setSettlementSale(s);
          }}
        />
      )}

      {/* Cancel Reason Modal */}
      {cancellingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-red-500 flex items-center gap-2">
              <Ban className="w-4 h-4" />
              <span>Cancel Sale {cancellingSale.invoiceNumber}</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              This action will return the physical stock (+{formatGrams(cancellingSale.weightGrams)})
              by creating an immutable SALE_CANCEL movement in the ledger.
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
                placeholder="e.g. Order cancelled by buyer, return of bullion, payment failure"
                className="w-full p-2.5 text-xs rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCancellingSale(null);
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
                    const res = await cancelSaleAction({
                      id: cancellingSale.id,
                      reason: cancelReason,
                    });
                    if (res.success) {
                      setCancellingSale(null);
                      setCancelReason("");
                    } else {
                      setErrorMsg(res.error || "Failed to cancel sale");
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

      {/* Fix Rate Dialog (V3 Phase 1) */}
      {fixRateSale && (
        <FixRateDialog
          isOpen={true}
          onClose={() => setFixRateSale(null)}
          transactionId={fixRateSale.id}
          invoiceNumber={fixRateSale.invoiceNumber}
          transactionType="SALE"
          metalName={fixRateSale.metal.name}
          metalCode={fixRateSale.metal.code}
          purityLabel={fixRateSale.purity.label}
          weightGrams={fixRateSale.weightGrams}
          counterpartyName={fixRateSale.counterparty?.name || fixRateSale.buyerName}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}

      {/* Rate Reservation Dialog (V3 Phase 3) */}
      {reservationSale && (
        <RateReservationDialog
          isOpen={true}
          onClose={() => setReservationSale(null)}
          transaction={{
            id: reservationSale.id,
            invoiceNumber: reservationSale.invoiceNumber,
            type: "SALE",
            metalId: reservationSale.metalId,
            purityId: reservationSale.purityId,
            metalName: reservationSale.metal.name,
            metalCode: reservationSale.metal.code,
            purityLabel: reservationSale.purity.label,
            weightGrams: reservationSale.weightGrams,
            counterpartyName: reservationSale.counterparty?.name || reservationSale.buyerName,
            status: reservationSale.status,
            rateStatus: reservationSale.rateStatus || "UNFIXED",
          }}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}

      {/* Financial Settlement Dialog (V2) */}
      {settlementSale && (
        <SettlementDialog
          isOpen={true}
          onClose={() => setSettlementSale(null)}
          invoiceType="SALE"
          invoiceId={settlementSale.id}
          invoiceNumber={settlementSale.invoiceNumber}
          counterpartyId={settlementSale.counterpartyId || undefined}
          counterpartyName={settlementSale.buyerName}
          invoiceTotal={settlementSale.totalAmount || "0"}
          userRole={userRole}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}

      {/* Physical Fulfilment Dialog (V3 Phase 2) */}
      {fulfilmentSale && (
        <FulfilmentDialog
          isOpen={true}
          onClose={() => setFulfilmentSale(null)}
          transactionId={fulfilmentSale.id}
          invoiceNumber={fulfilmentSale.invoiceNumber}
          transactionType="SALE"
          metalName={fulfilmentSale.metal.name}
          purityLabel={fulfilmentSale.purity.label}
          agreedWeightGrams={fulfilmentSale.weightGrams}
          fulfilledWeightGrams={fulfilmentSale.fulfilledWeightGrams || "0"}
          remainingWeightGrams={fulfilmentSale.remainingWeightGrams || fulfilmentSale.weightGrams}
          counterpartyName={fulfilmentSale.counterparty?.name || fulfilmentSale.buyerName}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Sale Modal with Real-Time Stock Validation
// ---------------------------------------------------------------------------

function NewSaleModal({
  metals,
  buyers,
  onClose,
  onError,
}: {
  metals: SalesClientProps["metals"];
  buyers: SalesClientProps["buyers"];
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState(
    () => `SAL-${Date.now().toString().slice(-6)}`
  );
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Buyer selection
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");

  // Metal & purity
  const [metalId, setMetalId] = useState(metals[0]?.id || "");
  const selectedMetal = metals.find((m) => m.id === metalId) || metals[0];
  const activePurities = selectedMetal?.purities.filter((p) => p.isActive) || [];
  const [purityId, setPurityId] = useState(activePurities[0]?.id || "");

  // Available stock tracking
  const [availableStockGrams, setAvailableStockGrams] = useState<string>("0.0000");
  const [checkingStock, setCheckingStock] = useState<boolean>(false);

  // Weight & rate
  const [weightGrams, setWeightGrams] = useState("");
  const [rateStatus, setRateStatus] = useState<"FIXED" | "UNFIXED">("FIXED");
  const [ratePerGram, setRatePerGram] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);

  // Fetch available stock whenever metalId or purityId changes
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

  // When metal changes, reset purity
  const handleMetalChange = (newMetalId: string) => {
    setMetalId(newMetalId);
    const m = metals.find((x) => x.id === newMetalId);
    const p = m?.purities.filter((x) => x.isActive) || [];
    setPurityId(p[0]?.id || "");
  };

  const handleBuyerSelect = (id: string) => {
    setSelectedBuyerId(id);
    if (id) {
      const b = buyers.find((x) => x.id === id);
      if (b) {
        setBuyerName(b.name);
        setBuyerContact(b.phone || "");
      }
    } else {
      setBuyerName("");
      setBuyerContact("");
    }
  };

  const weightNum = parseFloat(weightGrams) || 0;
  const rateNum = parseFloat(ratePerGram) || 0;
  const availableNum = parseFloat(availableStockGrams) || 0;
  const isInsufficient = weightNum > availableNum;

  const previewTotal = rateStatus === "FIXED" && weightNum > 0 && rateNum > 0
    ? (weightNum * rateNum).toFixed(2)
    : "0.00";

  const handleSave = async (postImmediately: boolean) => {
    if (!buyerName.trim()) {
      onError("Buyer name is required");
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
    if (rateStatus === "FIXED" && rateNum <= 0) {
      onError("Rate per gram must be greater than 0");
      return;
    }
    if (postImmediately && isInsufficient) {
      onError(`Cannot post sale: entered weight (${weightNum.toFixed(4)}g) exceeds available stock (${availableNum.toFixed(4)}g).`);
      return;
    }

    setLoading(true);
    const payload = {
      invoiceNumber: invoiceNumber.trim(),
      date: new Date(date),
      buyerName: buyerName.trim(),
      buyerContact: buyerContact.trim() || undefined,
      counterpartyId: selectedBuyerId || undefined,
      metalId,
      purityId,
      weightGrams,
      rateStatus,
      ratePerGram: rateStatus === "FIXED" ? ratePerGram : undefined,
      paymentMode,
      notes: notes.trim() || undefined,
    };

    const res = postImmediately
      ? await createAndPostSaleAction(payload)
      : await createSaleDraftAction(payload);

    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      onError(res.error || "Failed to create sale");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-[#C59A58]" />
            <span>New Sale Entry</span>
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
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Sale Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* Buyer Select / Custom */}
          <div className="p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[var(--text-primary)]">Buyer / Customer Details</span>
              {buyers.length > 0 && (
                <select
                  value={selectedBuyerId}
                  onChange={(e) => handleBuyerSelect(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-[var(--bg-card)] border border-[var(--border-primary)] text-[#C59A58] font-semibold"
                >
                  <option value="">Select Existing Customer...</option>
                  {buyers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Buyer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Royal Jewellers"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Contact / Phone</label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={buyerContact}
                  onChange={(e) => setBuyerContact(e.target.value)}
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

          {/* Live Available Stock Badge */}
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-500" />
              <span className="font-semibold text-[var(--text-secondary)]">
                Available Stock ({selectedMetal?.name} - {activePurities.find((p) => p.id === purityId)?.label}):
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
              {checkingStock ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span>{formatGrams(availableStockGrams)}</span>
              )}
            </div>
          </div>

          {/* Rate Selection Mode: Fixed or Unfixed */}
          <div className="p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] space-y-2.5">
            <span className="font-bold text-[var(--text-primary)] block">Rate Fixing Agreement</span>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="radio"
                  name="saleRateStatus"
                  value="FIXED"
                  checked={rateStatus === "FIXED"}
                  onChange={() => setRateStatus("FIXED")}
                  className="text-[#C59A58] focus:ring-[#C59A58]"
                />
                <span className="font-semibold text-[var(--text-primary)]">Fixed Rate</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="radio"
                  name="saleRateStatus"
                  value="UNFIXED"
                  checked={rateStatus === "UNFIXED"}
                  onChange={() => setRateStatus("UNFIXED")}
                  className="text-amber-500 focus:ring-amber-500"
                />
                <span className="font-semibold text-amber-600 dark:text-amber-400">Unfixed Rate (Fix Later)</span>
              </label>
            </div>
          </div>

          {/* Weight & Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Sale Weight (Grams) *</label>
              <input
                type="text"
                required
                placeholder="e.g. 20.0000"
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
                  <span>Exceeds available stock ({formatGrams(availableStockGrams)})</span>
                </p>
              )}
            </div>
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">
                Selling Rate / g (₹) {rateStatus === "FIXED" ? "*" : "(Unfixed)"}
              </label>
              <input
                type="text"
                required={rateStatus === "FIXED"}
                disabled={rateStatus === "UNFIXED"}
                placeholder={rateStatus === "UNFIXED" ? "Rate is unfixed" : "e.g. 7450.00"}
                value={rateStatus === "UNFIXED" ? "" : ratePerGram}
                onChange={(e) => setRatePerGram(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Total Preview Pill */}
          {rateStatus === "FIXED" ? (
            <div className="p-3 rounded-xl bg-[#C59A58]/10 border border-[#C59A58]/30 flex items-center justify-between">
              <span className="font-semibold text-[var(--text-secondary)]">Calculated Sale Total:</span>
              <span className="font-mono font-bold text-sm text-[#C59A58]">
                {formatCurrency(previewTotal)}
              </span>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between">
              <span className="font-semibold">Rate: Unfixed</span>
              <span className="text-[11px] text-[var(--text-muted)] italic">Final amount will be determined after rate fixing.</span>
            </div>
          )}

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
                placeholder="e.g. Counter sale delivery receipt"
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
              disabled={loading || isInsufficient}
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
// Sale Detail Modal
// ---------------------------------------------------------------------------

function SaleDetailModal({
  sale,
  onClose,
  onOpenSettlement,
}: {
  sale: SaleRow;
  onClose: () => void;
  onOpenSettlement?: (s: SaleRow) => void;
}) {
  const isPosted = sale.status === "POSTED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Sale Invoice: {sale.invoiceNumber}
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Created on {formatDate(sale.createdAt)} by {sale.createdBy.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                sale.status === "POSTED"
                  ? "bg-green-500/10 text-green-600 border border-green-500/20"
                  : sale.status === "DRAFT"
                  ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                  : "bg-red-500/10 text-red-600 border border-red-500/20"
              }`}
            >
              {sale.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-[var(--text-muted)] block">Buyer:</span>
            <span className="font-semibold text-[var(--text-primary)]">{sale.buyerName}</span>
            {sale.buyerContact && (
              <span className="text-[var(--text-secondary)] block text-[11px]">
                {sale.buyerContact}
              </span>
            )}
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Transaction Date:</span>
            <span className="font-semibold text-[var(--text-primary)]">{formatDate(sale.date)}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Metal:</span>
            <span className="font-semibold text-[var(--text-primary)]">{sale.metal.name}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Purity:</span>
            <span className="font-semibold text-[var(--text-primary)]">{sale.purity.label}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Weight:</span>
            <span className="font-mono font-bold text-[var(--text-primary)]">
              {formatGrams(sale.weightGrams)}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Selling Rate:</span>
            <span className="font-mono font-bold text-[var(--text-secondary)]">
              {sale.rateStatus === "UNFIXED" || !sale.ratePerGram ? (
                <span className="text-amber-500 font-semibold">UNFIXED</span>
              ) : (
                `${formatCurrency(sale.ratePerGram)} / g`
              )}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Invoice Amount:</span>
            <span className="font-mono font-bold text-sm text-[#C59A58]">
              {sale.rateStatus === "UNFIXED" || !sale.totalAmount ? (
                <span className="text-xs text-[var(--text-muted)] font-normal italic">Pending rate fixing</span>
              ) : (
                formatCurrency(sale.totalAmount)
              )}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Payment Mode:</span>
            <span className="font-semibold text-[var(--text-primary)]">{sale.paymentMode}</span>
          </div>
        </div>

        {/* Financial Settlement Card (V2) */}
        {isPosted && (
          <div className="p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-[#C59A58]" />
                Financial Settlement Status:
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  sale.paymentStatus === "PAID"
                    ? "bg-green-500/10 text-green-500 border border-green-500/20"
                    : sale.paymentStatus === "PARTIALLY_PAID"
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}
              >
                {sale.paymentStatus || "UNPAID"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block uppercase">Received to Date:</span>
                <span className="font-bold text-emerald-400">
                  {formatCurrency(sale.paidAmount || "0")}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block uppercase">Outstanding Receivable:</span>
                <span className="font-bold text-amber-400">
                  {formatCurrency(sale.outstandingAmount || sale.totalAmount)}
                </span>
              </div>
            </div>
          </div>
        )}

        {sale.notes && (
          <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--border-primary)] text-xs">
            <span className="font-semibold text-[var(--text-secondary)] block mb-1">Notes:</span>
            <p className="text-[var(--text-primary)]">{sale.notes}</p>
          </div>
        )}

        {sale.status === "CANCELLED" && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
            <span className="font-bold block mb-1">Cancelled:</span>
            <p>Reason: {sale.cancelReason || "No reason recorded"}</p>
            {sale.cancelledAt && (
              <span className="text-[10px] text-[var(--text-muted)] block mt-1">
                At: {formatDate(sale.cancelledAt)}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-primary)]">
          {isPosted && onOpenSettlement ? (
            <button
              onClick={() => onOpenSettlement(sale)}
              className="px-3 py-2 text-xs rounded-xl bg-[#C59A58]/15 hover:bg-[#C59A58]/25 text-[#E4BE85] border border-[#C59A58]/30 font-semibold flex items-center gap-1.5 transition"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Record Receipt / History</span>
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-xl bg-[var(--bg-card-hover)] hover:bg-white/10 text-white font-semibold border border-[var(--border-primary)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
