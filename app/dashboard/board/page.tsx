"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { KanbanBoard } from "@/components/KanbanBoard";
import { BoardListsPanel, type BoardColumn } from "@/components/BoardListsPanel";
import { TaskEditModal } from "@/components/TaskEditModal";
import { TaskViewFilters } from "@/components/TaskViewFilters";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";
import { toTaskInput } from "@/lib/task-ui";
import {
  buildTaskQueryParams,
  applyClientTaskFilters,
  defaultTaskViewFilters,
  type TaskViewFiltersState,
} from "@/lib/task-view-filters";
import { useOpenTaskListener } from "@/lib/open-task-event";
import { dispatchTasksRefresh } from "@/lib/tasks-refresh-event";
import { saveTaskWithOptionalTimer } from "@/lib/client-task-submit";
import type { TaskFormSubmitOptions } from "@/lib/client-task-submit";
import { PageLoader } from "@/components/ui/PageLoader";
import { useActiveTimer } from "@/lib/useActiveTimer";

export default function BoardPage() {
  const router = useRouter();
  const { status } = useSession();
  const { selectedWorkspaceId, selectedWorkspace, isPersonal, members, canEditTasks } = useWorkspace();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [filters, setFilters] = useState<TaskViewFiltersState>(defaultTaskViewFilters);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listsKey, setListsKey] = useState(0);
  const { entry: activeTimer, elapsed: activeTimerElapsed, refresh: onTimerRefresh } = useActiveTimer();

  const fetchColumns = useCallback(async (wsId: string | null) => {
    const params = new URLSearchParams();
    if (wsId) params.set("workspaceId", wsId);
    const res = await fetch(`/api/board-columns?${params}`);
    const data = await res.json();
    if (res.ok) setColumns(data.columns ?? []);
  }, []);

  const fetchTasks = useCallback(async (wsId: string | null, currentFilters: TaskViewFiltersState) => {
    const params = buildTaskQueryParams(wsId, currentFilters);
    const res = await fetch(`/api/tasks?${params.toString()}`);
    const data = await res.json();
    if (res.ok) setTasks(data.tasks);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      fetchTasks(selectedWorkspaceId, filters),
      fetchColumns(selectedWorkspaceId),
    ]);
  }, [selectedWorkspaceId, filters, fetchTasks, fetchColumns]);

  useEffect(() => {
    if (status === "authenticated") void refresh();
  }, [status, selectedWorkspaceId, filters, listsKey, refresh]);

  useRealtimeSync({
    workspaceId: selectedWorkspaceId,
    onRefresh: refresh,
  });

  const filteredTasks = useMemo(
    () => applyClientTaskFilters(tasks, filters),
    [tasks, filters]
  );

  useEffect(() => { if (status === "unauthenticated") router.push("/login"); }, [status, router]);

  const openTaskById = useCallback(async (taskId: string) => {
    const cached = tasks.find((t) => t.id === taskId);
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
  }, [tasks]);

  useOpenTaskListener((taskId) => { void openTaskById(taskId); });

  if (status === "loading") return <PageLoader />;

  const withWorkspace = (data: TaskInput): TaskInput => ({
    ...data,
    workspaceId: selectedWorkspaceId,
  });

  const handleColumnChange = async (taskId: string, columnId: string) => {
    if (!canEditTasks) return;
    const task = tasks.find((t) => t.id === taskId);
    const column = columns.find((c) => c.id === columnId);
    if (!task || !column) return;

    const overrides: Partial<TaskInput> = { boardColumnId: columnId };
    if (column.status) overrides.status = column.status;

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withWorkspace(toTaskInput(task, overrides))),
    });
    if (res.ok) {
      toast.success(`Moved to ${column.name}`);
      void refresh();
    }
  };

  const handleSubmit = async (data: TaskInput, options?: TaskFormSubmitOptions) => {
    if (!canEditTasks) return;
    setIsSubmitting(true);
    try {
      await saveTaskWithOptionalTimer(withWorkspace(data), editingTask?.id ?? null, options);
      if (!editingTask && options?.startTimer) {
        dispatchTasksRefresh();
        toast.success("Task created and timer started");
      }
      setIsFormOpen(false);
      setEditingTask(null);
      void refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const pageTitle = isPersonal ? "Board" : `${selectedWorkspace?.name} Board`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle}
        subtitle="Drag tasks between lists — click Lists to manage columns"
        actions={canEditTasks ? (
          <Button onClick={() => { setEditingTask(null); setIsFormOpen(true); }}>
            <Plus className="h-4 w-4" />New Task
          </Button>
        ) : undefined}
      />

      <BoardListsPanel
        workspaceId={selectedWorkspaceId}
        readOnly={!canEditTasks}
        variant="inline"
        onChange={() => setListsKey((k) => k + 1)}
      />

      <TaskViewFilters
        filters={filters}
        onChange={setFilters}
        taskCount={filteredTasks.length}
        showAssigneeFilter={!isPersonal}
      />

      {columns.length > 0 ? (
        <KanbanBoard
          tasks={filteredTasks}
          columns={columns}
          onColumnChange={handleColumnChange}
          onEdit={(t) => { setEditingTask(t); setIsFormOpen(true); }}
          readOnly={!canEditTasks}
          activeEntry={activeTimer}
          activeTimerElapsed={activeTimerElapsed}
          onTimerRefresh={onTimerRefresh}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--card-border)] py-16 text-center text-sm text-[var(--muted)]">
          Add a list above to get started
        </div>
      )}

      <TaskEditModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
        title={editingTask ? (canEditTasks ? "Edit Task" : "View Task") : "New Task"}
        editingTask={editingTask}
        workspaceId={selectedWorkspaceId ?? undefined}
        members={!isPersonal ? members.map((m) => m.user) : undefined}
        lockWorkspace={!isPersonal}
        isPersonal={isPersonal}
        workspaceName={selectedWorkspace?.name}
        readOnly={!canEditTasks}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
