"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertTriangle, Briefcase } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { TaskCard, type Task } from "@/components/TaskCard";
import { Card } from "@/components/ui/Card";
import { TaskEditModal } from "@/components/TaskEditModal";
import type { TaskInput } from "@/lib/validations";

export default function MyWorkPage() {
  const router = useRouter();
  const { status } = useSession();
  const [assigned, setAssigned] = useState<Task[]>([]);
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [counts, setCounts] = useState({ total: 0, overdue: 0, inProgress: 0, pending: 0 });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const load = async () => {
    const res = await fetch("/api/tasks/my-work");
    const data = await res.json();
    if (res.ok) {
      setAssigned(data.assigned);
      setOverdue(data.overdue);
      setCounts(data.counts);
    }
  };

  useEffect(() => {
    if (status === "authenticated") void load();
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const handleSubmit = async (formData: TaskInput) => {
    if (!editingTask) return;
    const res = await fetch(`/api/tasks/${editingTask.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (res.ok) {
      setIsFormOpen(false);
      setEditingTask(null);
      await load();
    }
  };

  if (status === "loading") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
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
          <div className="space-y-2">
            {overdue.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                showMeta
                onEdit={(t) => { setEditingTask(t); setIsFormOpen(true); }}
                onDelete={() => {}}
                onArchive={() => {}}
                onToggleStatus={() => {}}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Briefcase className="h-4 w-4 text-indigo-500" /> All assigned tasks
        </h2>
        <div className="space-y-2">
          {assigned.length === 0 ? (
            <p className="text-sm text-zinc-500">No tasks assigned to you yet.</p>
          ) : (
            assigned.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                showMeta
                onEdit={(t) => { setEditingTask(t); setIsFormOpen(true); }}
                onDelete={() => {}}
                onArchive={() => {}}
                onToggleStatus={() => {}}
              />
            ))
          )}
        </div>
      </section>

      <TaskEditModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
        title="Edit Task"
        editingTask={editingTask}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
