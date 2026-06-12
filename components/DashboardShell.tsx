"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { LayoutList, Columns3, Calendar } from "lucide-react";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import { RealtimeProvider } from "@/components/RealtimeProvider";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { RealtimeIndicator } from "@/components/RealtimeIndicator";
import { cn } from "@/lib/utils";

const viewTabs = [
  { href: "/dashboard", label: "List", icon: LayoutList, match: (p: string) => p === "/dashboard" },
  { href: "/dashboard/board", label: "Board", icon: Columns3, match: (p: string) => p.startsWith("/dashboard/board") },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar, match: (p: string) => p.startsWith("/dashboard/calendar") },
];

function DashboardNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-zinc-200/60 bg-white/50 dark:border-zinc-800/60 dark:bg-zinc-950/50">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <WorkspaceSwitcher />
          <RealtimeIndicator />
        </div>
        <div className="flex gap-1">
          {viewTabs.map(({ href, label, icon: Icon, match }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                match(pathname)
                  ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <RealtimeProvider>
        <Suspense fallback={null}>
          <DashboardNav />
        </Suspense>
        {children}
      </RealtimeProvider>
    </WorkspaceProvider>
  );
}
