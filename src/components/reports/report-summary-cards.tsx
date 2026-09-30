import React from "react";

export interface SummaryCardItem {
  label: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: string;
}

interface ReportSummaryCardsProps {
  cards: SummaryCardItem[];
}

export function ReportSummaryCards({ cards }: ReportSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] relative overflow-hidden flex flex-col justify-between"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {card.label}
              </p>
              <h3 className="text-xl font-extrabold text-[var(--text-primary)] mt-1 tracking-tight font-mono">
                {card.value}
              </h3>
            </div>
            {card.icon && (
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border"
                style={{
                  background: card.accent ? `${card.accent}15` : "rgba(197, 154, 88, 0.15)",
                  borderColor: card.accent ? `${card.accent}30` : "rgba(197, 154, 88, 0.3)",
                  color: card.accent || "#C59A58",
                }}
              >
                {card.icon}
              </div>
            )}
          </div>
          {card.subtitle && (
            <p className="text-[11px] text-[var(--text-secondary)] mt-2 border-t border-[var(--border-primary)]/40 pt-1.5 truncate">
              {card.subtitle}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
