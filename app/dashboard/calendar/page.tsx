"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { addMonths, format, subMonths } from "date-fns";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { CalendarView } from "@/components/CalendarView";
import { TaskEditModal } from "@/components/TaskEditModal";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";

export default function CalendarPage() {
  const router = useRouter();
  const { status } = useSession();
  const { selectedWorkspaceId, selectedWorkspace, isPersonal, members } = useWorkspace();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultDueDate, setDefaultDueDate] = useState<string | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTasks = useCallback(async (wsId: string | null) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", archived: "false" });
      if (wsId) params.set("workspaceId", wsId);
      const res = await fetch(`/api/tasks?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setTasks(data.tasks);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchTasks(selectedWorkspaceId);
  }, [status, selectedWorkspaceId, fetchTasks]);

  useRealtimeSync({
    workspaceId: selectedWorkspaceId,
    onRefresh: () => fetchTasks(selectedWorkspaceId),
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const closeModal = () => {
    setIsFormOpen(false);
    setEditingTask(null);
    setDefaultDueDate(undefined);
  };

  const openCreate = (dueDate?: string) => {
    setEditingTask(null);
    setDefaultDueDate(dueDate);
    setIsFormOpen(true);
  };

  const withWorkspace = (data: TaskInput): TaskInput => ({
    ...data,
    workspaceId: selectedWorkspaceId,
  });

  const handleSubmit = async (data: TaskInput) => {
    setIsSubmitting(true);
    const url = editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks";
    const res = await fetch(url, {
      method: editingTask ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withWorkspace(data)),
    });
    if (res.ok) {
      closeModal();
      fetchTasks(selectedWorkspaceId);
    }
    setIsSubmitting(false);
  };

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMonth((m) => subMonths(m, 1))}
              className="h-8 w-8 p-0"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="h-8 w-8 p-0"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />New Task
          </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="h-96 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
      ) : (
        <CalendarView
          tasks={tasks}
          month={month}
          onEdit={(t) => {
            setEditingTask(t);
            setDefaultDueDate(undefined);
            setIsFormOpen(true);
          }}
          onDayClick={(day) => openCreate(format(day, "yyyy-MM-dd"))}
        />
      )}

      <TaskEditModal
        isOpen={isFormOpen}
        onClose={closeModal}
        title={
          editingTask
            ? "Edit Task"
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
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
