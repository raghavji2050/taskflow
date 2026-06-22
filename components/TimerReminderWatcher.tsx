"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  TimerStopModal,
  type TimerStopSubmitData,
} from "@/components/tasks/TimerStopModal";
import { formatDurationShort } from "@/lib/time-format";
import { useActiveTimer } from "@/lib/useActiveTimer";
import { shouldSendRunningReminder, computeReminderSnoozeUntil } from "@/lib/time-reminder";
import type { TimeTrackingPrefs } from "@/lib/time-tracking-prefs";
import { dispatchTasksRefresh } from "@/lib/tasks-refresh-event";
import { toast } from "sonner";

export function TimerReminderWatcher() {
  const { entry, elapsed, refresh } = useActiveTimer();
  const [prefs, setPrefs] = useState<TimeTrackingPrefs | null>(null);
  const [open, setOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/user/time-prefs")
      .then((r) => r.json())
      .then((d) => {
        if (d.prefs) setPrefs(d.prefs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!entry?.isRunning || entry.isPaused || !prefs) {
      setOpen(false);
      return;
    }

    const check = () => {
      const shouldShow = shouldSendRunningReminder({
        entry: {
          startTime: new Date(entry.startTime),
          duration: entry.duration ?? 0,
          isRunning: true,
          isPaused: false,
          lastReminderAt: null,
          reminderSnoozedUntil: entry.reminderSnoozedUntil
            ? new Date(entry.reminderSnoozedUntil)
            : null,
        },
        prefs,
      });

      if (shouldShow && shownRef.current !== entry.id) {
        shownRef.current = entry.id;
        setOpen(true);
      }
    };

    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [entry, prefs]);

  const handleContinue = async () => {
    if (!entry || !prefs) return;
    const snoozeUntil = computeReminderSnoozeUntil(prefs);
    await fetch(`/api/time/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderSnoozedUntil: snoozeUntil.toISOString() }),
    });
    setOpen(false);
    void refresh();
  };

  const handleStop = async (data: TimerStopSubmitData) => {
    if (!entry) return;
    const body: Record<string, unknown> = {
      timeEntryId: entry.id,
      description: data.description ?? null,
    };
    if (data.taskStatus) body.taskStatus = data.taskStatus;

    const res = await fetch("/api/time/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Could not stop timer");
      return;
    }
    toast.success("Timer stopped");
    setStopOpen(false);
    setOpen(false);
    void refresh();
    dispatchTasksRefresh();
  };

  if (!entry?.isRunning) return null;

  const taskTitle = entry.task?.title ?? "Task";

  return (
    <>
      <Modal
        isOpen={open}
        onClose={() => void handleContinue()}
        title="Timer still running"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void handleContinue()}>
              Continue
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setOpen(false);
                setStopOpen(true);
              }}
            >
              Stop timer
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--foreground)]">
          Timer on <span className="font-medium">{taskTitle}</span> has been running{" "}
          <span className="font-medium">{formatDurationShort(elapsed)}</span> — stop or continue?
        </p>
      </Modal>

      <TimerStopModal
        isOpen={stopOpen}
        initialNote={entry.description}
        initialStatus={entry.task?.status}
        onClose={() => setStopOpen(false)}
        onSubmit={handleStop}
      />
    </>
  );
}
