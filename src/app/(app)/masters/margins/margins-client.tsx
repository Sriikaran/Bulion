"use client";

import React, { useState, useTransition } from "react";
import { formatDate } from "@/lib/utils/helpers";
import {
  createMarginRuleAction,
  toggleMarginRuleActiveAction,
} from "@/lib/actions/margin-actions";
import { ExportButton } from "@/components/reports/export-button";
import { generateCsv, downloadCsv, type CsvColumn } from "@/lib/utils/export-csv";
import {
  Percent,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sliders,
  TrendingUp,
  TrendingDown,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import Link from "next/link";

interface MetalItem {
  id: string;
  name: string;
  code: string;
  purities: Array<{
    id: string;
    label: string;
    fineness: string;
    isActive: boolean;
  }>;
}

export interface SerializedMarginRule {
  id: string;
  metalId: string;
  metalName: string;
  metalCode: string;
  purityId: string;
  purityLabel: string;
  direction: "BUY" | "SELL";
  marginType: "PERCENTAGE" | "FIXED_PER_GRAM";
  marginValue: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface MarginsClientProps {
  initialRules: SerializedMarginRule[];
  metals: MetalItem[];
  userRole: "ADMIN" | "STAFF";
}

export function MarginsClient({
  initialRules,
  metals,
  userRole,
}: MarginsClientProps) {
  const [rules, setRules] = useState(initialRules);
  const [showAddModal, setShowAddModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [metalFilter, setMetalFilter] = useState("ALL");
  const [purityFilter, setPurityFilter] = useState("ALL");
  const [directionFilter, setDirectionFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [search, setSearch] = useState("");

  const filteredPurities =
    metalFilter === "ALL"
      ? metals.flatMap((m) => m.purities)
      : metals.find((m) => m.id === metalFilter)?.purities || [];

  const filteredRules = rules.filter((r) => {
    if (metalFilter !== "ALL" && r.metalId !== metalFilter) return false;
    if (purityFilter !== "ALL" && r.purityId !== purityFilter) return false;
    if (directionFilter !== "ALL" && r.direction !== directionFilter) return false;
    if (statusFilter === "ACTIVE" && !r.isActive) return false;
    if (statusFilter === "INACTIVE" && r.isActive) return false;
    if (
      search.trim() &&
      !r.notes?.toLowerCase().includes(search.toLowerCase()) &&
      !r.metalName.toLowerCase().includes(search.toLowerCase()) &&
      !r.purityLabel.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleExportCsv = () => {
    const columns: CsvColumn<SerializedMarginRule>[] = [
      { header: "Effective From", accessor: (r) => formatDate(r.effectiveFrom) },
      { header: "Effective To", accessor: (r) => (r.effectiveTo ? formatDate(r.effectiveTo) : "Active / Open") },
      { header: "Direction", accessor: (r) => r.direction },
      { header: "Metal", accessor: (r) => r.metalName },
      { header: "Purity", accessor: (r) => r.purityLabel },
      {
        header: "Margin",
        accessor: (r) =>
          r.marginType === "PERCENTAGE" ? `${r.marginValue}%` : `₹${r.marginValue}/g`,
      },
      { header: "Status", accessor: (r) => (r.isActive ? "ACTIVE" : "INACTIVE") },
      { header: "Created By", accessor: (r) => r.createdByName },
      { header: "Notes", accessor: (r) => r.notes || "" },
    ];
    const csv = generateCsv(filteredRules, columns);
    downloadCsv(csv, `bullion-margin-rules-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleToggle = async (ruleId: string, currentActive: boolean) => {
    try {
      const res = await toggleMarginRuleActiveAction(ruleId, !currentActive);
      if (!res.success) {
        alert(res.error);
        return;
      }
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, isActive: !currentActive } : r)),
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to toggle status");
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-Nav */}
      <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
        <div className="flex items-center gap-2">
          <Link
            href="/masters"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
          >
            Metals & Purities
          </Link>
          <Link
            href="/masters/market-rates"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
          >
            Market Reference Rates (V3.4)
          </Link>
          <Link
            href="/masters/margins"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent)] text-white shadow-xs"
          >
            Margin Rules (V3.5)
          </Link>
          <Link
            href="/quotes"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
          >
            Quote Calculator
          </Link>
        </div>

        {userRole === "ADMIN" && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent)] hover:opacity-90 text-white transition-all cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Margin Rule
          </button>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Total Rules</span>
            <Sliders className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--text-primary)]">
            {rules.length}
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-secondary)]">Configured margin spreads</div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Active Rules</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
            {rules.filter((r) => r.isActive).length}
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-secondary)]">Currently eligible for quoting</div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>BUY Margin Rules</span>
            <TrendingDown className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-blue-400">
            {rules.filter((r) => r.direction === "BUY" && r.isActive).length}
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-secondary)]">Subtracted from market reference</div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>SELL Margin Rules</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-400">
            {rules.filter((r) => r.direction === "SELL" && r.isActive).length}
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-secondary)]">Added to market reference</div>
        </div>
      </div>

      {/* Rules Table & Filters */}
      <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Margin Configuration & History
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono">
              {filteredRules.length} records
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ExportButton onExport={handleExportCsv} label="Export CSV" />
          </div>
        </div>

        {/* Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2">
          {/* Metal Filter */}
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Metal
            </label>
            <select
              value={metalFilter}
              onChange={(e) => {
                setMetalFilter(e.target.value);
                setPurityFilter("ALL");
              }}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
            >
              <option value="ALL">All Metals</option>
              {metals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Purity Filter */}
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Purity
            </label>
            <select
              value={purityFilter}
              onChange={(e) => setPurityFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
            >
              <option value="ALL">All Purities</option>
              {filteredPurities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Direction Filter */}
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Direction
            </label>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as "ALL" | "BUY" | "SELL")}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
            >
              <option value="ALL">All Directions</option>
              <option value="BUY">BUY (Discount)</option>
              <option value="SELL">SELL (Premium)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Search
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search notes, metal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs pl-8 pr-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              />
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Direction</th>
                <th className="px-3.5 py-2.5 font-semibold">Metal / Purity</th>
                <th className="px-3.5 py-2.5 font-semibold">Margin Type</th>
                <th className="px-3.5 py-2.5 font-semibold">Margin Spread</th>
                <th className="px-3.5 py-2.5 font-semibold">Effective Interval</th>
                <th className="px-3.5 py-2.5 font-semibold">Status</th>
                <th className="px-3.5 py-2.5 font-semibold">Notes</th>
                <th className="px-3.5 py-2.5 font-semibold">Created By</th>
                {userRole === "ADMIN" && <th className="px-3.5 py-2.5 font-semibold">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)] text-[var(--text-primary)]">
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={userRole === "ADMIN" ? 9 : 8} className="px-3.5 py-8 text-center text-[var(--text-muted)]">
                    No margin rules found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => {
                  return (
                    <tr key={rule.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            rule.direction === "BUY"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {rule.direction}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="font-semibold text-[var(--text-primary)]">{rule.metalName}</div>
                        <div className="text-[11px] text-[var(--text-secondary)]">{rule.purityLabel}</div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-[11px] text-[var(--text-secondary)]">
                        {rule.marginType === "PERCENTAGE" ? "Percentage (%)" : "Fixed / Gram (₹)"}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap font-mono font-bold">
                        {rule.marginType === "PERCENTAGE" ? (
                          <span className="text-[var(--accent)]">{rule.marginValue}%</span>
                        ) : (
                          <span className="text-emerald-400">₹{parseFloat(rule.marginValue).toFixed(2)}/g</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-[11px]">
                        <div>{formatDate(rule.effectiveFrom)}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {rule.effectiveTo ? `to ${formatDate(rule.effectiveTo)}` : "Open / Active"}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            rule.isActive
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                          }`}
                        >
                          {rule.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-[11px] text-[var(--text-secondary)] max-w-[180px] truncate">
                        {rule.notes || "—"}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-[11px] text-[var(--text-secondary)]">
                        {rule.createdByName}
                      </td>
                      {userRole === "ADMIN" && (
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <button
                            onClick={() => handleToggle(rule.id, rule.isActive)}
                            title={rule.isActive ? "Deactivate Rule" : "Activate Rule"}
                            className="text-xs p-1 rounded hover:bg-white/10 text-[var(--text-secondary)] hover:text-white transition-colors cursor-pointer"
                          >
                            {rule.isActive ? (
                              <ToggleRight className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-zinc-400" />
                            )}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <AddMarginRuleModal
          metals={metals}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            window.location.reload();
          }}
          errorMsg={errorMsg}
          setErrorMsg={setErrorMsg}
        />
      )}
    </div>
  );
}

interface AddMarginRuleModalProps {
  metals: MetalItem[];
  onClose: () => void;
  onSuccess: (rule?: unknown) => void;
  errorMsg: string | null;
  setErrorMsg: (msg: string | null) => void;
}

function AddMarginRuleModal({
  metals,
  onClose,
  onSuccess,
  errorMsg,
  setErrorMsg,
}: AddMarginRuleModalProps) {
  const [isPending, startTransition] = useTransition();

  const [metalId, setMetalId] = useState(metals[0]?.id || "");
  const currentMetal = metals.find((m) => m.id === metalId) || metals[0];
  const [purityId, setPurityId] = useState(currentMetal?.purities[0]?.id || "");
  const [direction, setDirection] = useState<"BUY" | "SELL">("BUY");
  const [marginType, setMarginType] = useState<"PERCENTAGE" | "FIXED_PER_GRAM">("PERCENTAGE");
  const [marginValue, setMarginValue] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      const res = await createMarginRuleAction({
        metalId,
        purityId,
        direction,
        marginType,
        marginValue,
        effectiveFrom: new Date(effectiveFrom),
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to create margin rule");
      } else {
        onSuccess(res.data);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-md p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Add Margin Rule
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-white text-xs px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Metal *
              </label>
              <select
                value={metalId}
                onChange={(e) => {
                  const mId = e.target.value;
                  setMetalId(mId);
                  const selMetal = metals.find((m) => m.id === mId);
                  setPurityId(selMetal?.purities[0]?.id || "");
                }}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              >
                {metals.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Purity *
              </label>
              <select
                value={purityId}
                onChange={(e) => setPurityId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              >
                {currentMetal?.purities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Direction *
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as "BUY" | "SELL")}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              >
                <option value="BUY">BUY (Reference − Margin)</option>
                <option value="SELL">SELL (Reference + Margin)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Margin Type *
              </label>
              <select
                value={marginType}
                onChange={(e) => setMarginType(e.target.value as "PERCENTAGE" | "FIXED_PER_GRAM")}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED_PER_GRAM">Fixed per Gram (₹/g)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Margin Value {marginType === "PERCENTAGE" ? "(%)" : "(₹ per gram)"} *
            </label>
            <input
              type="number"
              step={marginType === "PERCENTAGE" ? "0.01" : "0.50"}
              placeholder={marginType === "PERCENTAGE" ? "e.g. 1.25" : "e.g. 150.00"}
              value={marginValue}
              onChange={(e) => setMarginValue(e.target.value)}
              required
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] font-mono focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Effective Date & Time *
            </label>
            <input
              type="datetime-local"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              required
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Standard retail spot spread"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-hidden"
            />
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[11px] text-[var(--text-secondary)] space-y-1">
            <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <span>Formula:</span>
              <span className="font-mono text-[var(--accent)]">
                {direction === "BUY" ? "Quoted = Ref − Margin" : "Quoted = Ref + Margin"}
              </span>
            </div>
            <div>Existing historical transactions will not be modified.</div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:opacity-90 text-white transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Margin Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
