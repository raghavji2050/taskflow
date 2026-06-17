"use client";

import { useEffect, useState } from "react";

export function useLiveTimer(startTimeIso: string | null | undefined, isRunning: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTimeIso || !isRunning) {
      setElapsed(0);
      return;
    }

    const startMs = new Date(startTimeIso).getTime();
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startTimeIso, isRunning]);

  return elapsed;
}
