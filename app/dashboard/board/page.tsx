"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { KanbanBoard } from "@/components/KanbanBoard";
import { TaskEditModal } from "@/components/TaskEditModal";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";

export default function BoardPage() {
  const router = useRouter();
  const { status } = useSession();
  const { selectedWorkspaceId, selectedWorkspace, isPersonal, members } = useWorkspace();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTasks = useCallback(async (wsId: string | null) => {
    const params = new URLSearchParams({ limit: "100", archived: "false" });
    if (wsId) params.set("workspaceId", wsId);
    const res = await fetch(`/api/tasks?${params.toString()}`);
    const data = await res.json();
    if (res.ok) setTasks(data.tasks);
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchTasks(selectedWorkspaceId);
  }, [status, selectedWorkspaceId, fetchTasks]);

  useRealtimeSync({
    workspaceId: selectedWorkspaceId,
    onRefresh: () => fetchTasks(selectedWorkspaceId),
  });

  useEffect(() => { if (status === "unauthenticated") router.push("/login"); }, [status, router]);
  if (status === "loading") return null;

  const withWorkspace = (data: TaskInput): TaskInput => ({
    ...data,
    workspaceId: selectedWorkspaceId,
  });

  const toTaskInput = (task: Task, status?: Task["status"]): TaskInput => ({
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: status ?? task.status,
    dueDate: task.dueDate,
    categoryId: task.categoryId ?? null,
    assigneeId: task.assigneeId ?? null,
    recurrenceRule: (task.recurrenceRule ?? null) as TaskInput["recurrenceRule"],
  });

  const handleStatusChange = async (taskId: string, newStatus: Task["status"]) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withWorkspace(toTaskInput(task, newStatus))),
    });
    if (res.ok) { toast.success("Status updated"); fetchTasks(selectedWorkspaceId); }
  };

  const handleSubmit = async (data: TaskInput) => {
    setIsSubmitting(true);
    const url = editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks";
    const res = await fetch(url, {
      method: editingTask ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withWorkspace(data)),
    });
    if (res.ok) {
      setIsFormOpen(false);
      setEditingTask(null);
      fetchTasks(selectedWorkspaceId);
    }
    setIsSubmitting(false);
  };

  const pageTitle = isPersonal ? "Board" : `${selectedWorkspace?.name} Board`;
  const pageSubtitle = isPersonal ? "Drag tasks across columns" : "Team kanban view";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        className="mb-6"
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={
          <Button onClick={() => { setEditingTask(null); setIsFormOpen(true); }}>
            <Plus className="h-4 w-4" />New Task
          </Button>
        }
      />
      <KanbanBoard
        tasks={tasks}
        onStatusChange={handleStatusChange}
        onEdit={(t) => { setEditingTask(t); setIsFormOpen(true); }}
      />
      <TaskEditModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
        title={editingTask ? "Edit Task" : "New Task"}
        editingTask={editingTask}
        workspaceId={selectedWorkspaceId ?? undefined}
        members={!isPersonal ? members.map((m) => m.user) : undefined}
        lockWorkspace={!isPersonal}
        isPersonal={isPersonal}
        workspaceName={selectedWorkspace?.name}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
