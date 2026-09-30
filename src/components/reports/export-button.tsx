"use client";

import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";

interface ExportButtonProps {
  onExport: () => Promise<void> | void;
  label?: string;
  className?: string;
}

export function ExportButton({
  onExport,
  label = "Export CSV",
  className = "",
}: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleClick = async () => {
    try {
      setExporting(true);
      await onExport();
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={exporting}
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] border border-[var(--border-primary)] transition-all cursor-pointer disabled:opacity-50 ${className}`}
      title="Download report data as CSV file"
    >
      {exporting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C59A58]" />
      ) : (
        <Download className="w-3.5 h-3.5 text-[#C59A58]" />
      )}
      <span>{exporting ? "Exporting..." : label}</span>
    </button>
  );
}
