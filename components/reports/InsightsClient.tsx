"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import type { Insights } from "@/lib/insights";

type InsightsResponse = Insights & { scope: "personal" | "workspace" | "project"; truncated: boolean };

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  COMPLETED: "#22c55e",
};

function weekLabel(key: string) {
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

function Stat({ label, value, tone, testId }: { label: string; value: number | string; tone?: "danger" | "good"; testId: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p
        data-testid={testId}
        className={
          "mt-1 text-2xl font-semibold " +
          (tone === "danger" ? "text-red-500" : tone === "good" ? "text-green-600" : "text-[var(--foreground)]")
        }
      >
        {value}
      </p>
    </Card>
  );
}

function ChartCard({ title, children, testId, empty }: { title: string; children: React.ReactNode; testId: string; empty?: boolean }) {
  return (
    <Card className="p-4" >
      <div data-testid={testId}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h2>
        {empty ? <p className="py-12 text-center text-sm text-[var(--muted)]">Nothing to show yet.</p> : <div className="h-64">{children}</div>}
      </div>
    </Card>
  );
}

export function InsightsClient() {
  const { selectedWorkspaceId, isPersonal } = useWorkspace();
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProjectId("");
    setProjects([]);
    if (isPersonal || !selectedWorkspaceId) return;
    let cancelled = false;
    void fetch(`/api/workspaces/${selectedWorkspaceId}/projects`)
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => {
        if (!cancelled) setProjects((d.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWorkspaceId, isPersonal]);

  const load = useCallback(async () => {
    if (!isPersonal && !selectedWorkspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ tzOffset: String(new Date().getTimezoneOffset()), weeks: "8" });
      if (!isPersonal && selectedWorkspaceId) params.set("workspaceId", selectedWorkspaceId);
      if (projectId) params.set("projectId", projectId);
      const res = await fetch(`/api/insights?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load insights");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load insights");
    } finally {
      setLoading(false);
    }
  }, [isPersonal, selectedWorkspaceId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isPersonal && !selectedWorkspaceId) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--card-border)] p-10 text-center">
        <p className="text-sm text-[var(--muted)]">Select a workspace to view insights.</p>
      </div>
    );
  }

  const t = data?.totals;
  const weekly = (data?.completedPerWeek ?? []).map((w) => ({ ...w, label: weekLabel(w.weekStart) }));
  const statusData = (data?.byStatus ?? []).filter((s) => s.count > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        subtitle={
          isPersonal
            ? "How your personal tasks are moving."
            : projectId
              ? "Status, workload and throughput for this project."
              : "Status, workload and throughput across the workspace."
        }
        actions={
          !isPersonal && projects.length > 0 ? (
            <div className="w-56">
              <Select
                id="insights-project"
                label="Project"
                hideLabel
                aria-label="Project"
                data-testid="insights-project-filter"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
          ) : null
        }
      />

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && !data && <p className="text-sm text-[var(--muted)]">Loading…</p>}

      {t && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" data-testid="insights-totals">
            <Stat label="Open" value={t.open} testId="insights-open" />
            <Stat label="In progress" value={t.inProgress} testId="insights-in-progress" />
            <Stat label="Overdue" value={t.overdue} tone={t.overdue > 0 ? "danger" : undefined} testId="insights-overdue" />
            <Stat label="Due this week" value={t.dueThisWeek} testId="insights-due-week" />
            <Stat label="Done this week" value={t.completedThisWeek} tone="good" testId="insights-done-week" />
            <Stat label="Completion" value={`${t.completionRate}%`} testId="insights-completion" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Tasks by status" testId="insights-status-chart" empty={statusData.length === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="count" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2} label>
                    {statusData.map((s) => (
                      <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#a855f7"} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Completed vs created per week" testId="insights-weekly-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="created" name="Created" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {data.scope !== "personal" && (
              <ChartCard title="Open and overdue by assignee" testId="insights-assignee-chart" empty={data.byAssignee.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byAssignee} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="open" name="Open" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="overdue" name="Overdue" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {data.scope === "workspace" && (
              <ChartCard title="Projects at a glance" testId="insights-project-chart" empty={data.byProject.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byProject}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="open" name="Open" stackId="p" fill="#3b82f6" />
                    <Bar dataKey="completed" name="Done" stackId="p" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {t.unassignedOpen > 0 && data.scope !== "personal" && (
            <p className="text-sm text-[var(--muted)]" data-testid="insights-unassigned">
              {t.unassignedOpen} open {t.unassignedOpen === 1 ? "task has" : "tasks have"} no assignee.{" "}
              <Link href="/dashboard" className="text-[var(--accent)] underline">
                Open the list
              </Link>
            </p>
          )}
          {data.truncated && <p className="text-xs text-[var(--muted)]">Showing the latest 5,000 tasks.</p>}
        </>
      )}
    </div>
  );
}
