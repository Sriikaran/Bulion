import React from "react";
import { PackageOpen } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)" }}
      >
        <PackageOpen className="w-7 h-7" style={{ color: "var(--accent)" }} />
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
