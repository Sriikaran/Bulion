import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { UserCog, ShieldCheck, Mail, Key } from "lucide-react";

export const metadata = {
  title: "My Profile — Bullion",
};

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="User Profile"
        subtitle="Manage session credentials and view active role authorization"
      />

      <div className="glass-card rounded-2xl border border-[var(--border-primary)] p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#C59A58] text-white flex items-center justify-center font-bold text-xl shadow-md">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">{user.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#C59A58]/20 text-[#C59A58] border border-[#C59A58]/30">
                {user.role}
              </span>
              <span className="text-xs text-[var(--text-muted)]">Bullion System Operator</span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-[var(--border-primary)] text-xs">
          <div className="py-3 flex items-center justify-between">
            <span className="text-[var(--text-secondary)] flex items-center gap-2">
              <Mail className="w-4 h-4 text-[var(--text-muted)]" />
              <span>Email Address</span>
            </span>
            <span className="font-semibold text-[var(--text-primary)]">{user.email}</span>
          </div>

          <div className="py-3 flex items-center justify-between">
            <span className="text-[var(--text-secondary)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--text-muted)]" />
              <span>System Role</span>
            </span>
            <span className="font-mono font-bold text-[#C59A58]">{user.role}</span>
          </div>

          <div className="py-3 flex items-center justify-between">
            <span className="text-[var(--text-secondary)] flex items-center gap-2">
              <Key className="w-4 h-4 text-[var(--text-muted)]" />
              <span>Permissions</span>
            </span>
            <span className="text-[var(--text-secondary)]">
              {user.role === "ADMIN"
                ? "Full administrative control, master editing, opening stock, adjustments, cancellations"
                : "Operational transactions, purchase entry, sale entry, stock visibility"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
