"use client";

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

export function StatsBreakdown({ breakdown }: StatsBreakdownProps) {
  const byStatus = breakdown.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + item._count;
      return acc;
    },
    {} as Record<string, number>
  );

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return (
    <div className="stat-card rounded-xl p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">By Status</p>
      <div className="space-y-2">
        {Object.entries(byStatus).map(([status, count]) => (
          <div key={status} className="flex items-center gap-2">
            <span className="w-20 text-xs text-zinc-600 dark:text-zinc-400">
              {status.replace("_", " ")}
            </span>
            <div className="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${statusColors[status] ?? "bg-zinc-400"}`}
                style={{ width: `${(count / total) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right text-xs font-medium tabular-nums">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
