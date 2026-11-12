"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOutToLogin } from "@/lib/client-signout";
import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import {
  CheckSquare,
  Search,
  LayoutList,
  Clock,
  LogOut,
  Moon,
  Settings,
  Sun,
  X,
  Menu,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Shield,
  MessageSquare,
  BookOpen,
  Users,
  Trash2,
  PieChart as PieChartIcon,
  Target,
  History,
  DatabaseBackup,
} from "lucide-react";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { SidebarLink, SidebarMore, SidebarProjects, type NavItem } from "@/components/SidebarSections";
import { NotificationBell } from "@/components/NotificationBell";
import { openCommandPalette } from "@/lib/command-palette-event";
import { useRealtime } from "@/components/RealtimeProvider";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useChatUnread } from "@/lib/useChatUnread";
import {
  MOBILE_SIDEBAR_DRAWER_ID,
  MOBILE_SIDEBAR_OVERLAY_ID,
  useMobileSidebarSwipe,
} from "@/lib/use-mobile-sidebar-swipe";
import { useMobileSidebar } from "@/components/MobileSidebarProvider";
import { cn, getInitials } from "@/lib/utils";

export const SIDEBAR_COLLAPSED_KEY = "taskflow-sidebar-collapsed";


const TASK_VIEW_PREFIXES = ["/dashboard/board", "/dashboard/calendar", "/dashboard/timeline", "/dashboard/my-work"];

/** Primary nav: the few places people go every day. Views (Board/Calendar/…) live in tabs on My Tasks. */
const primaryNavItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "My Tasks",
    icon: LayoutList,
    match: (p) => p === "/dashboard" || TASK_VIEW_PREFIXES.some((x) => p.startsWith(x)),
  },
  {
    href: "/dashboard/messages",
    label: "Messages",
    icon: MessageSquare,
    match: (p) => p.startsWith("/dashboard/messages"),
  },
  {
    href: "/dashboard/docs",
    label: "Docs",
    icon: BookOpen,
    match: (p) => p.startsWith("/dashboard/docs"),
  },
];

const insightsNavItem: NavItem = {
  href: "/dashboard/reports/insights",
  label: "Insights",
  icon: PieChartIcon,
  match: (p) => p.startsWith("/dashboard/reports/insights"),
};

const goalsNavItem: NavItem = {
  href: "/dashboard/goals",
  label: "Goals",
  icon: Target,
  match: (p) => p.startsWith("/dashboard/goals"),
};

const timeReportsNavItem: NavItem = {
  href: "/dashboard/reports/time",
  label: "Time Reports",
  icon: Clock,
  match: (p) => p.startsWith("/dashboard/reports/time"),
};

const teamNavItem: NavItem = {
  href: "/dashboard/team",
  label: "Team",
  icon: Users,
  match: (p) => p.startsWith("/dashboard/team"),
};

const activityNavItem: NavItem = {
  href: "/dashboard/activity",
  label: "Activity log",
  icon: History,
  match: (p) => p.startsWith("/dashboard/activity"),
};

const backupsNavItem: NavItem = {
  href: "/dashboard/backups",
  label: "Backups",
  icon: DatabaseBackup,
  match: (p) => p.startsWith("/dashboard/backups"),
};

/** Backups link is only for allow-listed admins (BACKUP_ADMIN_EMAILS / ADMIN role). */
function useCanViewBackups() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetch("/api/backups/access", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { allowed: false }))
      .then((d: { allowed?: boolean }) => alive && setAllowed(!!d.allowed))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);
  return !!userId && allowed;
}

const trashNavItem: NavItem = {
  href: "/dashboard/trash",
  label: "Trash",
  icon: Trash2,
  match: (p) => p.startsWith("/dashboard/trash"),
};


function SidebarUserMenu({ collapsed }: { collapsed?: boolean }) {
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
      width: collapsed ? 220 : rect.width,
    });
  }, [open, collapsed]);

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
        <div className="my-1 h-px bg-[var(--border)]" />
        <button
          type="button"
          onClick={() => {
            void signOutToLogin();
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
        className={cn("sidebar-user-trigger", collapsed && "justify-center px-2")}
        aria-expanded={open}
        title={collapsed ? session?.user?.name ?? "Account" : undefined}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-solid)] text-[11px] font-semibold text-white">
          {getInitials(session?.user?.name ?? "U")}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--foreground)]">{session?.user?.name}</p>
              <p className="truncate text-[11px] text-[var(--muted)]">{session?.user?.email}</p>
            </div>
            <ChevronUp className={cn("h-4 w-4 shrink-0 text-[var(--muted)] transition-transform", open && "rotate-180")} />
          </>
        )}
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </>
  );
}

