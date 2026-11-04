"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FolderKanban, MoreHorizontal, Plus, type LucideIcon } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { GlowBadge } from "@/components/ui/GlowBadge";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

export const PROJECTS_CHANGED_EVENT = "taskflow:projects";
const MORE_OPEN_KEY = "taskflow-sidebar-more-open";

export function SidebarLink({
  item,
  active,
  collapsed,
  onNavigate,
  badge = 0,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  badge?: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn("sidebar-nav-item", active && "active", collapsed && "justify-center px-2")}
    >
      <Icon
        className={cn("sidebar-nav-icon h-[18px] w-[18px] shrink-0", active ? "text-[var(--accent)]" : "text-[var(--muted)]")}
        strokeWidth={active ? 2.25 : 2}
      />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {badge > 0 && <GlowBadge size="md">{badge > 99 ? "99+" : badge}</GlowBadge>}
        </>
      )}
      {collapsed && badge > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" />}
    </Link>
  );
}

type SidebarProject = { id: string; name: string; color: string; archived?: boolean };

/** Projects of the current workspace, listed right in the sidebar. */
export function SidebarProjects({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { selectedWorkspaceId, isPersonal } = useWorkspace();
  const [projects, setProjects] = useState<SidebarProject[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(PROJECTS_CHANGED_EVENT, bump);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, bump);
  }, []);

  const onProjectsPage = pathname.startsWith("/dashboard/projects");
  useEffect(() => {
    if (!selectedWorkspaceId) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/workspaces/${selectedWorkspaceId}/projects`)
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => {
        if (!cancelled) setProjects(((d.projects ?? []) as SidebarProject[]).filter((p) => !p.archived));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Refetch when entering/leaving project pages so new/renamed projects show up.
  }, [selectedWorkspaceId, tick, onProjectsPage]);

  const listActive = pathname === "/dashboard/projects";

  if (collapsed) {
    return (
      <div className="mt-4">
        <SidebarLink
          item={{ href: "/dashboard/projects", label: "Projects", icon: FolderKanban, match: () => false }}
          active={onProjectsPage}
          collapsed
          onNavigate={onNavigate}
        />
      </div>
    );
  }

  return (
    <div className="mt-4" data-testid="sidebar-projects">
      <div className="mb-1 flex items-center justify-between pr-1">
        <Link
          href="/dashboard/projects"
          onClick={onNavigate}
          className={cn("sidebar-section-label hover:text-[var(--foreground)]", listActive && "text-[var(--accent)]")}
        >
          Projects
        </Link>
        {!isPersonal && (
          <Link
            href="/dashboard/projects?new=1"
            onClick={onNavigate}
            aria-label="New project"
            title="New project"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {isPersonal ? (
        <Link
          href="/dashboard/projects"
          onClick={onNavigate}
          className="block rounded-lg px-3 py-2 text-xs text-[var(--muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]"
        >
          Projects live in a workspace. <span className="font-medium text-[var(--accent)]">Set one up →</span>
        </Link>
      ) : projects.length === 0 ? (
        <Link
          href="/dashboard/projects?new=1"
          onClick={onNavigate}
          className="block rounded-lg px-3 py-2 text-xs text-[var(--muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]"
        >
          No projects yet. <span className="font-medium text-[var(--accent)]">Create one →</span>
        </Link>
      ) : (
        <div className="space-y-0.5">
          {projects.map((project) => {
            const href = `/dashboard/projects/${project.id}`;
            const active = pathname === href;
            return (
              <Link
                key={project.id}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn("sidebar-nav-item", active && "active")}
              >
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: project.color }} />
                </span>
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Less-used pages, tucked under a collapsible "More". Opens automatically when one is active. */
export function SidebarMore({ items, collapsed, onNavigate }: { items: NavItem[]; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const anyActive = items.some((i) => i.match(pathname));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(MORE_OPEN_KEY) === "true") setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MORE_OPEN_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const expanded = open || anyActive || collapsed;

  return (
    <div className="mt-4">
      {!collapsed && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="sidebar-nav-item w-full text-[var(--muted)]"
        >
          <MoreHorizontal className="sidebar-nav-icon h-[18px] w-[18px] shrink-0 text-[var(--muted)]" />
          <span className="min-w-0 flex-1 truncate text-left">More</span>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      )}
      {expanded && (
        <div className={cn("space-y-0.5", !collapsed && "mt-0.5 pl-3")}>
          {items.map((item) => (
            <SidebarLink key={item.href} item={item} active={item.match(pathname)} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
