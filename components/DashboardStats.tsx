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
  { key: "total" as const, label: "Total", icon: ListTodo, accent: "text-[var(--accent)]", iconBg: "bg-[var(--accent-soft)]" },
  { key: "completed" as const, label: "Done", icon: CheckCircle2, accent: "text-emerald-600", iconBg: "bg-emerald-500/10" },
  { key: "pending" as const, label: "Pending", icon: Circle, accent: "text-sky-600", iconBg: "bg-sky-500/10" },
  { key: "highPriority" as const, label: "Urgent", icon: AlertTriangle, accent: "text-red-600", iconBg: "bg-red-500/10" },
];

export function DashboardStats({ stats, compact = false }: DashboardStatsProps & { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {statCards.map(({ key, label, icon: Icon, accent, iconBg }) => (
          <div key={key} className="flex items-center gap-2">
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconBg)}>
              <Icon className={cn("h-3.5 w-3.5", accent)} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
              <p className="text-base font-bold tabular-nums leading-tight text-[var(--foreground)]">{stats[key]}</p>
            </div>
          </div>
        ))}
        {stats.inProgress !== undefined && stats.inProgress > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <Loader2 className="h-3.5 w-3.5 text-[var(--accent)]" />
            {stats.inProgress} in progress
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {statCards.map(({ key, label, icon: Icon, accent, iconBg }) => (
        <div key={key} className="stat-card rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconBg)}>
              <Icon className={cn("h-4 w-4", accent)} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-[var(--foreground)]">{stats[key]}</p>
            </div>
          </div>
        </div>
      ))}
      {stats.inProgress !== undefined && stats.inProgress > 0 && (
        <div className="stat-card col-span-2 flex items-center gap-2 rounded-xl p-3 sm:col-span-4">
          <Loader2 className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm text-[var(--muted)]">{stats.inProgress} in progress</span>
        </div>
      )}
    </div>
  );
}

export function CompletionRing({ stats, compact = false }: DashboardStatsProps & { compact?: boolean }) {
  const radius = compact ? 24 : 32;
  const size = compact ? 48 : 64;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (stats.completionPercentage / 100) * circumference;
  const viewBox = compact ? 56 : 80;
  const center = viewBox / 2;

  if (compact) {
    return (
      <div className="flex items-center gap-2.5 border-l border-[var(--card-border)] pl-4">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${viewBox} ${viewBox}`}>
            <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-[var(--surface-hover)]" />
            <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset} className="text-[var(--accent)] transition-all duration-700" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-bold tabular-nums text-[var(--foreground)]">{stats.completionPercentage}%</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">Progress</p>
          <p className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
            {stats.completed}/{stats.total}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card flex h-full items-center gap-4 rounded-xl p-4">
      <div className="relative h-16 w-16 shrink-0">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-[var(--surface-hover)]" />
          <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset} className="text-[var(--accent)] transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold tabular-nums text-[var(--foreground)]">{stats.completionPercentage}%</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--muted)]">Progress</p>
        <p className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">
          {stats.completed} / {stats.total}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">completed</p>
      </div>
    </div>
  );
}
