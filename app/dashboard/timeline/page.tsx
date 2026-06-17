"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { TimelineView } from "@/components/TimelineView";
import { TaskEditModal } from "@/components/TaskEditModal";
import { TaskViewFilters } from "@/components/TaskViewFilters";
import { PageHeader } from "@/components/PageHeader";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";
import type { TaskFormSubmitOptions } from "@/lib/client-task-submit";
import {
  buildTaskQueryParams,
  applyClientTaskFilters,
  defaultTaskViewFilters,
  type TaskViewFiltersState,
} from "@/lib/task-view-filters";
import { useOpenTaskListener } from "@/lib/open-task-event";

export default function TimelinePage() {
  const router = useRouter();
  const { status } = useSession();
  const { selectedWorkspaceId, selectedWorkspace, isPersonal, members, canEditTasks } = useWorkspace();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState<TaskViewFiltersState>(defaultTaskViewFilters);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTasks = useCallback(async (currentFilters: TaskViewFiltersState) => {
    const params = buildTaskQueryParams(selectedWorkspaceId, currentFilters);
    const res = await fetch(`/api/tasks?${params}`);
    const data = await res.json();
    if (res.ok) setTasks(data.tasks);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (status === "authenticated") void fetchTasks(filters);
    if (status === "unauthenticated") router.push("/login");
  }, [status, selectedWorkspaceId, filters, fetchTasks, router]);

  useRealtimeSync({
    workspaceId: selectedWorkspaceId,
    onRefresh: () => fetchTasks(filters),
  });

  const filteredTasks = useMemo(
    () => applyClientTaskFilters(tasks, filters),
    [tasks, filters]
  );

  const handleSubmit = async (data: TaskInput, _options?: TaskFormSubmitOptions) => {
    if (!editingTask || !canEditTasks) return;
    setIsSubmitting(true);
    const res = await fetch(`/api/tasks/${editingTask.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, workspaceId: selectedWorkspaceId }),
    });
    if (res.ok) {
      setIsFormOpen(false);
      setEditingTask(null);
      await fetchTasks(filters);
    }
    setIsSubmitting(false);
  };

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

  if (status === "loading") return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isPersonal ? "Timeline" : `${selectedWorkspace?.name ?? "Team"} Timeline`}
        subtitle="Due dates across the next two weeks"
      />
      <TaskViewFilters
        filters={filters}
        onChange={setFilters}
        taskCount={filteredTasks.length}
        showAssigneeFilter={!isPersonal}
      />
      <TimelineView
        tasks={filteredTasks}
        onEdit={(t) => { setEditingTask(t); setIsFormOpen(true); }}
      />
      <TaskEditModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
        title={canEditTasks ? "Edit Task" : "View Task"}
        editingTask={editingTask}
        workspaceId={selectedWorkspaceId ?? undefined}
        members={!isPersonal ? members.map((m) => m.user) : undefined}
        lockWorkspace={!isPersonal}
        isPersonal={isPersonal}
        readOnly={!canEditTasks}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
