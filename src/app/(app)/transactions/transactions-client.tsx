"use client";

import React, { useState } from "react";
import {
  History,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  TrendingDown,
  Scale,
  Sliders,
  Layers,
  CheckCircle,
  Eye,
} from "lucide-react";
import { formatGrams, formatDate } from "@/lib/utils/helpers";
import type { MovementType } from "@prisma/client";

interface MovementRow {
  id: string;
  movementType: MovementType;
  weightGrams: string;
  reference?: string | null;
  createdAt: string;
  metal: { id: string; name: string; code: string };
  purity: { id: string; label: string; fineness: string };
  createdBy: { id: string; name: string; role: string };
  purchase?: { id: string; invoiceNumber: string; supplierName: string; status: string } | null;
  sale?: { id: string; invoiceNumber: string; buyerName: string; status: string } | null;
  adjustment?: { id: string; reason: string; direction: string; status: string } | null;
  openingStock?: { id: string; effectiveDate: string } | null;
}

interface TransactionsClientProps {
  initialMovements: MovementRow[];
  metals: Array<{ id: string; name: string; code: string }>;
}

export function TransactionsClient({
  initialMovements,
  metals,
}: TransactionsClientProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [metalFilter, setMetalFilter] = useState<string>("ALL");
  const [selectedMovement, setSelectedMovement] = useState<MovementRow | null>(null);

  const filtered = initialMovements.filter((m) => {
    const matchesSearch =
      (m.reference && m.reference.toLowerCase().includes(search.toLowerCase())) ||
      m.metal.name.toLowerCase().includes(search.toLowerCase()) ||
      m.purity.label.toLowerCase().includes(search.toLowerCase()) ||
      m.createdBy.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.purchase && m.purchase.invoiceNumber.toLowerCase().includes(search.toLowerCase())) ||
      (m.sale && m.sale.invoiceNumber.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === "ALL" || m.movementType === typeFilter;
    const matchesMetal = metalFilter === "ALL" || m.metal.id === metalFilter;

    return matchesSearch && matchesType && matchesMetal;
  });

  const getMovementBadge = (type: MovementType) => {
    switch (type) {
      case "OPENING":
        return {
          label: "Opening Stock",
          icon: <Scale className="w-3 h-3" />,
          classes: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        };
      case "PURCHASE":
        return {
          label: "Purchase Inward",
          icon: <ShoppingCart className="w-3 h-3" />,
          classes: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
        };
      case "PURCHASE_CANCEL":
        return {
          label: "Purchase Cancel Reversal",
          icon: <ArrowDownRight className="w-3 h-3" />,
          classes: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        };
      case "SALE":
        return {
          label: "Sale Outward",
          icon: <TrendingDown className="w-3 h-3" />,
          classes: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        };
      case "SALE_CANCEL":
        return {
          label: "Sale Cancel Reversal",
          icon: <ArrowUpRight className="w-3 h-3" />,
          classes: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
        };
      case "ADJUSTMENT_INCREASE":
        return {
          label: "Adjustment In (+)",
          icon: <ArrowUpRight className="w-3 h-3" />,
          classes: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
        };
      case "ADJUSTMENT_DECREASE":
        return {
          label: "Adjustment Out (-)",
          icon: <ArrowDownRight className="w-3 h-3" />,
          classes: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
        };
      default:
        return {
          label: type,
          icon: <Layers className="w-3 h-3" />,
          classes: "bg-slate-500/10 text-slate-500 border-slate-500/20",
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search reference, invoice, user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#C59A58]"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)] focus:outline-none"
          >
            <option value="ALL">All Event Types</option>
            <option value="OPENING">Opening Stock</option>
            <option value="PURCHASE">Purchase</option>
            <option value="PURCHASE_CANCEL">Purchase Cancel</option>
            <option value="SALE">Sale</option>
            <option value="SALE_CANCEL">Sale Cancel</option>
            <option value="ADJUSTMENT_INCREASE">Adjustment Increase</option>
            <option value="ADJUSTMENT_DECREASE">Adjustment Decrease</option>
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

        <div className="text-xs text-[var(--text-muted)] font-medium">
          Showing <strong>{filtered.length}</strong> ledger movements
        </div>
      </div>

      {/* Transactions Table */}
      <div className="glass-card overflow-hidden border border-[var(--border-primary)] rounded-2xl shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-table-head)] text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Movement Type</th>
                <th className="py-3 px-4">Metal & Purity</th>
                <th className="py-3 px-4 text-right">Signed Weight</th>
                <th className="py-3 px-4">Source Reference</th>
                <th className="py-3 px-4">Authorized User</th>
                <th className="py-3 px-4 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--text-muted)]">
                    No ledger transactions found matching filters
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const badge = getMovementBadge(m.movementType);
                  const w = parseFloat(m.weightGrams);
                  const isPositive = w > 0;
                  const dateObj = new Date(m.createdAt);

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-[var(--bg-table-hover)] transition-colors"
                    >
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        <div>{formatDate(dateObj)}</div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono">
                          {dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badge.classes}`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {m.metal.name}
                        </span>{" "}
                        <span className="text-[var(--text-muted)]">({m.purity.label})</span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          isPositive
                            ? "text-green-600 dark:text-green-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isPositive ? `+${formatGrams(w)}` : formatGrams(w)}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-[var(--text-secondary)]">
                        {m.purchase && (
                          <span className="font-mono text-[#C59A58] font-bold mr-1">
                            {m.purchase.invoiceNumber}
                          </span>
                        )}
                        {m.sale && (
                          <span className="font-mono text-[#C59A58] font-bold mr-1">
                            {m.sale.invoiceNumber}
                          </span>
                        )}
                        <span>{m.reference || "Direct Ledger Movement"}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {m.createdBy.name}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase">
                          {m.createdBy.role}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedMovement(m)}
                          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[#C59A58] hover:bg-black/5"
                          title="Inspect Transaction"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movement Detail Modal */}
      {selectedMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <History className="w-4 h-4 text-[#C59A58]" />
              <span>Stock Ledger Entry Details</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-[var(--border-primary)]">
                <span className="text-[var(--text-muted)]">Movement ID:</span>
                <span className="font-mono text-[var(--text-primary)]">{selectedMovement.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-primary)]">
                <span className="text-[var(--text-muted)]">Type:</span>
                <span className="font-bold text-[var(--text-primary)]">{selectedMovement.movementType}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-primary)]">
                <span className="text-[var(--text-muted)]">Metal & Purity:</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {selectedMovement.metal.name} ({selectedMovement.purity.label})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-primary)]">
                <span className="text-[var(--text-muted)]">Signed Weight:</span>
                <span className="font-mono font-bold text-sm text-[#C59A58]">
                  {formatGrams(selectedMovement.weightGrams)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-primary)]">
                <span className="text-[var(--text-muted)]">Reference:</span>
                <span className="text-[var(--text-primary)]">{selectedMovement.reference || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-primary)]">
                <span className="text-[var(--text-muted)]">Recorded By:</span>
                <span className="text-[var(--text-primary)]">
                  {selectedMovement.createdBy.name} ({selectedMovement.createdBy.role})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-primary)]">
                <span className="text-[var(--text-muted)]">Timestamp:</span>
                <span className="text-[var(--text-primary)] font-mono">
                  {new Date(selectedMovement.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedMovement(null)}
                className="px-4 py-2 text-xs rounded-xl bg-[#C59A58] text-white font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
