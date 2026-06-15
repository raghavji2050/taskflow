"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertTriangle, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { TaskCard, type Task } from "@/components/TaskCard";
import { Card } from "@/components/ui/Card";
import { TaskEditModal } from "@/components/TaskEditModal";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import type { TaskInput } from "@/lib/validations";
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
  const [counts, setCounts] = useState({ total: 0, overdue: 0, inProgress: 0, pending: 0 });
  const [editingTask, setEditingTask] = useState<MyWorkTask | null>(null);
  const [deletingTask, setDeletingTask] = useState<MyWorkTask | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

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

  const membersForTask = (task: MyWorkTask | null) => {
    if (!task?.workspaceId) return undefined;
    const ws = workspaces.find((w) => w.id === task.workspaceId);
    return ws?.members.map((m) => m.user);
  };

  const handleSubmit = async (formData: TaskInput) => {
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
      toast.success("Task deleted");
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
    if (res.ok) await load();
    else toast.error((await res.json()).error ?? "Could not update status");
    setUpdatingTaskId(null);
  };

  const renderTaskCard = (task: MyWorkTask) => (
    <TaskCard
      key={task.id}
      task={task}
      showMeta
      showWorkspace
      readOnly={!canEditTask(task)}
      onEdit={(t) => { setEditingTask(t); setIsFormOpen(true); }}
      onDelete={setDeletingTask}
      onArchive={handleArchive}
      onToggleStatus={handleToggleStatus}
      isUpdating={updatingTaskId === task.id}
    />
  );

  const workspaceGroups = useMemo(() => Object.entries(byWorkspace), [byWorkspace]);

  if (status === "loading") return null;

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

      {overdue.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-600">
            <AlertTriangle className="h-4 w-4" /> Overdue ({overdue.length})
          </h2>
          <div className="space-y-2">{overdue.map(renderTaskCard)}</div>
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
            {workspaceGroups.map(([name, tasks]) => (
              <div key={name}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{name}</h3>
                <div className="space-y-2">{tasks.map(renderTaskCard)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <TaskEditModal
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
