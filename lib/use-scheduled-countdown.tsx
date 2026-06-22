"use client";

import { useEffect, useState } from "react";
import { formatCountdownUntil } from "@/lib/schedule-message-time";

/** Live countdown label that updates every second until send time. */
export function useScheduledCountdown(scheduledFor: string | null | undefined): string {
  const [label, setLabel] = useState(() =>
    scheduledFor ? formatCountdownUntil(scheduledFor) : ""
  );

  useEffect(() => {
    if (!scheduledFor) {
      setLabel("");
      return;
    }

    const update = () => setLabel(formatCountdownUntil(scheduledFor));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [scheduledFor]);

  return label;
}

export function ScheduledCountdown({
  scheduledFor,
  className,
}: {
  scheduledFor: string;
  className?: string;
}) {
  const countdown = useScheduledCountdown(scheduledFor);
  if (!countdown) return null;
  return <span className={className}>{countdown}</span>;
}
