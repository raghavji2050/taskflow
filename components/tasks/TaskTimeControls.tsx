"use client";

import { useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { TimerNoteModal, type TimerStartSubmitData } from "@/components/tasks/TimerNoteModal";
import {
  TimerStopModal,
  type TimerStopSubmitData,
} from "@/components/tasks/TimerStopModal";
import { dispatchTasksRefresh } from "@/lib/tasks-refresh-event";
import { formatDurationHms } from "@/lib/time-format";
import type { ActiveTimerEntry } from "@/lib/useActiveTimer";
import { cn } from "@/lib/utils";

interface TaskTimeControlsProps {
  taskId: string;
  taskStatus?: string;
  readOnly?: boolean;
  activeEntry: ActiveTimerEntry | null;
  elapsed: number;
  onRefresh: () => void;
  className?: string;
  variant?: "default" | "compact";
}

export function TaskTimeControls({
  taskId,
  taskStatus,
  readOnly = false,
  activeEntry,
  elapsed,
  onRefresh,
  className,
  variant = "default",
}: TaskTimeControlsProps) {
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [stopModalOpen, setStopModalOpen] = useState(false);

  const isThisTask =
    activeEntry?.isRunning &&
    (activeEntry.taskId === taskId || activeEntry.task?.id === taskId);

  const isRunning = Boolean(isThisTask && !activeEntry?.isPaused);
  const isPaused = Boolean(isThisTask && activeEntry?.isPaused);
  const compact = variant === "compact";

  const handleStart = async (data: TimerStartSubmitData) => {
    const res = await fetch("/api/time/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId,
        description: data.note.trim() || null,
        promoteStatus: data.promoteStatus,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not start timer");
      return;
    }
    toast.success("Timer started");
    onRefresh();
  };

  const handleStop = async (data: TimerStopSubmitData) => {
    const body: Record<string, unknown> = {
      timeEntryId: activeEntry?.id,
      description: data.description ?? null,
    };
    if (data.taskStatus) body.taskStatus = data.taskStatus;

    const res = await fetch("/api/time/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not stop timer");
      return;
    }
    toast.success("Timer stopped");
    onRefresh();
    dispatchTasksRefresh();
  };

  const handlePause = async () => {
    const res = await fetch("/api/time/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeEntryId: activeEntry?.id }),
    });
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Could not pause");
      return;
    }
    onRefresh();
  };

  const handleResume = async () => {
    const res = await fetch("/api/time/resume-paused", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeEntryId: activeEntry?.id }),
    });
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Could not resume");
      return;
    }
    onRefresh();
  };

  if (readOnly) return null;

  return (
    <>
      <div
        className={cn("flex shrink-0 items-center gap-1", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {isRunning ? (
          <>
            <span
              className={cn(
                "font-mono font-semibold tabular-nums text-[var(--accent)]",
                compact ? "text-[10px]" : "text-xs"
              )}
            >
              {formatDurationHms(elapsed)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void handlePause()}
              className={cn(compact ? "h-6 w-6 p-0" : "h-7 gap-1 px-2")}
              aria-label="Pause timer"
            >
              <Pause className="h-3 w-3" />
              {!compact && <span className="text-xs">Pause</span>}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => setStopModalOpen(true)}
              className={cn(compact ? "h-6 w-6 p-0" : "h-7 gap-1 px-2")}
              aria-label="Stop timer"
            >
              <Square className="h-3 w-3" />
              {!compact && <span className="text-xs">Stop</span>}
            </Button>
          </>
        ) : isPaused ? (
          <>
            <span
              className={cn(
                "font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400",
                compact ? "text-[10px]" : "text-xs"
              )}
            >
              {formatDurationHms(elapsed)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => void handleResume()}
              className={cn(compact ? "h-6 w-6 p-0" : "h-7 gap-1 px-2")}
              aria-label="Resume timer"
            >
              <Play className="h-3 w-3" />
              {!compact && <span className="text-xs">Resume</span>}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setStartModalOpen(true)}
            className={cn(compact ? "h-6 w-6 p-0" : "h-7 gap-1 px-2")}
            aria-label="Start timer"
          >
            <Play className="h-3 w-3" />
            {!compact && <span className="text-xs">Start</span>}
          </Button>
        )}
      </div>

      <TimerNoteModal
        isOpen={startModalOpen}
        mode="start"
        taskStatus={taskStatus}
        onClose={() => setStartModalOpen(false)}
        onSubmit={handleStart}
      />
      <TimerStopModal
        isOpen={stopModalOpen}
        initialNote={activeEntry?.description}
        initialStatus={activeEntry?.task?.status}
        onClose={() => setStopModalOpen(false)}
        onSubmit={handleStop}
      />
    </>
  );
}