function SidebarContent({
  onNavigate,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const { connected } = useRealtime();
  const { totalUnread } = useChatUnread();
  const { isPersonal } = useWorkspace();
  const canViewBackups = useCanViewBackups();
  const baseMore = isPersonal ? [insightsNavItem, goalsNavItem, timeReportsNavItem, activityNavItem, trashNavItem] : [insightsNavItem, goalsNavItem, timeReportsNavItem, teamNavItem, activityNavItem, trashNavItem];
  const moreItems = canViewBackups ? [...baseMore, backupsNavItem] : baseMore;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex h-14 shrink-0 items-center border-b border-[var(--sidebar-border)]", collapsed ? "justify-center px-2" : "gap-2 px-3")}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "flex-1 gap-2.5")}
          title={collapsed ? "TaskFlow" : undefined}
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-solid)] text-white">
            <CheckSquare className="h-4 w-4" strokeWidth={2.5} />
            {connected && (
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-[var(--sidebar)] bg-[var(--status-online)]"
                title="Live sync active"
              />
            )}
          </div>
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
              TaskFlow
            </span>
          )}
        </Link>
        {!collapsed && (
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
        )}
      </div>

      <div className={cn("shrink-0 py-3", collapsed ? "px-2" : "px-3")}>
        <button
          type="button"
          onClick={() => { onClose?.(); openCommandPalette(); }}
          aria-label="Search everything"
          title="Search (Ctrl/⌘ K)"
          className={cn(
            "mb-3 flex h-9 w-full items-center gap-2 rounded-lg border border-[var(--border)] text-sm text-[var(--muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]",
            collapsed ? "justify-center" : "px-3"
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search…</span>
              <kbd className="rounded border border-[var(--border)] px-1 text-[10px]">Ctrl K</kbd>
            </>
          )}
        </button>
        {!collapsed && <p className="sidebar-section-label mb-2">Workspace</p>}
        <WorkspaceSwitcher layout="sidebar" collapsed={collapsed} />
      </div>

      <nav className={cn("flex-1 overflow-y-auto pb-2", collapsed ? "px-2" : "px-3")} aria-label="Main">
        <div className="space-y-0.5">
          {primaryNavItems.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={item.match(pathname)}
              collapsed={collapsed}
              onNavigate={onNavigate}
              badge={item.href === "/dashboard/messages" ? totalUnread : 0}
            />
          ))}
        </div>

        <SidebarProjects collapsed={collapsed} onNavigate={onNavigate} />

        <SidebarMore items={moreItems} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>

      <div className={cn("shrink-0 border-t border-[var(--sidebar-border)]", collapsed ? "p-2" : "p-3")}>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              "mb-2 flex w-full items-center rounded-lg py-2 text-[var(--muted)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]",
              collapsed ? "justify-center px-2" : "gap-2 px-3"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-xs font-medium">Collapse</span>
              </>
            )}
          </button>
        )}
        <SidebarUserMenu collapsed={collapsed} />
      </div>
    </div>
  );
}

export function AppSidebar() {
  const { mobileOpen, setMobileOpen } = useMobileSidebar();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "true") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useMobileSidebarSwipe({
    isOpen: mobileOpen,
    onOpen: () => setMobileOpen(true),
    onClose: () => setMobileOpen(false),
  });

  const sidebarWidth = collapsed ? 64 : 252;

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--sidebar)] px-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--sidebar-hover)]"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-solid)] text-white">
            <CheckSquare className="h-3.5 w-3.5" strokeWidth={2.5} />
          </div>
          <span className="truncate text-sm font-semibold">TaskFlow</span>
        </Link>
        <NotificationBell placement="sidebar" />
      </div>

      {mobileOpen && (
        <div id={MOBILE_SIDEBAR_OVERLAY_ID} className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside
            id={MOBILE_SIDEBAR_DRAWER_ID}
            className="surface-panel absolute inset-y-0 left-0 z-[1] flex h-full w-[min(280px,85vw)] min-h-0 flex-col overflow-hidden rounded-none border-r border-[var(--border)] bg-[var(--sidebar)] shadow-lg"
          >
            <SidebarContent
              onNavigate={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {mounted && (
        <motion.aside
          className="surface-panel hidden shrink-0 flex-col rounded-none border-r border-[var(--border)] lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-dvh lg:overflow-visible"
          animate={{ width: sidebarWidth }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        >
          <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapse} />
        </motion.aside>
      )}
      {!mounted && (
        <aside className="surface-panel hidden w-[252px] shrink-0 flex-col rounded-none border-r border-[var(--border)] lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-dvh" />
      )}
    </>
  );
}
