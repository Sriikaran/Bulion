"use client";

import React, { useState, useTransition } from "react";
import {
  Users,
  Plus,
  Edit2,
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  Phone,
  Mail,
  MapPin,
  Building,
} from "lucide-react";
import {
  createCounterpartyAction,
  updateCounterpartyAction,
  toggleCounterpartyActiveAction,
} from "@/lib/actions/counterparty-actions";
import type { CounterpartyType } from "@prisma/client";

interface CounterpartyItem {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  type: CounterpartyType;
  isActive: boolean;
  notes?: string | null;
  _count?: {
    purchases: number;
    sales: number;
  };
}

interface CounterpartiesClientProps {
  initialCounterparties: CounterpartyItem[];
  userRole: "ADMIN" | "STAFF";
}

export function CounterpartiesClient({
  initialCounterparties,
  userRole,
}: CounterpartiesClientProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CounterpartyItem | null>(null);

  const isAdmin = userRole === "ADMIN";

  const filtered = initialCounterparties.filter((cp) => {
    const matchesSearch =
      cp.name.toLowerCase().includes(search.toLowerCase()) ||
      (cp.phone && cp.phone.includes(search)) ||
      (cp.email && cp.email.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === "ALL" || cp.type === typeFilter;
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && cp.isActive) ||
      (statusFilter === "INACTIVE" && !cp.isActive);

    return matchesSearch && matchesType && matchesStatus;
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

      {/* Filters & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by name, phone, email..."
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
            <option value="ALL">All Roles</option>
            <option value="SUPPLIER">Suppliers Only</option>
            <option value="CUSTOMER">Customers Only</option>
            <option value="BOTH">Dual Role (Both)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)] focus:outline-none"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59A58] hover:bg-[#af813a] text-white font-semibold text-xs transition shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Counterparty</span>
          </button>
        )}
      </div>

      {/* Counterparties Table */}
      <div className="glass-card overflow-hidden border border-[var(--border-primary)] rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-table-head)] text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Role / Type</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Address</th>
                <th className="py-3 px-4">Transactions</th>
                <th className="py-3 px-4">Status</th>
                {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--text-muted)]">
                    No counterparties matching criteria
                  </td>
                </tr>
              ) : (
                filtered.map((cp) => (
                  <tr
                    key={cp.id}
                    className={`hover:bg-[var(--bg-table-hover)] transition-colors ${
                      !cp.isActive ? "opacity-60 bg-black/5 dark:bg-white/5" : ""
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-[var(--text-primary)]">{cp.name}</div>
                      {cp.notes && (
                        <div className="text-[10px] text-[var(--text-muted)] truncate max-w-xs">
                          {cp.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          cp.type === "SUPPLIER"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            : cp.type === "CUSTOMER"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                            : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                        }`}
                      >
                        {cp.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 space-y-1">
                      {cp.phone ? (
                        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                          <Phone className="w-3 h-3 text-[var(--text-muted)]" />
                          <span>{cp.phone}</span>
                        </div>
                      ) : null}
                      {cp.email ? (
                        <div className="flex items-center gap-1.5 text-[var(--text-muted)] text-[11px]">
                          <Mail className="w-3 h-3 text-[var(--text-muted)]" />
                          <span>{cp.email}</span>
                        </div>
                      ) : null}
                      {!cp.phone && !cp.email && <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] max-w-xs truncate">
                      {cp.address || "—"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        <span>{cp._count?.purchases ?? 0} Purchases</span>
                        <span className="mx-1 text-[var(--text-muted)]">|</span>
                        <span>{cp._count?.sales ?? 0} Sales</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          cp.isActive
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                            : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                        }`}
                      >
                        {cp.isActive ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {cp.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingItem(cp)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[#C59A58] hover:bg-black/5 dark:hover:bg-white/5 transition"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            disabled={isPending}
                            onClick={() => {
                              startTransition(async () => {
                                const res = await toggleCounterpartyActiveAction(
                                  cp.id,
                                  !cp.isActive
                                );
                                if (!res.success) setErrorMsg(res.error || "Action failed");
                              });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                              cp.isActive
                                ? "border-red-500/30 text-red-500 hover:bg-red-500/10"
                                : "border-green-500/30 text-green-500 hover:bg-green-500/10"
                            }`}
                          >
                            {cp.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <CounterpartyModal
          title="Add New Counterparty"
          onClose={() => setShowAddModal(false)}
          onSubmit={async (data) => {
            const res = await createCounterpartyAction(data);
            if (!res.success) setErrorMsg(res.error || "Failed to create counterparty");
            return res.success;
          }}
        />
      )}

      {/* Edit Modal */}
      {editingItem && (
        <CounterpartyModal
          title={`Edit Counterparty: ${editingItem.name}`}
          initialData={editingItem}
          onClose={() => setEditingItem(null)}
          onSubmit={async (data) => {
            const res = await updateCounterpartyAction(editingItem.id, data);
            if (!res.success) setErrorMsg(res.error || "Failed to update counterparty");
            return res.success;
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Counterparty Form Modal
// ---------------------------------------------------------------------------

function CounterpartyModal({
  title,
  initialData,
  onClose,
  onSubmit,
}: {
  title: string;
  initialData?: CounterpartyItem;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    type: CounterpartyType;
    notes?: string | null;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState(initialData?.name || "");
  const [type, setType] = useState<CounterpartyType>(initialData?.type || "SUPPLIER");
  const [phone, setPhone] = useState(initialData?.phone || "");
  const [email, setEmail] = useState(initialData?.email || "");
  const [address, setAddress] = useState(initialData?.address || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const success = await onSubmit({
      name,
      type,
      phone: phone || null,
      email: email || null,
      address: address || null,
      notes: notes || null,
    });
    setLoading(false);
    if (success) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
        <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">
              Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Apex Bullion Refiners"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">
              Role / Type *
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CounterpartyType)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            >
              <option value="SUPPLIER">Supplier (Purchases from)</option>
              <option value="CUSTOMER">Customer (Sells to)</option>
              <option value="BOTH">Both (Dual role)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Phone</label>
              <input
                type="text"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Email</label>
              <input
                type="email"
                placeholder="e.g. info@apex.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              />
            </div>
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Address</label>
            <input
              type="text"
              placeholder="e.g. Zaveri Bazaar, Mumbai"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Notes</label>
            <textarea
              rows={2}
              placeholder="Optional notes or GST/PAN reference"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
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
              Save Counterparty
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
