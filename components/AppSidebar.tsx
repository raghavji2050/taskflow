"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import {
  CheckSquare,
  LayoutList,
  Columns3,
  Calendar,
  UserCircle,
  GanttChart,
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
  FolderKanban,
} from "lucide-react";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { NotificationBell } from "@/components/NotificationBell";
import { useRealtime } from "@/components/RealtimeProvider";
import { clearWorkspaceSelection, useWorkspace } from "@/components/WorkspaceProvider";
import { useChatUnread } from "@/lib/useChatUnread";
import {
  MOBILE_SIDEBAR_DRAWER_ID,
  MOBILE_SIDEBAR_OVERLAY_ID,
  useMobileSidebarSwipe,
} from "@/lib/use-mobile-sidebar-swipe";
import { GlowBadge } from "@/components/ui/GlowBadge";
import { useMobileSidebar } from "@/components/MobileSidebarProvider";
import { cn, getInitials } from "@/lib/utils";

export const SIDEBAR_COLLAPSED_KEY = "taskflow-sidebar-collapsed";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutList;
  match: (pathname: string) => boolean;
};

const taskNavItems: NavItem[] = [
  { href: "/dashboard", label: "List", icon: LayoutList, match: (p) => p === "/dashboard" },
  {
    href: "/dashboard/board",
    label: "Board",
    icon: Columns3,
    match: (p) => p.startsWith("/dashboard/board"),
  },
  {
    href: "/dashboard/calendar",
    label: "Calendar",
    icon: Calendar,
    match: (p) => p.startsWith("/dashboard/calendar"),
  },
  {
    href: "/dashboard/my-work",
    label: "My Work",
    icon: UserCircle,
    match: (p) => p.startsWith("/dashboard/my-work"),
  },
  {
    href: "/dashboard/timeline",
    label: "Timeline",
    icon: GanttChart,
    match: (p) => p.startsWith("/dashboard/timeline"),
  },
  {
    href: "/dashboard/reports/time",
    label: "Time Reports",
    icon: Clock,
    match: (p) => p.startsWith("/dashboard/reports/time"),
  },
];

const collaborateNavItems: NavItem[] = [
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

const workspaceNavItems: NavItem[] = [
  {
    href: "/dashboard/projects",
    label: "Projects",
    icon: FolderKanban,
    match: (p) => p.startsWith("/dashboard/projects"),
  },
  {
    href: "/dashboard/team",
    label: "Team",
    icon: Users,
    match: (p) => p.startsWith("/dashboard/team"),
  },
];

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
        className={cn("sidebar-user-trigger", collapsed && "justify-center px-2")}
        aria-expanded={open}
        title={collapsed ? session?.user?.name ?? "Account" : undefined}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-semibold text-white">
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

  const sections = [
    { label: "Tasks", items: taskNavItems },
    ...(isPersonal ? [] : [{ label: "Workspace", items: workspaceNavItems }]),
    { label: "Collaboration", items: collaborateNavItems },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex h-14 shrink-0 items-center border-b border-[var(--sidebar-border)]", collapsed ? "justify-center px-2" : "gap-2 px-3")}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "flex-1 gap-2.5")}
          title={collapsed ? "TaskFlow" : undefined}
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
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
        {!collapsed && <p className="sidebar-section-label mb-2">Workspace</p>}
        <WorkspaceSwitcher layout="sidebar" collapsed={collapsed} />
      </div>

      <nav className={cn("flex-1 overflow-y-auto pb-2", collapsed ? "px-2" : "px-3")}>
        {sections.map((section, sectionIndex) => (
          <div key={section.label} className={cn(sectionIndex > 0 && "mt-4")}>
            {!collapsed && <p className="sidebar-section-label mb-2">{section.label}</p>}
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon, match }) => {
                const active = match(pathname);
                const unreadBadge = href === "/dashboard/messages" ? totalUnread : 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    title={collapsed ? label : undefined}
                    className={cn(
                      "sidebar-nav-item",
                      active && "active",
                      collapsed && "justify-center px-2"
                    )}
                  >
                    <Icon
                      className={cn(
                        "sidebar-nav-icon h-[18px] w-[18px] shrink-0",
                        active ? "text-[var(--accent)]" : "text-[var(--muted)]"
                      )}
                      strokeWidth={active ? 2.25 : 2}
                    />
                    {!collapsed && (
                      <>
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {unreadBadge > 0 && (
                          <GlowBadge size="md">{unreadBadge > 99 ? "99+" : unreadBadge}</GlowBadge>
                        )}
                      </>
                    )}
                    {collapsed && unreadBadge > 0 && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
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
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-white">
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
