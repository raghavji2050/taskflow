"use client";



import { useState } from "react";

import { Play, Square } from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/Button";

import { TimerNoteModal } from "@/components/tasks/TimerNoteModal";

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

  readOnly?: boolean;

  activeEntry: ActiveTimerEntry | null;

  elapsed: number;

  onRefresh: () => void;

  className?: string;

}



export function TaskTimeControls({

  taskId,

  readOnly = false,

  activeEntry,

  elapsed,

  onRefresh,

  className,

}: TaskTimeControlsProps) {

  const [startModalOpen, setStartModalOpen] = useState(false);

  const [stopModalOpen, setStopModalOpen] = useState(false);



  const isThisTaskRunning = Boolean(

    activeEntry?.isRunning &&

      (activeEntry.taskId === taskId || activeEntry.task?.id === taskId)

  );



  const handleStart = async (description: string) => {

    const res = await fetch("/api/time/start", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({

        taskId,

        description: description.trim() || null,

      }),

    });

    const data = await res.json();

    if (!res.ok) {

      toast.error(data.error ?? "Could not start timer");

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
    if (data.taskStatus) {
      body.taskStatus = data.taskStatus;
    }



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



  if (readOnly) return null;



  return (

    <>

      <div

        className={cn("flex shrink-0 items-center gap-1.5", className)}

        onClick={(e) => e.stopPropagation()}

      >

        {isThisTaskRunning ? (

          <>

            <span className="font-mono text-xs font-semibold tabular-nums text-[var(--accent)]">

              {formatDurationHms(elapsed)}

            </span>

            <Button

              type="button"

              size="sm"

              variant="danger"

              onClick={() => setStopModalOpen(true)}

              className="h-7 gap-1 px-2"

              aria-label="Stop timer"

            >

              <Square className="h-3 w-3" />

              <span className="text-xs">Stop</span>

            </Button>

          </>

        ) : (

          <Button

            type="button"

            size="sm"

            variant="secondary"

            onClick={() => setStartModalOpen(true)}

            className="h-7 gap-1 px-2"

            aria-label="Start timer"

          >

            <Play className="h-3 w-3" />

            <span className="text-xs">Start</span>

          </Button>

        )}

      </div>



      <TimerNoteModal

        isOpen={startModalOpen}

        mode="start"

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

