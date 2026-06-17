"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatElapsedSeconds } from "@/lib/mom-structured";
import { cn } from "@/lib/utils";

interface MomMeetingTimerProps {
  active: boolean;
  paused: boolean;
  startedAt: Date | null;
  elapsedOffset: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function MomMeetingTimer({
  active,
  paused,
  startedAt,
  elapsedOffset,
  onStart,
  onPause,
  onResume,
}: MomMeetingTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active || !startedAt) {
      setElapsed(0);
      return;
    }
    if (paused) {
      setElapsed(elapsedOffset);
      return;
    }
    const tick = () => {
      setElapsed(
        elapsedOffset + Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000))
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active, paused, startedAt, elapsedOffset]);

  if (!active) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={onStart} className="gap-1.5">
        <Play className="h-3.5 w-3.5" />
        Start meeting
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm tabular-nums",
          paused
            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        )}
      >
        {!paused && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        )}
        {paused && (
          <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
        )}
        {formatElapsedSeconds(elapsed)}
        {paused && <span className="text-[10px] font-sans font-medium uppercase">Paused</span>}
      </div>
      {paused ? (
        <Button type="button" size="sm" variant="secondary" onClick={onResume} className="gap-1.5">
          <Play className="h-3.5 w-3.5" />
          Resume
        </Button>
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={onPause} className="gap-1.5">
          <Pause className="h-3.5 w-3.5" />
          Pause
        </Button>
      )}
    </div>
  );
}
