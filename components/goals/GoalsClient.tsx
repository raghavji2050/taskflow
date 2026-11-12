"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, FolderKanban, Link2, Plus, Target, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { GOAL_STATUSES, GOAL_STATUS_LABEL, type GoalStatusName } from "@/lib/goals";
import { cn } from "@/lib/utils";

type GoalLinkView =
  | { id: string; kind: "project"; projectId: string; title: string; color: string; visible: boolean; done: number; total: number }
  | { id: string; kind: "task"; taskId: string; title: string; visible: boolean; completed: boolean };

interface GoalView {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  owner: { id: string; name: string } | null;
  dueDate: string | null;
  closedAt: string | null;
  progress: number;
  expectedProgress: number | null;
  status: GoalStatusName;
  statusOverride: GoalStatusName | null;
  childIds: string[];
  links: GoalLinkView[];
}

const STATUS_STYLE: Record<GoalStatusName, string> = {
  ON_TRACK: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  AT_RISK: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  OFF_TRACK: "bg-red-500/15 text-red-600 dark:text-red-400",
  ACHIEVED: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
};
const BAR_STYLE: Record<GoalStatusName, string> = {
  ON_TRACK: "bg-emerald-500",
  AT_RISK: "bg-amber-500",
  OFF_TRACK: "bg-red-500",
  ACHIEVED: "bg-indigo-500",
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function StatusChip({ status }: { status: GoalStatusName }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[status])} data-testid="goal-status">
      {GOAL_STATUS_LABEL[status]}
    </span>
  );
}

function ProgressBar({ value, status, expected }: { value: number; status: GoalStatusName; expected: number | null }) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Goal progress">
      <div className={cn("h-full rounded-full transition-all", BAR_STYLE[status])} style={{ width: `${value}%` }} />
      {expected !== null && expected < 100 && (
        <div className="absolute top-0 h-full w-0.5 bg-[var(--foreground)]/40" style={{ left: `${expected}%` }} title={`Expected by today: ${expected}%`} />
      )}
    </div>
  );
}

interface GoalFormState {
  title: string;
  description: string;
  dueDate: string;
  ownerId: string;
  parentId: string;
}

