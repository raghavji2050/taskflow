import { AlertTriangle, CheckCircle2, Circle, ListTodo, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashboardStatsData {
  total: number;
  completed: number;
  pending: number;
  inProgress?: number;
  highPriority: number;
  completionPercentage: number;
  breakdown?: { status: string; priority: string; _count: number }[];
}

interface DashboardStatsProps { stats: DashboardStatsData; }

const statCards = [
  { key: "total" as const, label: "Total", icon: ListTodo, accent: "text-indigo-500", iconBg: "bg-indigo-500/10" },
  { key: "completed" as const, label: "Done", icon: CheckCircle2, accent: "text-emerald-500", iconBg: "bg-emerald-500/10" },
  { key: "pending" as const, label: "Pending", icon: Circle, accent: "text-sky-500", iconBg: "bg-sky-500/10" },
  { key: "highPriority" as const, label: "Urgent", icon: AlertTriangle, accent: "text-red-500", iconBg: "bg-red-500/10" },
];

export function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {statCards.map(({ key, label, icon: Icon, accent, iconBg }) => (
        <div key={key} className="stat-card rounded-xl p-3.5">
          <div className="flex items-center gap-2.5">
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconBg)}>
              <Icon className={cn("h-3.5 w-3.5", accent)} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-zinc-500">{label}</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{stats[key]}</p>
            </div>
          </div>
        </div>
      ))}
      {stats.inProgress !== undefined && stats.inProgress > 0 && (
        <div className="stat-card col-span-2 flex items-center gap-2 rounded-xl p-3 sm:col-span-4">
          <Loader2 className="h-4 w-4 text-violet-500" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{stats.inProgress} in progress</span>
        </div>
      )}
    </div>
  );
}

export function CompletionRing({ stats }: DashboardStatsProps) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (stats.completionPercentage / 100) * circumference;

  return (
    <div className="stat-card flex h-full items-center gap-4 rounded-xl p-4">
      <div className="relative h-16 w-16 shrink-0">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-zinc-100 dark:text-zinc-800" />
          <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset} className="text-indigo-500 transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold tabular-nums">{stats.completionPercentage}%</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-500">Progress</p>
        <p className="mt-0.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {stats.completed} / {stats.total}
        </p>
        <p className="text-xs text-zinc-400">completed</p>
      </div>
    </div>
  );
}
