"use client";

import { useEffect, useState } from "react";

export function useLiveTimer(
  startTimeIso: string | null | undefined,
  isActive: boolean,
  accumulatedSeconds = 0
) {
  const [elapsed, setElapsed] = useState(accumulatedSeconds);

  useEffect(() => {
    if (!isActive) {
      setElapsed(accumulatedSeconds);
      return;
    }

    if (!startTimeIso) {
      setElapsed(accumulatedSeconds);
      return;
    }

    const startMs = new Date(startTimeIso).getTime();
    const tick = () => {
      const segment = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setElapsed(accumulatedSeconds + segment);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startTimeIso, isActive, accumulatedSeconds]);

  return elapsed;
}
