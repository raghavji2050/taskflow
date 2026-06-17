"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { formatDurationShort, formatDurationHms, formatLoggedVsEstimated, isOverEstimate } from "@/lib/time-format";
import { cn } from "@/lib/utils";

type RangePreset = "today" | "week" | "month" | "all";

interface ReportData {
  byUser: { userId: string; name: string; today: number; week: number; month: number; total: number }[];
  byTask: {
    taskId: string;
    title: string;
    total: number;
    allTimeTotal: number;
    estimatedMinutes: number | null;
  }[];
  byTag?: { labelId: string; name: string; total: number }[];
  trendDaily: { date: string; hours: number }[];
  trendWeekly: { date: string; hours: number }[];
  totalSeconds: number;
}

interface TaskOption {
  id: string;
  title: string;
}

interface TaskLogEntry {
  id: string;
  startTime: string;
  duration: number;
  description: string | null;
  user?: { id: string; name: string };
}

interface TaskLogsState {
  loading: boolean;
  entries: TaskLogEntry[];
  error?: string;
}

export function TimeReportsClient() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { selectedWorkspaceId, isPersonal, members } = useWorkspace();
  const [range, setRange] = useState<RangePreset>("month");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterTaskId, setFilterTaskId] = useState("");
  const [taskOptions, setTaskOptions] = useState<TaskOption[]>([]);
  const [chartMode, setChartMode] = useState<"daily" | "weekly">("daily");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
  const [taskLogs, setTaskLogs] = useState<Record<string, TaskLogsState>>({});

  useEffect(() => {
    setExpandedTaskIds(new Set());
    setTaskLogs({});
  }, [selectedWorkspaceId, isPersonal, range, filterUserId, filterTaskId]);

  useEffect(() => {
    setFilterUserId("");
    setFilterTaskId("");
  }, [selectedWorkspaceId, isPersonal]);

  useEffect(() => {
    async function loadTasks() {
      const params = new URLSearchParams({ limit: "100" });
      if (!isPersonal && selectedWorkspaceId) {
        params.set("workspaceId", selectedWorkspaceId);
      }
      const res = await fetch(`/api/tasks?${params}`);
      const data = await res.json();
      if (res.ok) {
        setTaskOptions(
          (data.tasks ?? []).map((t: TaskOption) => ({ id: t.id, title: t.title }))
        );
      }
    }
    if (isPersonal || selectedWorkspaceId) void loadTasks();
  }, [isPersonal, selectedWorkspaceId]);

  const load = useCallback(async () => {
    if (isPersonal) {
      if (!userId) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          includeReport: "true",
          personal: "true",
          range,
          limit: "1",
        });
        if (filterTaskId) params.set("taskId", filterTaskId);
        const res = await fetch(`/api/time/user/${userId}?${params}`);
        const data = await res.json();
        if (res.ok) setReport(data.report ?? null);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!selectedWorkspaceId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        includeReport: "true",
        range,
        limit: "1",
      });
      if (filterUserId) params.set("userId", filterUserId);
      if (filterTaskId) params.set("taskId", filterTaskId);
      const res = await fetch(`/api/time/workspace/${selectedWorkspaceId}?${params}`);
      const data = await res.json();
      if (res.ok) setReport(data.report ?? null);
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspaceId, isPersonal, userId, range, filterUserId, filterTaskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTaskLogs = useCallback(
    async (taskId: string) => {
      setTaskLogs((prev) => ({
        ...prev,
        [taskId]: { loading: true, entries: prev[taskId]?.entries ?? [] },
      }));
      try {
        const params = new URLSearchParams({
          range,
          limit: "50",
          page: "1",
        });
        if (!isPersonal && filterUserId) params.set("userId", filterUserId);
        const res = await fetch(`/api/time/task/${taskId}?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load logs");
        setTaskLogs((prev) => ({
          ...prev,
          [taskId]: { loading: false, entries: data.entries ?? [] },
        }));
      } catch (err) {
        setTaskLogs((prev) => ({
          ...prev,
          [taskId]: {
            loading: false,
            entries: [],
            error: err instanceof Error ? err.message : "Failed to load logs",
          },
        }));
      }
    },
    [range, filterUserId, isPersonal]
  );

  const toggleTaskExpanded = useCallback(
    (taskId: string) => {
      setExpandedTaskIds((prev) => {
        const next = new Set(prev);
        if (next.has(taskId)) {
          next.delete(taskId);
        } else {
          next.add(taskId);
          void loadTaskLogs(taskId);
        }
        return next;
      });
    },
    [loadTaskLogs]
  );

  if (isPersonal && !userId) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  if (!isPersonal && !selectedWorkspaceId) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--card-border)] p-10 text-center">
        <p className="text-sm text-[var(--muted)]">Select a workspace to view team time reports.</p>
      </div>
    );
  }

  const trend = chartMode === "daily" ? report?.trendDaily ?? [] : report?.trendWeekly ?? [];

  const userOptions = [
    { value: "", label: "All users" },
    ...members.map((m) => ({ value: m.user.id, label: m.user.name })),
  ];

  const taskSelectOptions = [
    { value: "", label: "All tasks" },
    ...taskOptions.map((t) => ({ value: t.id, label: t.title })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time Reports"
        subtitle={
          isPersonal
            ? "Track your personal task hours."
            : "Track hours across your team and tasks."
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {(["today", "week", "month", "all"] as RangePreset[]).map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={range === r ? "primary" : "secondary"}
              onClick={() => setRange(r)}
            >
              {r === "all" ? "All time" : r.charAt(0).toUpperCase() + r.slice(1)}
            </Button>
          ))}
        </div>
        {!isPersonal && (
          <Select
            hideLabel
            aria-label="Filter by user"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            options={userOptions}
            className="h-9 min-w-[140px] w-auto"
          />
        )}
        <Select
          hideLabel
          aria-label="Filter by task"
          value={filterTaskId}
          onChange={(e) => setFilterTaskId(e.target.value)}
          options={taskSelectOptions}
          className="h-9 min-w-[160px] max-w-[220px] w-auto"
        />
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading report…</p>
      ) : (
        <>
          <Card className="p-4">
            <p className="text-sm text-[var(--muted)]">Total tracked</p>
            <p className="text-2xl font-semibold text-[var(--foreground)]">
              {formatDurationShort(report?.totalSeconds ?? 0)}
            </p>
          </Card>

          <div className={cn("grid gap-4", isPersonal ? "lg:grid-cols-1" : "lg:grid-cols-2")}>
            {!isPersonal && (
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Hours by user</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-[var(--muted)]">
                      <tr>
                        <th className="pb-2 pr-3">User</th>
                        <th className="pb-2 pr-3">Today</th>
                        <th className="pb-2 pr-3">Week</th>
                        <th className="pb-2 pr-3">Month</th>
                        <th className="pb-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report?.byUser ?? []).map((row) => (
                        <tr key={row.userId} className="border-t border-[var(--card-border)]">
                          <td className="py-2 pr-3">{row.name}</td>
                          <td className="py-2 pr-3">{formatDurationShort(row.today)}</td>
                          <td className="py-2 pr-3">{formatDurationShort(row.week)}</td>
                          <td className="py-2 pr-3">{formatDurationShort(row.month)}</td>
                          <td className="py-2 font-medium">{formatDurationShort(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Hours by task</h2>
              <div className="max-h-96 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--card)] text-xs text-[var(--muted)]">
                    <tr>
                      <th className="pb-2 pr-3">Task</th>
                      <th className="pb-2 text-right">Logged / Est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report?.byTask ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={2} className="py-4 text-center text-[var(--muted)]">
                          No time logged for this period.
                        </td>
                      </tr>
                    ) : (
                      (report?.byTask ?? []).map((row) => {
                        const expanded = expandedTaskIds.has(row.taskId);
                        const logs = taskLogs[row.taskId];
                        const hasEstimate = row.estimatedMinutes != null && row.estimatedMinutes > 0;
                        const overBudget = hasEstimate && isOverEstimate(row.allTimeTotal, row.estimatedMinutes);
                        return (
                          <Fragment key={row.taskId}>
                            <tr
                              className="cursor-pointer border-t border-[var(--card-border)] hover:bg-[var(--surface-hover)]"
                              onClick={() => toggleTaskExpanded(row.taskId)}
                            >
                              <td className="py-2 pr-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  {expanded ? (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                                  )}
                                  <span className="truncate font-medium text-[var(--foreground)]">
                                    {row.title}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                <p
                                  className={cn(
                                    "font-medium",
                                    overBudget && "text-amber-600 dark:text-amber-400"
                                  )}
                                >
                                  {hasEstimate
                                    ? formatLoggedVsEstimated(row.allTimeTotal, row.estimatedMinutes)
                                    : formatDurationShort(row.total)}
                                </p>
                                {hasEstimate && (
                                  <p className="text-[10px] text-[var(--muted)]">
                                    This period: {formatDurationShort(row.total)}
                                  </p>
                                )}
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="border-t border-[var(--card-border)] bg-[var(--surface-hover)]/50">
                                <td colSpan={2} className="px-3 py-3">
                                  {logs?.loading ? (
                                    <p className="text-xs text-[var(--muted)]">Loading logs…</p>
                                  ) : logs?.error ? (
                                    <p className="text-xs text-red-500">{logs.error}</p>
                                  ) : (logs?.entries.length ?? 0) === 0 ? (
                                    <p className="text-xs text-[var(--muted)]">No entries for this period.</p>
                                  ) : (
                                    <div className="overflow-x-auto rounded-lg border border-[var(--card-border)] bg-[var(--card)]">
                                      <table className="w-full min-w-[280px] text-left text-xs">
                                        <thead className="text-[var(--muted)]">
                                          <tr>
                                            <th className="px-3 py-2 font-medium">Date</th>
                                            {!isPersonal && (
                                              <th className="px-3 py-2 font-medium">User</th>
                                            )}
                                            <th className="px-3 py-2 font-medium">Note</th>
                                            <th className="px-3 py-2 text-right font-medium">Duration</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {logs.entries.map((entry) => (
                                            <tr
                                              key={entry.id}
                                              className="border-t border-[var(--card-border)]"
                                            >
                                              <td className="whitespace-nowrap px-3 py-2 text-[var(--foreground)]">
                                                {format(new Date(entry.startTime), "MMM d, yyyy · h:mm a")}
                                              </td>
                                              {!isPersonal && (
                                                <td className="px-3 py-2 text-[var(--muted)]">
                                                  {entry.user?.name ?? "—"}
                                                </td>
                                              )}
                                              <td className="max-w-[220px] px-3 py-2 text-[var(--foreground)]">
                                                {entry.description?.trim() ? (
                                                  <span className="whitespace-pre-wrap break-words">
                                                    {entry.description}
                                                  </span>
                                                ) : (
                                                  <span className="text-[var(--muted)]">—</span>
                                                )}
                                              </td>
                                              <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">
                                                {formatDurationHms(entry.duration)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {(report?.byTag ?? []).length > 0 && (
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Hours by activity tag</h2>
                <div className="space-y-2">
                  {(report?.byTag ?? []).map((row) => (
                    <div
                      key={row.labelId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-medium text-[var(--foreground)]">{row.name}</span>
                      <span className="font-mono tabular-nums text-[var(--muted)]">
                        {formatDurationShort(row.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Productivity trends</h2>
              <div className="flex gap-1 rounded-lg border border-[var(--card-border)] p-0.5">
                {(["daily", "weekly"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChartMode(mode)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium capitalize",
                      chartMode === mode
                        ? "bg-[var(--accent)] text-white"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-64 w-full">
              {trend.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No data for this period.</p>
              ) : chartMode === "daily" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="hours" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="hours" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
