"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Square, Plus, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  formatDurationHms,
  formatDurationShort,
  formatLoggedVsEstimated,
  isOverEstimate,
  parseDurationInput,
} from "@/lib/time-format";
import { cn } from "@/lib/utils";
import { useLiveTimer } from "@/lib/useLiveTimer";
import { useTimeRealtime } from "@/lib/useTimeRealtime";
import { ManualTimeEntryModal } from "@/components/tasks/ManualTimeEntryModal";
import { TimerNoteModal, type TimerStartSubmitData } from "@/components/tasks/TimerNoteModal";
import {
  TimerStopModal,
  type TimerStopSubmitData,
} from "@/components/tasks/TimerStopModal";
import { dispatchTasksRefresh } from "@/lib/tasks-refresh-event";

interface TimeSummary {
  total: number;
  today: number;
  week: number;
  estimatedMinutes?: number | null;
}

interface ActiveEntry {
  id: string;
  startTime: string;
  isRunning: boolean;
  description?: string | null;
  task?: { id: string; title: string; status?: string };
}

interface TimeTrackerProps {
  taskId: string;
  readOnly?: boolean;
  taskStatus?: string;
}

export function TimeTracker({ taskId, readOnly = false, taskStatus }: TimeTrackerProps) {
  const [summary, setSummary] = useState<TimeSummary>({ total: 0, today: 0, week: 0 });
  const [activeEntry, setActiveEntry] = useState<ActiveEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const elapsed = useLiveTimer(
    activeEntry?.startTime,
    Boolean(activeEntry?.isRunning)
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/time/task/${taskId}?limit=1`);
      const data = await res.json();
      if (res.ok) {
        setSummary(data.summary ?? { total: 0, today: 0, week: 0 });
        setActiveEntry(data.activeTimer ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useTimeRealtime({ taskId, onEvent: () => void load() });

  const handleStart = async (data: TimerStartSubmitData) => {
    setActing(true);
    try {
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
      if (!res.ok) throw new Error(result.error ?? "Could not start timer");
      setActiveEntry(result.entry);
      toast.success("Timer started");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start timer");
    } finally {
      setActing(false);
    }
  };

  const handleStop = async (data: TimerStopSubmitData) => {
    setActing(true);
    try {
      const body: Record<string, unknown> = {
        timeEntryId: activeEntry?.id,
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
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Could not stop timer");
      setActiveEntry(null);
      toast.success("Timer stopped");
      void load();
      dispatchTasksRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not stop timer");
    } finally {
      setActing(false);
    }
  };

  const handleAddNote = async (note: string) => {
    if (!activeEntry?.id) return;
    const res = await fetch(`/api/time/${activeEntry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: note.trim() || null }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not save note");
    setActiveEntry(data.entry);
    toast.success("Note saved");
    void load();
  };

  const handleManual = async (input: {
    date: string;
    hours: number;
    minutes: number;
    description: string;
  }) => {
    const durationSeconds = parseDurationInput(input.hours, input.minutes);
    if (durationSeconds < 60) {
      toast.error("Minimum duration is 1 minute");
      return;
    }
    const end = new Date(`${input.date}T12:00:00`);
    const res = await fetch("/api/time/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId,
        date: end.toISOString(),
        durationSeconds,
        description: input.description || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not log time");
    toast.success("Time logged");
    void load();
  };

  const isRunning = Boolean(activeEntry?.isRunning);
  const currentTaskStatus = activeEntry?.task?.status ?? taskStatus;
  const displayTotal = summary.total + (isRunning ? elapsed : 0);
  const hasEstimate = summary.estimatedMinutes != null && summary.estimatedMinutes > 0;
  const overBudget = isOverEstimate(displayTotal, summary.estimatedMinutes);
  const progressPct = hasEstimate
    ? Math.min(100, (displayTotal / (summary.estimatedMinutes! * 60)) * 100)
    : 0;

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-[var(--surface-3)] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Running</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--foreground)]">
                {isRunning ? formatDurationHms(elapsed) : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-3)] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Today</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">
                {formatDurationShort(summary.today)}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-3)] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Total</p>
              <p
                className={cn(
                  "mt-0.5 text-sm font-semibold tabular-nums",
                  overBudget ? "text-[var(--warning)]" : "text-[var(--foreground)]"
                )}
              >
                {formatLoggedVsEstimated(displayTotal, summary.estimatedMinutes)}
              </p>
              {hasEstimate && (
                <div className="mx-auto mt-1.5 h-1 w-full max-w-[72px] overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      overBudget ? "bg-[var(--warning)]" : "bg-[var(--accent)]"
                    )}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              {!isRunning ? (
                <Button type="button" size="sm" onClick={() => setStartModalOpen(true)} disabled={acting}>
                  <Play className="h-3.5 w-3.5" />
                  Start
                </Button>
              ) : (
                <>
                  <Button type="button" size="sm" variant="danger" onClick={() => setStopModalOpen(true)} disabled={acting}>
                    <Square className="h-3.5 w-3.5" />
                    Stop
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setAddModalOpen(true)} disabled={acting}>
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Edit note
                  </Button>
                </>
              )}
              <Button type="button" size="sm" variant="secondary" onClick={() => setManualOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Log time
              </Button>
            </div>
          )}
        </>
      )}

      <ManualTimeEntryModal
        isOpen={manualOpen}
        onClose={() => setManualOpen(false)}
        onSubmit={handleManual}
      />
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
        initialStatus={currentTaskStatus}
        onClose={() => setStopModalOpen(false)}
        onSubmit={handleStop}
      />
      <TimerNoteModal
        isOpen={addModalOpen}
        mode="add"
        initialNote={activeEntry?.description}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddNote}
      />
    </div>
  );
}
