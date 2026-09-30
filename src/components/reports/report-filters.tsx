"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Filter, Search, RotateCcw } from "lucide-react";

interface FilterProps {
  metals?: Array<{ id: string; name: string; code: string }>;
  purities?: Array<{ id: string; label: string; metalId: string }>;
  showStatus?: boolean;
  showMetalPurity?: boolean;
  showSearch?: boolean;
  searchPlaceholder?: string;
}

export function ReportFilters({
  metals = [],
  purities = [],
  showStatus = true,
  showMetalPurity = true,
  showSearch = true,
  searchPlaceholder = "Search by invoice, counterparty, notes...",
}: FilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");
  const [metalId, setMetalId] = useState(searchParams.get("metalId") ?? "");
  const [purityId, setPurityId] = useState(searchParams.get("purityId") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "ALL");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const filteredPurities = metalId
    ? purities.filter((p) => p.metalId === metalId)
    : purities;

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams();

    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (metalId) params.set("metalId", metalId);
    if (purityId) params.set("purityId", purityId);
    if (status && status !== "ALL") params.set("status", status);
    if (search && search.trim()) params.set("search", search.trim());

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleReset = () => {
    setDateFrom("");
    setDateTo("");
    setMetalId("");
    setPurityId("");
    setStatus("ALL");
    setSearch("");
    router.push(pathname);
  };

  return (
    <form
      onSubmit={handleApply}
      className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] space-y-4"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-primary)]/40 pb-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
          <Filter className="w-3.5 h-3.5 text-[#C59A58]" />
          <span>Report Filters</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          <button
            type="submit"
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#C59A58] text-white hover:bg-[#B88B58] transition-colors cursor-pointer shadow-sm"
          >
            Apply Filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Date From */}
        <div>
          <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
            Date From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[#C59A58]"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
            Date To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[#C59A58]"
          />
        </div>

        {/* Metal */}
        {showMetalPurity && (
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Metal
            </label>
            <select
              value={metalId}
              onChange={(e) => {
                setMetalId(e.target.value);
                setPurityId("");
              }}
              className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[#C59A58]"
            >
              <option value="">All Metals</option>
              {metals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Purity */}
        {showMetalPurity && (
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Purity
            </label>
            <select
              value={purityId}
              onChange={(e) => setPurityId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[#C59A58]"
            >
              <option value="">All Purities</option>
              {filteredPurities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Status */}
        {showStatus && (
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[#C59A58]"
            >
              <option value="ALL">All Statuses</option>
              <option value="POSTED">POSTED (Active)</option>
              <option value="DRAFT">DRAFT</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
        )}

        {/* Search */}
        {showSearch && (
          <div className={showStatus ? "sm:col-span-2 md:col-span-1" : "sm:col-span-2"}>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-xl text-xs bg-[var(--bg-input)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[#C59A58]"
              />
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
