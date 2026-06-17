"use client";

import { useEffect, useState } from "react";
import { useIdleTimer } from "@/lib/useIdleTimer";
import type { TimeTrackingPrefs } from "@/lib/time-tracking-prefs";

export function IdleTimerProvider() {
  const [prefs, setPrefs] = useState<TimeTrackingPrefs | null>(null);

  useEffect(() => {
    fetch("/api/user/time-prefs")
      .then((r) => r.json())
      .then((d) => {
        if (d.prefs) setPrefs(d.prefs);
      })
      .catch(() => {});
  }, []);

  useIdleTimer(prefs);
  return null;
}
