"use client";

import React, { useState, useTransition } from "react";
import {
  ShieldCheck,
  Plus,
  Edit2,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
  Layers,
  Search,
  Filter,
} from "lucide-react";
import {
  createMetalAction,
  updateMetalAction,
  toggleMetalActiveAction,
  createPurityAction,
  updatePurityAction,
  togglePurityActiveAction,
} from "@/lib/actions/master-actions";

interface PurityItem {
  id: string;
  metalId: string;
  label: string;
  fineness: string | number;
  displayInfo?: string | null;
  sortOrder: number;
  isActive: boolean;
  metal?: {
    id: string;
    name: string;
    code: string;
  };
}

interface MetalItem {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  purities: PurityItem[];
}

interface MastersClientProps {
  initialMetals: MetalItem[];
  userRole: "ADMIN" | "STAFF";
}

export function MastersClient({ initialMetals, userRole }: MastersClientProps) {
  const [activeTab, setActiveTab] = useState<"metals" | "purities">("metals");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals state
  const [showAddMetal, setShowAddMetal] = useState(false);
  const [editingMetal, setEditingMetal] = useState<MetalItem | null>(null);

  const [showAddPurity, setShowAddPurity] = useState(false);
  const [editingPurity, setEditingPurity] = useState<PurityItem | null>(null);

  const isAdmin = userRole === "ADMIN";

  // Filtered metals
  const filteredMetals = initialMetals.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.code.toLowerCase().includes(search.toLowerCase())
  );

  // Flattened purities
  const allPurities: PurityItem[] = initialMetals.flatMap((m) =>
    m.purities.map((p) => ({
      ...p,
      metal: { id: m.id, name: m.name, code: m.code },
    }))
  );

  const filteredPurities = allPurities.filter(
    (p) =>
      p.label.toLowerCase().includes(search.toLowerCase()) ||
      p.metal?.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.displayInfo && p.displayInfo.toLowerCase().includes(search.toLowerCase()))
  );

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

      {/* Tabs & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 w-fit">
          <button
            onClick={() => setActiveTab("metals")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "metals"
                ? "bg-[#C59A58] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Metals ({initialMetals.length})
          </button>
          <button
            onClick={() => setActiveTab("purities")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "purities"
                ? "bg-[#C59A58] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Purities ({allPurities.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#C59A58]"
            />
          </div>

          {isAdmin && (
            <button
              onClick={() => {
                if (activeTab === "metals") setShowAddMetal(true);
                else setShowAddPurity(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59A58] hover:bg-[#af813a] text-white font-semibold text-xs transition shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{activeTab === "metals" ? "New Metal" : "New Purity"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Content View */}
      {activeTab === "metals" ? (
        <div className="glass-card overflow-hidden border border-[var(--border-primary)] rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-table-head)] text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Purities Configured</th>
                  <th className="py-3 px-4">Status</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)]">
                {filteredMetals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                      No metals found
                    </td>
                  </tr>
                ) : (
                  filteredMetals.map((metal) => (
                    <tr
                      key={metal.id}
                      className={`hover:bg-[var(--bg-table-hover)] transition-colors ${
                        !metal.isActive ? "opacity-60 bg-black/5 dark:bg-white/5" : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#C59A58]">
                        {metal.code}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                        {metal.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C59A58]/10 text-[#C59A58] border border-[#C59A58]/20">
                          {metal.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {metal.purities.length} purit{metal.purities.length === 1 ? "y" : "ies"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            metal.isActive
                              ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                          }`}
                        >
                          {metal.isActive ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          {metal.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingMetal(metal)}
                              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[#C59A58] hover:bg-black/5 dark:hover:bg-white/5 transition"
                              title="Edit metal"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={isPending}
                              onClick={() => {
                                startTransition(async () => {
                                  const res = await toggleMetalActiveAction(
                                    metal.id,
                                    !metal.isActive
                                  );
                                  if (!res.success) setErrorMsg(res.error || "Action failed");
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                                metal.isActive
                                  ? "border-red-500/30 text-red-500 hover:bg-red-500/10"
                                  : "border-green-500/30 text-green-500 hover:bg-green-500/10"
                              }`}
                            >
                              {metal.isActive ? "Deactivate" : "Activate"}
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
      ) : (
        <div className="glass-card overflow-hidden border border-[var(--border-primary)] rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-table-head)] text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
                <tr>
                  <th className="py-3 px-4">Metal</th>
                  <th className="py-3 px-4">Purity Label</th>
                  <th className="py-3 px-4">Fineness</th>
                  <th className="py-3 px-4">Display Info</th>
                  <th className="py-3 px-4">Sort Order</th>
                  <th className="py-3 px-4">Status</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)]">
                {filteredPurities.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                      No purities found
                    </td>
                  </tr>
                ) : (
                  filteredPurities.map((purity) => (
                    <tr
                      key={purity.id}
                      className={`hover:bg-[var(--bg-table-hover)] transition-colors ${
                        !purity.isActive ? "opacity-60 bg-black/5 dark:bg-white/5" : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-bold text-[#C59A58]">
                        {purity.metal?.name}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                        {purity.label}
                      </td>
                      <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                        {Number(purity.fineness).toFixed(4)}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-muted)]">
                        {purity.displayInfo || "—"}
                      </td>
                      <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                        {purity.sortOrder}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            purity.isActive
                              ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                          }`}
                        >
                          {purity.isActive ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          {purity.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingPurity(purity)}
                              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[#C59A58] hover:bg-black/5 dark:hover:bg-white/5 transition"
                              title="Edit purity"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={isPending}
                              onClick={() => {
                                startTransition(async () => {
                                  const res = await togglePurityActiveAction(
                                    purity.id,
                                    !purity.isActive
                                  );
                                  if (!res.success) setErrorMsg(res.error || "Action failed");
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                                purity.isActive
                                  ? "border-red-500/30 text-red-500 hover:bg-red-500/10"
                                  : "border-green-500/30 text-green-500 hover:bg-green-500/10"
                              }`}
                            >
                              {purity.isActive ? "Deactivate" : "Activate"}
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
      )}

      {/* Add Metal Modal */}
      {showAddMetal && (
        <AddMetalModal
          onClose={() => setShowAddMetal(false)}
          onError={(msg) => setErrorMsg(msg)}
        />
      )}

      {/* Edit Metal Modal */}
      {editingMetal && (
        <EditMetalModal
          metal={editingMetal}
          onClose={() => setEditingMetal(null)}
          onError={(msg) => setErrorMsg(msg)}
        />
      )}

      {/* Add Purity Modal */}
      {showAddPurity && (
        <AddPurityModal
          metals={initialMetals}
          onClose={() => setShowAddPurity(false)}
          onError={(msg) => setErrorMsg(msg)}
        />
      )}

      {/* Edit Purity Modal */}
      {editingPurity && (
        <EditPurityModal
          purity={editingPurity}
          onClose={() => setEditingPurity(null)}
          onError={(msg) => setErrorMsg(msg)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function AddMetalModal({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"GOLD" | "SILVER">("GOLD");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await createMetalAction({ code, name, type });
    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      onError(res.error || "Failed to create metal");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
        <h3 className="text-base font-bold text-[var(--text-primary)]">Add New Metal</h3>
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Metal Code</label>
            <input
              type="text"
              required
              placeholder="e.g. GOLD"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Metal Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Gold"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "GOLD" | "SILVER")}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            >
              <option value="GOLD">GOLD</option>
              <option value="SILVER">SILVER</option>
            </select>
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
              Save Metal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditMetalModal({
  metal,
  onClose,
  onError,
}: {
  metal: MetalItem;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(metal.name);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await updateMetalAction(metal.id, { name });
    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      onError(res.error || "Failed to update metal");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
        <h3 className="text-base font-bold text-[var(--text-primary)]">Edit Metal: {metal.code}</h3>
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Metal Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddPurityModal({
  metals,
  onClose,
  onError,
}: {
  metals: MetalItem[];
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [metalId, setMetalId] = useState(metals[0]?.id || "");
  const [label, setLabel] = useState("");
  const [fineness, setFineness] = useState("");
  const [displayInfo, setDisplayInfo] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await createPurityAction({
      metalId,
      label,
      fineness,
      displayInfo: displayInfo || undefined,
      sortOrder,
    });
    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      onError(res.error || "Failed to create purity");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
        <h3 className="text-base font-bold text-[var(--text-primary)]">Add New Purity</h3>
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Metal</label>
            <select
              value={metalId}
              onChange={(e) => setMetalId(e.target.value)}
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
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Purity Label</label>
            <input
              type="text"
              required
              placeholder="e.g. 22K (916)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">
              Fineness (0 &lt; f &le; 1.0000)
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 0.9160"
              value={fineness}
              onChange={(e) => setFineness(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Display Info (Optional)</label>
            <input
              type="text"
              placeholder="e.g. 22 Karat Standard"
              value={displayInfo}
              onChange={(e) => setDisplayInfo(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Sort Order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
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
              Save Purity
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditPurityModal({
  purity,
  onClose,
  onError,
}: {
  purity: PurityItem;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [label, setLabel] = useState(purity.label);
  const [fineness, setFineness] = useState(purity.fineness.toString());
  const [displayInfo, setDisplayInfo] = useState(purity.displayInfo || "");
  const [sortOrder, setSortOrder] = useState(purity.sortOrder);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await updatePurityAction(purity.id, {
      label,
      fineness,
      displayInfo: displayInfo || undefined,
      sortOrder,
    });
    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      onError(res.error || "Failed to update purity");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-2xl space-y-4">
        <h3 className="text-base font-bold text-[var(--text-primary)]">Edit Purity: {purity.label}</h3>
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Purity Label</label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Fineness</label>
            <input
              type="text"
              required
              value={fineness}
              onChange={(e) => setFineness(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Display Info</label>
            <input
              type="text"
              value={displayInfo}
              onChange={(e) => setDisplayInfo(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold text-[var(--text-secondary)]">Sort Order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono"
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
