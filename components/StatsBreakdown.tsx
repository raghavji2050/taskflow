"use client";

import { cn } from "@/lib/utils";

interface BreakdownItem {
  status: string;
  priority: string;
  _count: number;
}

interface StatsBreakdownProps {
  breakdown: BreakdownItem[];
}

const statusColors: Record<string, string> = {
  PENDING: "bg-sky-500",
  IN_PROGRESS: "bg-violet-500",
  COMPLETED: "bg-emerald-500",
};

export function StatsBreakdown({ breakdown, compact = false }: StatsBreakdownProps & { compact?: boolean }) {
  const byStatus = breakdown.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + item._count;
      return acc;
    },
    {} as Record<string, number>
  );

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  if (compact) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-[var(--card-border)] sm:border-l sm:pl-4">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Status</span>
        {Object.entries(byStatus).map(([status, count]) => (
          <span
            key={status}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-hover)] px-2 py-0.5 text-xs"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", statusColors[status] ?? "bg-[var(--muted)]")} />
            <span className="text-[var(--muted)]">{status.replace("_", " ")}</span>
            <span className="font-semibold tabular-nums text-[var(--foreground)]">{count}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="widget-card rounded-xl p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">By Status</p>
      <div className="space-y-2">
        {Object.entries(byStatus).map(([status, count]) => (
          <div key={status} className="flex items-center gap-2">
            <span className="w-20 text-xs text-[var(--muted)]">
              {status.replace("_", " ")}
            </span>
            <div className="flex-1 h-2 rounded-full bg-[var(--surface-hover)] overflow-hidden">
              <div
                className={`h-full rounded-full ${statusColors[status] ?? "bg-[var(--muted)]"}`}
                style={{ width: `${(count / total) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right text-xs font-medium tabular-nums text-[var(--foreground)]">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