export function GoalsClient() {
  const { selectedWorkspaceId, isPersonal, members, selectedWorkspace } = useWorkspace();
  const [goals, setGoals] = useState<GoalView[]>([]);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<GoalFormState | null>(null);
  const [linking, setLinking] = useState<GoalView | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [taskQuery, setTaskQuery] = useState("");
  const [taskResults, setTaskResults] = useState<{ id: string; title: string }[]>([]);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    if (!selectedWorkspaceId || isPersonal) return;
    setLoading(true);
    const res = await fetch(`/api/goals?workspaceId=${selectedWorkspaceId}${showClosed ? "&includeClosed=true" : ""}`);
    setLoading(false);
    if (!res.ok) return;
    const data = await res.json();
    setGoals(data.goals ?? []);
    setSummary(data.summary ?? null);
    setCanEdit(Boolean(data.canEdit));
  }, [selectedWorkspaceId, isPersonal, showClosed]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedWorkspaceId || isPersonal) return;
    void fetch(`/api/workspaces/${selectedWorkspaceId}/projects`)
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => setProjects((d.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))));
  }, [selectedWorkspaceId, isPersonal]);

  useEffect(() => {
    if (!linking || taskQuery.trim().length < 2) {
      setTaskResults([]);
      return;
    }
    const t = setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(taskQuery.trim())}`)
        .then((r) => (r.ok ? r.json() : { tasks: [] }))
        .then((d) => setTaskResults((d.tasks ?? []).slice(0, 8).map((x: { id: string; title: string }) => ({ id: x.id, title: x.title }))));
    }, 250);
    return () => clearTimeout(t);
  }, [taskQuery, linking]);

  const byId = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  const roots = goals.filter((g) => !g.parentId);

  const saveGoal = async () => {
    if (!form || !selectedWorkspaceId) return;
    if (!form.title.trim()) {
      toast.error("Give the goal a title");
      return;
    }
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: selectedWorkspaceId,
        title: form.title,
        description: form.description || null,
        dueDate: form.dueDate ? `${form.dueDate}T23:59:59` : null,
        ownerId: form.ownerId || undefined,
        parentId: form.parentId || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not create goal");
      return;
    }
    toast.success(form.parentId ? "Key result added" : "Goal created");
    if (form.parentId) setExpanded((e) => ({ ...e, [form.parentId]: true }));
    setForm(null);
    await load();
  };

  const patch = async (goal: GoalView, body: Record<string, unknown>, msg?: string) => {
    const res = await fetch(`/api/goals/${goal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not update goal");
      return;
    }
    if (msg) toast.success(msg);
    await load();
  };

  const remove = async (goal: GoalView) => {
    if (!window.confirm(`Delete goal "${goal.title}"? Linked projects and tasks are not touched.`)) return;
    const res = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete goal");
      return;
    }
    toast.success("Goal deleted");
    await load();
  };

  const link = async (target: { projectId?: string; taskId?: string }) => {
    if (!linking) return;
    const res = await fetch(`/api/goals/${linking.id}/links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not link");
      return;
    }
    toast.success("Linked — progress updates automatically");
    setExpanded((e) => ({ ...e, [linking.id]: true }));
    setLinking(null);
    setTaskQuery("");
    await load();
  };

  const unlink = async (goal: GoalView, linkId: string) => {
    const res = await fetch(`/api/goals/${goal.id}/links/${linkId}`, { method: "DELETE" });
    if (res.ok) await load();
  };

  if (isPersonal || !selectedWorkspaceId) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <PageHeader title="Goals" subtitle="Set team goals and OKRs. Progress fills in by itself from linked projects and tasks." />
        <Card className="p-8 text-center">
          <Target className="mx-auto mb-3 h-10 w-10 text-indigo-500" />
          <p className="font-medium text-[var(--foreground)]">Goals live in a workspace</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Switch to (or create) a workspace from the sidebar to set goals for your team.</p>
        </Card>
      </div>
    );
  }

  const renderGoal = (g: GoalView, depth: number): React.ReactNode => {
    const open = expanded[g.id] ?? false;
    const children = g.childIds.map((id) => byId.get(id)).filter((x): x is GoalView => !!x);
    return (
      <div key={g.id} className={cn(depth > 0 && "ml-4 border-l border-[var(--card-border)] pl-3 sm:ml-6")} data-testid="goal-row">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg,var(--surface))] p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setExpanded((e) => ({ ...e, [g.id]: !open }))}
              className="mt-0.5 rounded p-0.5 text-[var(--muted)] hover:bg-[var(--surface-hover)]"
              aria-label={open ? `Collapse ${g.title}` : `Expand ${g.title}`}
              aria-expanded={open}
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={cn("font-semibold text-[var(--foreground)]", depth > 0 && "text-sm")}>{g.title}</h3>
                <StatusChip status={g.status} />
                {g.closedAt && <span className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[11px] text-[var(--muted)]">Closed</span>}
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {[g.owner?.name, g.dueDate ? `Due ${fmtDate(g.dueDate)}` : "No due date", `${g.links.length} linked`, children.length ? `${children.length} key result${children.length > 1 ? "s" : ""}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <ProgressBar value={g.progress} status={g.status} expected={g.expectedProgress} />
                <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--foreground)]" data-testid="goal-progress">{g.progress}%</span>
              </div>
            </div>
          </div>
          {open && (
            <div className="mt-3 space-y-3 pl-6">
              {g.description && <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{g.description}</p>}
              <ul className="space-y-1.5" aria-label={`Linked to ${g.title}`}>
                {g.links.length === 0 && <li className="text-xs text-[var(--muted)]">Nothing linked yet. Link a project or task and progress fills in automatically.</li>}
                {g.links.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-sm">
                    {l.kind === "project" ? <FolderKanban className="h-4 w-4 shrink-0" style={{ color: l.color }} /> : <CheckCircle2 className={cn("h-4 w-4 shrink-0", l.completed ? "text-emerald-500" : "text-[var(--muted)]")} />}
                    {l.kind === "project" && l.visible ? (
                      <Link href={`/dashboard/projects/${l.projectId}`} className="min-w-0 flex-1 truncate text-[var(--accent)] hover:underline">{l.title}</Link>
                    ) : l.kind === "task" && l.visible ? (
                      <Link href={`/dashboard?openTask=${l.taskId}`} className="min-w-0 flex-1 truncate text-[var(--accent)] hover:underline">{l.title}</Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{l.title}</span>
                    )}
                    <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                      {l.kind === "project" ? `${l.done}/${l.total} done` : l.completed ? "Done" : "Open"}
                    </span>
                    {canEdit && (
                      <button type="button" onClick={() => void unlink(g, l.id)} className="rounded p-1 text-[var(--muted)] hover:text-red-500" aria-label={`Unlink ${l.title}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setLinking(g)}>
                    <Link2 className="mr-1 h-3.5 w-3.5" /> Link project or task
                  </Button>
                  {depth < 2 && (
                    <Button size="sm" variant="secondary" onClick={() => setForm({ title: "", description: "", dueDate: g.dueDate?.slice(0, 10) ?? "", ownerId: "", parentId: g.id })}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Key result
                    </Button>
                  )}
                  <Select
                    aria-label={`Status of ${g.title}`}
                    value={g.statusOverride ?? ""}
                    onChange={(e) => void patch(g, { statusOverride: e.target.value || null }, "Status updated")}
                    className="h-8 w-auto text-xs"
                    hideLabel
                    options={[{ value: "", label: "Status: automatic" }, ...GOAL_STATUSES.map((s) => ({ value: s, label: `Status: ${GOAL_STATUS_LABEL[s]}` }))]}
                  />
                  <Button size="sm" variant="ghost" onClick={() => void patch(g, { closed: !g.closedAt }, g.closedAt ? "Goal reopened" : "Goal closed")}>
                    {g.closedAt ? "Reopen" : "Close goal"}
                  </Button>
                  <button type="button" onClick={() => void remove(g)} className="rounded p-1.5 text-[var(--muted)] hover:text-red-500" aria-label={`Delete ${g.title}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {children.length > 0 && <div className="mt-2 space-y-2">{children.map((c) => renderGoal(c, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Goals"
        subtitle={`${selectedWorkspace?.name ?? "Workspace"} goals and OKRs. Progress fills in by itself from linked projects, tasks and key results.`}
        actions={
          canEdit ? (
            <Button onClick={() => setForm({ title: "", description: "", dueDate: "", ownerId: "", parentId: "" })}>
              <Plus className="mr-1 h-4 w-4" /> New goal
            </Button>
          ) : undefined
        }
      />
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Goal summary">
          {GOAL_STATUSES.map((s) => (
            <Card key={s} className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{GOAL_STATUS_LABEL[s]}</p>
              <p className="text-xl font-semibold tabular-nums text-[var(--foreground)]">{summary[s] ?? 0}</p>
            </Card>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed goals
      </label>
      {loading && goals.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Loading goals…</p>
      ) : roots.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={Target}
            title="No goals yet"
            description={<>Example: &quot;Launch the new website by 31 Dec&quot; — then link the website project and its progress shows here.</>}
            action={canEdit ? <Button size="sm" variant="secondary" onClick={() => setForm({ title: "", description: "", dueDate: "", ownerId: "", parentId: "" })}><Plus className="h-4 w-4" />Create your first goal</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-3">{roots.map((g) => renderGoal(g, 0))}</div>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.parentId ? "New key result" : "New goal"} size="md">
        {form && (
          <div className="space-y-3">
            <Input id="goal-title" label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. 100 paying customers" autoFocus />
            <Input id="goal-description" label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Why it matters (optional)" />
            <Input id="goal-due" label="Due date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <Select id="goal-owner" label="Owner" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} options={[{ value: "", label: "Me" }, ...members.map((m) => ({ value: m.user.id, label: m.user.name }))]} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button onClick={() => void saveGoal()}>{form.parentId ? "Add key result" : "Create goal"}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!linking} onClose={() => setLinking(null)} title="Link to goal" description={linking?.title} size="md">
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Project (counts done / total tasks)</p>
            <div className="flex flex-wrap gap-1.5">
              {projects.length === 0 && <span className="text-xs text-[var(--muted)]">No projects in this workspace.</span>}
              {projects.map((p) => (
                <button key={p.id} type="button" onClick={() => void link({ projectId: p.id })} className="rounded-full border border-[var(--card-border)] px-2.5 py-1 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)]">
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Input id="goal-task-search" label="Task" value={taskQuery} onChange={(e) => setTaskQuery(e.target.value)} placeholder="Search tasks to link…" />
            <ul className="mt-2 space-y-1">
              {taskResults.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => void link({ taskId: t.id })} className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-[var(--surface-hover)]">
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Modal>
    </div>
  );
}
