"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { addMonths, format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { CalendarView } from "@/components/CalendarView";
import { TaskEditModal } from "@/components/TaskEditModal";
import { TaskViewFilters } from "@/components/TaskViewFilters";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";
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
import { useActiveTimer } from "@/lib/useActiveTimer";
import type { CalendarTimeBlock } from "@/components/CalendarView";

export default function CalendarPage() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const { selectedWorkspaceId, selectedWorkspace, isPersonal, members, canEditTasks } = useWorkspace();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState<TaskViewFiltersState>(defaultTaskViewFilters);
  const [month, setMonth] = useState(() => new Date());
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultDueDate, setDefaultDueDate] = useState<string | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [timeBlocks, setTimeBlocks] = useState<CalendarTimeBlock[]>([]);
  const [showTimeBlocks, setShowTimeBlocks] = useState(true);
  const { entry: activeTimer, elapsed: activeTimerElapsed, refresh: onTimerRefresh } = useActiveTimer();

  useEffect(() => {
    const stored = localStorage.getItem("calendar-show-time-blocks");
    if (stored !== null) setShowTimeBlocks(stored === "true");
  }, []);

  const fetchTasks = useCallback(async (wsId: string | null, currentFilters: TaskViewFiltersState) => {
    setIsLoading(true);
    try {
      const params = buildTaskQueryParams(wsId, currentFilters);
      const res = await fetch(`/api/tasks?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setTasks(data.tasks);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void fetchTasks(selectedWorkspaceId, filters);
  }, [status, selectedWorkspaceId, filters, fetchTasks]);

  const fetchTimeBlocks = useCallback(async (userId: string, currentMonth: Date) => {
    const from = startOfMonth(currentMonth).toISOString();
    const to = endOfMonth(currentMonth).toISOString();
    const params = new URLSearchParams({
      range: "custom",
      from,
      to,
      personal: "true",
      limit: "200",
    });
    const res = await fetch(`/api/time/user/${userId}?${params}`);
    const data = await res.json();
    if (res.ok) {
      setTimeBlocks(
        (data.entries ?? []).map(
          (e: {
            id: string;
            taskId: string;
            task?: { title: string };
            startTime: string;
            endTime: string | null;
            duration: number;
            labels?: { id: string; name: string; color: string | null }[];
          }) => ({
            id: e.id,
            taskId: e.taskId,
            taskTitle: e.task?.title ?? "Task",
            startTime: e.startTime,
            endTime: e.endTime,
            duration: e.duration,
            labels: e.labels,
          })
        )
      );
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      void fetchTimeBlocks(session.user.id, month);
    }
  }, [status, session?.user?.id, month, fetchTimeBlocks]);

  useRealtimeSync({
    workspaceId: selectedWorkspaceId,
    onRefresh: () => fetchTasks(selectedWorkspaceId, filters),
  });

  const filteredTasks = useMemo(
    () => applyClientTaskFilters(tasks, filters),
    [tasks, filters]
  );

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const closeModal = () => {
    setIsFormOpen(false);
    setEditingTask(null);
    setDefaultDueDate(undefined);
  };

  const openCreate = (dueDate?: string) => {
    if (!canEditTasks) return;
    setEditingTask(null);
    setDefaultDueDate(dueDate);
    setIsFormOpen(true);
  };

  const withWorkspace = (data: TaskInput): TaskInput => ({
    ...data,
    workspaceId: selectedWorkspaceId,
  });

  const handleSubmit = async (data: TaskInput, options?: TaskFormSubmitOptions) => {
    if (!canEditTasks) return;
    setIsSubmitting(true);
    try {
      await saveTaskWithOptionalTimer(withWorkspace(data), editingTask?.id ?? null, options);
      if (!editingTask && options?.startTimer) {
        dispatchTasksRefresh();
        toast.success("Task created and timer started");
      }
      closeModal();
      fetchTasks(selectedWorkspaceId, filters);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openTaskById = useCallback(async (taskId: string) => {
    const cached = tasks.find((t) => t.id === taskId);
    if (cached) {
      setEditingTask(cached);
      setDefaultDueDate(undefined);
      setIsFormOpen(true);
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load task");
      setEditingTask(data.task);
      setDefaultDueDate(undefined);
      setIsFormOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open task");
    }
  }, [tasks]);

  useOpenTaskListener((taskId) => { void openTaskById(taskId); });

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-6 h-96 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
      </div>
    );
  }

  const pageTitle = isPersonal ? "Calendar" : `${selectedWorkspace?.name} Calendar`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        className="mb-6"
        title={pageTitle}
        subtitle={format(month, "MMMM yyyy")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMonth(new Date())}>
              Today
            </Button>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" onClick={() => setMonth((m) => subMonths(m, 1))} className="h-8 w-8 p-0" aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setMonth((m) => addMonths(m, 1))} className="h-8 w-8 p-0" aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {canEditTasks && (
              <Button size="sm" onClick={() => openCreate()}>
                <Plus className="h-4 w-4" />New Task
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowTimeBlocks((v) => {
                  const next = !v;
                  localStorage.setItem("calendar-show-time-blocks", String(next));
                  return next;
                });
              }}
            >
              {showTimeBlocks ? "Hide logged time" : "Show logged time"}
            </Button>
          </div>
        }
      />

      <TaskViewFilters
        filters={filters}
        onChange={setFilters}
        taskCount={filteredTasks.length}
        showAssigneeFilter={!isPersonal}
      />

      {isLoading ? (
        <div className="h-96 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
      ) : (
        <CalendarView
          tasks={filteredTasks}
          month={month}
          showCreateHint={canEditTasks}
          timeBlocks={timeBlocks}
          showTimeBlocks={showTimeBlocks}
          canEditTasks={canEditTasks}
          activeEntry={activeTimer}
          activeTimerElapsed={activeTimerElapsed}
          onTimerRefresh={onTimerRefresh}
          onEdit={(t) => {
            setEditingTask(t);
            setDefaultDueDate(undefined);
            setIsFormOpen(true);
          }}
          onDayClick={canEditTasks ? (day) => openCreate(format(day, "yyyy-MM-dd")) : undefined}
        />
      )}

      <TaskEditModal
        isOpen={isFormOpen}
        onClose={closeModal}
        title={
          editingTask
            ? canEditTasks ? "Edit Task" : "View Task"
            : defaultDueDate
              ? `New Task · ${format(new Date(defaultDueDate + "T12:00:00"), "MMM d, yyyy")}`
              : "New Task"
        }
        editingTask={editingTask}
        workspaceId={selectedWorkspaceId ?? undefined}
        members={!isPersonal ? members.map((m) => m.user) : undefined}
        lockWorkspace={!isPersonal}
        isPersonal={isPersonal}
        workspaceName={selectedWorkspace?.name}
        defaultDueDate={defaultDueDate}
        readOnly={!canEditTasks}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
