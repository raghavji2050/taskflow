"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertTriangle, Briefcase, Sparkles } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { TaskCard, type Task } from "@/components/TaskCard";
import { Card } from "@/components/ui/Card";
import { TaskEditModal } from "@/components/TaskEditModal";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import { useActiveTimer } from "@/lib/useActiveTimer";
import { useOpenTaskListener } from "@/lib/open-task-event";
import { useTasksRefreshListener } from "@/lib/tasks-refresh-event";
import type { TaskInput } from "@/lib/validations";
import type { TaskFormSubmitOptions } from "@/lib/client-task-submit";
import { toTaskInput } from "@/lib/task-ui";

type MyWorkTask = Task & { canEdit?: boolean };

interface WorkspaceMember {
  user: { id: string; name: string; email: string };
}

export default function MyWorkPage() {
  const router = useRouter();
  const { status } = useSession();
  const [assigned, setAssigned] = useState<MyWorkTask[]>([]);
  const [overdue, setOverdue] = useState<MyWorkTask[]>([]);
  const [byWorkspace, setByWorkspace] = useState<Record<string, MyWorkTask[]>>({});
  const [workspaces, setWorkspaces] = useState<{ id: string; members: WorkspaceMember[] }[]>([]);
  const [counts, setCounts] = useState({ total: 0, overdue: 0, inProgress: 0, pending: 0, ready: 0 });
  const [readyOnly, setReadyOnly] = useState(false);
  const [editingTask, setEditingTask] = useState<MyWorkTask | null>(null);
  const [deletingTask, setDeletingTask] = useState<MyWorkTask | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const { entry: activeTimer, elapsed: activeTimerElapsed, refresh: refreshActiveTimer } = useActiveTimer();

  const load = useCallback(async () => {
    const [workRes, wsRes] = await Promise.all([
      fetch("/api/tasks/my-work"),
      fetch("/api/workspaces"),
    ]);
    const data = await workRes.json();
    if (workRes.ok) {
      setAssigned(data.assigned);
      setOverdue(data.overdue);
      setByWorkspace(data.byWorkspace ?? {});
      setCounts(data.counts);
    }
    if (wsRes.ok) {
      const wsData = await wsRes.json();
      setWorkspaces(wsData.workspaces ?? []);
    }
  }, []);

  const handleTimerRefresh = useCallback(() => {
    void refreshActiveTimer();
    void load();
  }, [refreshActiveTimer, load]);

  useEffect(() => {
    if (status === "authenticated") void load();
    if (status === "unauthenticated") router.push("/login");
  }, [status, router, load]);

  useRealtimeSync({
    workspaceId: null,
    onRefresh: load,
    refreshOnAnyTaskEvent: true,
    notifyOnRemote: false,
  });

  const canEditTask = (task: MyWorkTask) => task.canEdit !== false;

  const isReadyTask = (task: MyWorkTask) =>
    task.status !== "COMPLETED" && (task.openBlockerCount ?? 0) === 0;

  const filterReady = <T extends MyWorkTask>(tasks: T[]) =>
    readyOnly ? tasks.filter(isReadyTask) : tasks;


  const membersForTask = (task: MyWorkTask | null) => {
    if (!task?.workspaceId) return undefined;
    const ws = workspaces.find((w) => w.id === task.workspaceId);
    return ws?.members.map((m) => m.user);
  };

  const handleSubmit = async (formData: TaskInput, _options?: TaskFormSubmitOptions) => {
    if (!editingTask || !canEditTask(editingTask)) return;
    setIsSubmitting(true);
    const res = await fetch(`/api/tasks/${editingTask.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formData, workspaceId: editingTask.workspaceId }),
    });
    if (res.ok) {
      toast.success("Task updated");
      setIsFormOpen(false);
      setEditingTask(null);
      await load();
    } else {
      toast.error((await res.json()).error ?? "Could not update task");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deletingTask || !canEditTask(deletingTask)) return;
    setIsDeleting(true);
    const res = await fetch(`/api/tasks/${deletingTask.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Moved to Trash");
      setDeletingTask(null);
      await load();
    } else {
      toast.error((await res.json()).error ?? "Could not delete task");
    }
    setIsDeleting(false);
  };

  const handleArchive = async (task: MyWorkTask) => {
    if (!canEditTask(task)) return;
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !task.archived }),
    });
    if (res.ok) {
      toast.success(task.archived ? "Task restored" : "Task archived");
      await load();
    }
  };

  const handleToggleStatus = async (task: MyWorkTask) => {
    if (!canEditTask(task)) return;
    const nextStatus =
      task.status === "PENDING" ? "IN_PROGRESS" : task.status === "IN_PROGRESS" ? "COMPLETED" : "PENDING";
    setUpdatingTaskId(task.id);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...toTaskInput(task, { status: nextStatus }), workspaceId: task.workspaceId }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.warning?.message) toast.warning(data.warning.message);
      await load();
    } else toast.error((await res.json()).error ?? "Could not update status");
    setUpdatingTaskId(null);
  };

  const renderTaskCard = (task: MyWorkTask) => (
    <TaskCard
      key={task.id}
      task={task}
      showMeta
      showWorkspace
      readOnly={!canEditTask(task)}
      showTimeControls={canEditTask(task)}
      activeTimer={activeTimer}
      activeTimerElapsed={activeTimerElapsed}
      onTimerRefresh={handleTimerRefresh}
      onEdit={(t) => { setEditingTask(t); setIsFormOpen(true); }}
      onDelete={setDeletingTask}
      onArchive={handleArchive}
      onToggleStatus={handleToggleStatus}
      isUpdating={updatingTaskId === task.id}
    />
  );

  const allTasks = useMemo(
    () => [...assigned, ...overdue, ...Object.values(byWorkspace).flat()],
    [assigned, overdue, byWorkspace]
  );

  const openTaskById = useCallback(async (taskId: string) => {
    const cached = allTasks.find((t) => t.id === taskId);
    if (cached) {
      setEditingTask(cached);
      setIsFormOpen(true);
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load task");
      setEditingTask(data.task);
      setIsFormOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open task");
    }
  }, [allTasks]);

  useOpenTaskListener((taskId) => { void openTaskById(taskId); });

  useTasksRefreshListener(() => { void load(); });

  const workspaceGroups = useMemo(() => Object.entries(byWorkspace), [byWorkspace]);

  if (status === "loading") return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your workload"
        title="My Work"
        subtitle={`${counts.total} assigned tasks across all workspaces`}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-zinc-500">Total</p><p className="text-2xl font-bold">{counts.total}</p></Card>
        <Card className="p-4"><p className="text-xs text-zinc-500">In progress</p><p className="text-2xl font-bold text-violet-500">{counts.inProgress}</p></Card>
        <Card className="p-4"><p className="text-xs text-zinc-500">Pending</p><p className="text-2xl font-bold text-sky-500">{counts.pending}</p></Card>
        <Card className="p-4"><p className="text-xs text-zinc-500">Overdue</p><p className="text-2xl font-bold text-red-500">{counts.overdue}</p></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="ready-to-start-filter"
          aria-pressed={readyOnly}
          onClick={() => setReadyOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            readyOnly
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ready to start
          <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums dark:bg-white/10">
            {counts.ready}
          </span>
        </button>
      </div>

      {filterReady(overdue).length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-600">
            <AlertTriangle className="h-4 w-4" /> Overdue ({filterReady(overdue).length})
          </h2>
          <div className="space-y-2">{filterReady(overdue).map(renderTaskCard)}</div>
        </section>
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Briefcase className="h-4 w-4 text-indigo-500" /> By workspace
        </h2>
        {workspaceGroups.length === 0 ? (
          <p className="text-sm text-zinc-500">No tasks assigned to you yet.</p>
        ) : (
          <div className="space-y-6">
            {workspaceGroups.map(([name, tasks]) => {
              const visible = filterReady(tasks);
              if (visible.length === 0) return null;
              return (
              <div key={name}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{name}</h3>
                <div className="space-y-2">{visible.map(renderTaskCard)}</div>
              </div>
              );
            })}
            {readyOnly && workspaceGroups.every(([, tasks]) => filterReady(tasks).length === 0) && (
              <p className="text-sm text-zinc-500">No ready-to-start tasks right now.</p>
            )}
          </div>
        )}
      </section>

      <TaskEditModal
        onSaved={() => { void load(); }}
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
        title={editingTask && !canEditTask(editingTask) ? "View Task" : "Edit Task"}
        editingTask={editingTask}
        workspaceId={editingTask?.workspaceId ?? undefined}
        members={membersForTask(editingTask)}
        lockWorkspace={!!editingTask?.workspaceId}
        isPersonal={!editingTask?.workspaceId}
        readOnly={editingTask ? !canEditTask(editingTask) : false}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      <DeleteConfirmModal
        task={deletingTask}
        isOpen={!!deletingTask}
        onClose={() => setDeletingTask(null)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
