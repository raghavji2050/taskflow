"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckSquare,
  LayoutList,
  Columns3,
  Calendar,
  UserCircle,
  GanttChart,
  LogOut,
  Moon,
  Settings,
  Sun,
  X,
  Menu,
  ChevronUp,
  Shield,
  MessageSquare,
} from "lucide-react";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { NotificationBell } from "@/components/NotificationBell";
import { useRealtime } from "@/components/RealtimeProvider";
import { clearWorkspaceSelection } from "@/components/WorkspaceProvider";
import { cn, getInitials } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "List", icon: LayoutList, match: (p: string) => p === "/dashboard" },
  { href: "/dashboard/board", label: "Board", icon: Columns3, match: (p: string) => p.startsWith("/dashboard/board") },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar, match: (p: string) => p.startsWith("/dashboard/calendar") },
  { href: "/dashboard/my-work", label: "My Work", icon: UserCircle, match: (p: string) => p.startsWith("/dashboard/my-work") },
  { href: "/dashboard/timeline", label: "Timeline", icon: GanttChart, match: (p: string) => p.startsWith("/dashboard/timeline") },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare, match: (p: string) => p.startsWith("/dashboard/messages") },
];

function SidebarUserMenu() {
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState({ bottom: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
      width: rect.width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        const menu = document.getElementById("sidebar-user-menu");
        if (menu && menu.contains(e.target as Node)) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const menu = open && mounted ? (
    <>
      <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        id="sidebar-user-menu"
        className="sidebar-menu fixed z-[201] min-w-[220px] py-1"
        style={{ bottom: menuPos.bottom, left: menuPos.left, width: menuPos.width }}
      >
        {session?.user?.role === "ADMIN" && (
          <Link href="/admin" onClick={() => setOpen(false)} className="sidebar-menu-item">
            <Shield className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <span>Admin panel</span>
          </Link>
        )}
        <Link href="/settings" onClick={() => setOpen(false)} className="sidebar-menu-item">
          <Settings className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <span>Settings</span>
        </Link>
        {mounted && (
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="sidebar-menu-item"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            ) : (
              <Moon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            )}
            <span>{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        )}
        <div className="my-1 h-px bg-[var(--card-border)]" />
        <button
          type="button"
          onClick={() => {
            clearWorkspaceSelection();
            signOut({ callbackUrl: "/login" });
          }}
          className="sidebar-menu-item text-red-500 hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="sidebar-user-trigger"
        aria-expanded={open}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold text-white">
          {getInitials(session?.user?.name ?? "U")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">{session?.user?.name}</p>
          <p className="truncate text-[11px] text-[var(--muted)]">{session?.user?.email}</p>
        </div>
        <ChevronUp className={cn("h-4 w-4 shrink-0 text-[var(--muted)] transition-transform", open && "rotate-180")} />
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </>
  );
}

function SidebarContent({
  onNavigate,
  onClose,
}: {
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { connected } = useRealtime();

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--sidebar-border)] px-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
            <CheckSquare className="h-4 w-4" strokeWidth={2.5} />
            {connected && (
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-[var(--sidebar)] bg-emerald-500"
                title="Live sync active"
              />
            )}
          </div>
          <span className="truncate text-[15px] font-bold tracking-tight text-[var(--foreground)]">
            TaskFlow
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-0.5">
          <NotificationBell placement="sidebar" />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Workspace */}
      <div className="shrink-0 px-3 py-4">
        <p className="sidebar-section-label mb-2">Workspace</p>
        <WorkspaceSwitcher layout="sidebar" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3">
        <p className="sidebar-section-label mb-2">Views</p>
        <div className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn("sidebar-nav-item", active && "active")}
              >
                <Icon className={cn("sidebar-nav-icon h-[18px] w-[18px] shrink-0", active ? "text-[var(--accent)]" : "text-[var(--muted)]")} strokeWidth={active ? 2.25 : 2} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User */}
      <div className="shrink-0 border-t border-[var(--sidebar-border)] p-3">
        <SidebarUserMenu />
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--sidebar-border)] bg-[var(--sidebar)] px-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--sidebar-hover)]"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-white">
            <CheckSquare className="h-3.5 w-3.5" strokeWidth={2.5} />
          </div>
          <span className="truncate text-sm font-bold">TaskFlow</span>
        </Link>
        <NotificationBell placement="sidebar" />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-[var(--sidebar)] shadow-2xl">
            <SidebarContent
              onNavigate={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-[252px] shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-dvh lg:overflow-visible">
        <SidebarContent />
      </aside>
    </>
  );
}
