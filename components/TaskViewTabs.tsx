"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Columns3, GanttChart, LayoutList, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const TASK_VIEW_TABS = [
  { href: "/dashboard", label: "List", icon: LayoutList },
  { href: "/dashboard/board", label: "Board", icon: Columns3 },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/timeline", label: "Timeline", icon: GanttChart },
  { href: "/dashboard/my-work", label: "My Work", icon: UserCircle },
] as const;

export function isTaskViewPath(pathname: string): boolean {
  return TASK_VIEW_TABS.some((t) => (t.href === "/dashboard" ? pathname === t.href : pathname.startsWith(t.href)));
}

/** One place to switch between the task views that used to be separate sidebar items. */
export function TaskViewTabs() {
  const pathname = usePathname();
  if (!isTaskViewPath(pathname)) return null;
  return (
    <nav aria-label="Task views" data-testid="task-view-tabs" className="-mx-1 mb-4 shrink-0 overflow-x-auto px-1">
      <div className="inline-flex min-w-max gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-1">
        {TASK_VIEW_TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors max-sm:h-10",
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
