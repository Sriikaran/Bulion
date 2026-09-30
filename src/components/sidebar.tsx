"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  TrendingDown,
  Package,
  BarChart3,
  Sliders,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  Gem,
  Sun,
  Moon,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { authClient } from "@/lib/auth/auth-client";
import { useTheme } from "@/components/theme-provider";

interface SidebarProps {
  user: {
    name: string;
    email: string;
    role: string;
  };
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavContentProps {
  user: SidebarProps["user"];
  pathname: string;
  navItems: NavItem[];
  adminItems: NavItem[];
  setMobileOpen: (open: boolean) => void;
  handleLogout: () => void;
  loggingOut: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

function NavContent({
  user,
  pathname,
  navItems,
  adminItems,
  setMobileOpen,
  handleLogout,
  loggingOut,
  theme,
  toggleTheme,
}: NavContentProps) {
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <div
      className="flex flex-col h-full p-4 select-none"
      style={{
        background: "var(--bg-sidebar)",
        borderRight: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 mb-2">
        <div className="w-8 h-8 rounded-lg bg-[#C59A58]/20 border border-[#C59A58]/40 flex items-center justify-center text-[#E4BE85] shrink-0">
          <Gem className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-sm text-white tracking-tight flex items-center justify-between">
            <span>Bullion</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#C59A58]/20 text-[#E4BE85] font-mono font-bold">
              INDIA
            </span>
          </div>
          <div className="text-[11px] text-[#A69A8E] truncate">Inventory System</div>
        </div>
      </div>

      {/* User Profile Pill */}
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-black/25 border border-white/5 mb-4">
        <div className="w-7 h-7 rounded-full bg-[#B88B58] text-white flex items-center justify-center font-bold text-xs shadow-inner shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-white truncate">{user.name}</div>
          <div className="text-[10px] text-[#A69A8E] uppercase tracking-wider font-medium">{user.role}</div>
        </div>
      </div>

      {/* Main Nav */}
      <div className="space-y-1 flex-1 overflow-y-auto pr-1">
        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#8F7565]">MENU</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs transition-all duration-150 ${
                active
                  ? "bg-[#4D2D20] text-white shadow-sm border border-[#7A5035]/60 font-semibold"
                  : "text-[#D9CCC1] hover:bg-[#43261B] hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={active ? "text-[#E4BE85]" : "text-[#A89689]"}>
                  <Icon className="w-4 h-4 shrink-0 transition-colors" />
                </span>
                <span className="truncate">{item.label}</span>
              </div>
              {active && <ChevronRight className="w-3.5 h-3.5 text-[#D4A86A] shrink-0" />}
            </Link>
          );
        })}

        {/* Admin Section */}
        {user.role === "ADMIN" && (
          <>
            <div className="px-3 pt-5 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#8F7565] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#D4A86A]" />
              <span>ADMIN CONTROLS</span>
            </div>
            {adminItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs transition-all duration-150 ${
                    active
                      ? "bg-[#4D2D20] text-white shadow-sm border border-[#7A5035]/60 font-semibold"
                      : "text-[#D9CCC1] hover:bg-[#43261B] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={active ? "text-[#E4BE85]" : "text-[#A89689]"}>
                      <Icon className="w-4 h-4 shrink-0 transition-colors" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </div>
                  {active && <ChevronRight className="w-3.5 h-3.5 text-[#D4A86A] shrink-0" />}
                </Link>
              );
            })}
          </>
        )}
      </div>

      {/* Theme Toggle */}
      <div className="pt-3 mb-2" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
        <div
          onClick={toggleTheme}
          className="w-full p-1 rounded-xl flex items-center justify-between cursor-pointer transition-all duration-300 relative select-none bg-black/30 border border-white/5"
          title="Click to switch theme"
        >
          <div
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 z-10 ${
              theme === "light"
                ? "bg-(--bg-card) text-(--text-primary) shadow-md transform scale-[1.02]"
                : "text-(--text-muted) hover:text-(--text-secondary)"
            }`}
          >
            <Sun className={`w-3.5 h-3.5 ${theme === "light" ? "text-(--accent)" : ""}`} />
            <span>Light</span>
          </div>
          <div
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 z-10 ${
              theme === "dark"
                ? "bg-(--bg-card) text-(--accent) shadow-md border border-(--accent-border) transform scale-[1.02]"
                : "text-(--text-muted) hover:text-(--text-secondary)"
            }`}
          >
            <Moon className={`w-3.5 h-3.5 ${theme === "dark" ? "text-(--accent)" : ""}`} />
            <span>Dark</span>
          </div>
        </div>
      </div>

      {/* User Profile Footer */}
      <div>
        <div className="p-2.5 rounded-xl flex items-center justify-between gap-2.5 bg-black/25 border border-white/5">
          <Link href="/profile" className="min-w-0 flex-1 hover:opacity-85 transition-opacity">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs truncate text-white">{user.name}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-[#C59A58]/20 text-[#E4BE85] border border-[#C59A58]/30">
                {user.role}
              </span>
            </div>
            <p className="text-[11px] truncate text-[#A89689] mt-0.5">{user.email}</p>
          </Link>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out"
            className="p-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50 cursor-pointer text-[#A89689] hover:text-red-400 hover:bg-white/10"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Purchases", href: "/purchases", icon: ShoppingCart },
    { label: "Sales", href: "/sales", icon: TrendingDown },
    { label: "Stock", href: "/stock", icon: Package },
    { label: "Reports", href: "/reports", icon: BarChart3 },
    { label: "Adjustments", href: "/adjustments", icon: Sliders },
    { label: "Transactions", href: "/transactions", icon: History },
    { label: "Masters", href: "/masters", icon: ShieldCheck },
    { label: "Counterparties", href: "/counterparties", icon: UserCog },
  ];

  const adminItems: NavItem[] = [];

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await authClient.signOut();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
      setLoggingOut(false);
    }
  };

  return (
    <>
      {/* Mobile Toggle Button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2.5 rounded-xl shadow-lg transition-colors cursor-pointer"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            color: "var(--text-primary)",
          }}
          aria-label="Toggle Navigation"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 animate-fadeIn"
          style={{ background: "var(--bg-overlay)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`lg:hidden fixed top-0 left-0 bottom-0 w-72 z-50 transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <NavContent
          user={user}
          pathname={pathname}
          navItems={navItems}
          adminItems={adminItems}
          setMobileOpen={setMobileOpen}
          handleLogout={handleLogout}
          loggingOut={loggingOut}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </aside>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 h-screen sticky top-0 shrink-0">
        <NavContent
          user={user}
          pathname={pathname}
          navItems={navItems}
          adminItems={adminItems}
          setMobileOpen={setMobileOpen}
          handleLogout={handleLogout}
          loggingOut={loggingOut}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </aside>
    </>
  );
}
