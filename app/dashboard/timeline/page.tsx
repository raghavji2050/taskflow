"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { TimelineView } from "@/components/TimelineView";
import { TaskEditModal } from "@/components/TaskEditModal";
import { PageHeader } from "@/components/PageHeader";
import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";
import { toTaskInput } from "@/lib/task-ui";

export default function TimelinePage() {
  const router = useRouter();
  const { status } = useSession();
  const { selectedWorkspaceId, selectedWorkspace, isPersonal, members } = useWorkspace();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100", archived: "false" });
    if (selectedWorkspaceId) params.set("workspaceId", selectedWorkspaceId);
    const res = await fetch(`/api/tasks?${params}`);
    const data = await res.json();
    if (res.ok) setTasks(data.tasks);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (status === "authenticated") void fetchTasks();
    if (status === "unauthenticated") router.push("/login");
  }, [status, selectedWorkspaceId, fetchTasks, router]);

  const handleSubmit = async (data: TaskInput) => {
    if (!editingTask) return;
    setIsSubmitting(true);
    const res = await fetch(`/api/tasks/${editingTask.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, workspaceId: selectedWorkspaceId }),
    });
    if (res.ok) {
      setIsFormOpen(false);
      setEditingTask(null);
      await fetchTasks();
    }
    setIsSubmitting(false);
  };

  if (status === "loading") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={isPersonal ? "Timeline" : `${selectedWorkspace?.name ?? "Team"} Timeline`}
        subtitle="Due dates across the next two weeks"
      />
      <TimelineView tasks={tasks} onEdit={(t) => { setEditingTask(t); setIsFormOpen(true); }} />
      <TaskEditModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
        title="Edit Task"
        editingTask={editingTask}
        workspaceId={selectedWorkspaceId ?? undefined}
        members={!isPersonal ? members.map((m) => m.user) : undefined}
        lockWorkspace={!isPersonal}
        isPersonal={isPersonal}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
