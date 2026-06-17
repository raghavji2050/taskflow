"use client";

import { useState } from "react";
import { MessageSquarePlus, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { TimerNoteModal } from "@/components/tasks/TimerNoteModal";
import {
  TimerStopModal,
  type TimerStopSubmitData,
} from "@/components/tasks/TimerStopModal";
import { formatDurationHms } from "@/lib/time-format";
import { dispatchOpenTask } from "@/lib/open-task-event";
import { dispatchTasksRefresh } from "@/lib/tasks-refresh-event";
import { useActiveTimer } from "@/lib/useActiveTimer";

export function TimeTrackingBar() {
  const { entry, elapsed, refresh } = useActiveTimer();
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  if (!entry?.isRunning) return null;

  const taskId = entry.taskId ?? entry.task?.id;

  const handleStop = async (data: TimerStopSubmitData) => {
    const body: Record<string, unknown> = {
      timeEntryId: entry.id,
      description: data.description ?? null,
    };
    if (data.taskStatus) {
      body.taskStatus = data.taskStatus;
    }

    const res = await fetch("/api/time/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Could not stop timer");
      return;
    }
    toast.success("Timer stopped");
    void refresh();
    dispatchTasksRefresh();
  };

  const handleAddNote = async (note: string) => {
    const res = await fetch(`/api/time/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: note.trim() || null }),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Could not save note");
      return;
    }
    toast.success("Note saved");
    void refresh();
  };

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-[var(--card-border)] border-l-4 border-l-[var(--accent)] bg-[var(--card)] shadow-sm backdrop-blur-xl px-4 py-2">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Active timer
            </p>
            {taskId ? (
              <button
                type="button"
                onClick={() => dispatchOpenTask(taskId)}
                className="truncate text-left text-sm font-medium text-[var(--foreground)] hover:text-[var(--accent)] hover:underline"
              >
                {entry.task?.title ?? "Task"}
              </button>
            ) : (
              <p className="truncate text-sm font-medium text-[var(--foreground)]">
                {entry.task?.title ?? "Task"}
              </p>
            )}
          </div>
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--accent)]">
            {formatDurationHms(elapsed)}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setAddModalOpen(true)}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add note</span>
            </Button>
            <Button type="button" size="sm" variant="danger" onClick={() => setStopModalOpen(true)}>
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          </div>
        </div>
      </div>

      <TimerStopModal
        isOpen={stopModalOpen}
        initialNote={entry.description}
        initialStatus={entry.task?.status}
        onClose={() => setStopModalOpen(false)}
        onSubmit={handleStop}
      />
      <TimerNoteModal
        isOpen={addModalOpen}
        mode="add"
        initialNote={entry.description}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddNote}
      />
    </>
  );
}
