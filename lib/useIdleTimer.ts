"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useActiveTimer } from "@/lib/useActiveTimer";
import type { TimeTrackingPrefs } from "@/lib/time-tracking-prefs";

function isDesktopEnvironment() {
  if (typeof window === "undefined") return false;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return finePointer && !mobileUa;
}

export function useIdleTimer(prefs: TimeTrackingPrefs | null) {
  const { entry, refresh } = useActiveTimer();
  const lastActivityRef = useRef(Date.now());
  const idleTriggeredRef = useRef(false);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    idleTriggeredRef.current = false;
  }, []);

  useEffect(() => {
    if (!prefs || prefs.idleTimeoutMinutes === 0) return;
    if (!isDesktopEnvironment()) return;
    if (!entry?.isRunning || entry.isPaused) return;

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"] as const;
    const onActivity = () => resetActivity();
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [entry?.isRunning, entry?.isPaused, prefs, resetActivity]);

  useEffect(() => {
    if (!prefs || prefs.idleTimeoutMinutes === 0) return;
    if (!isDesktopEnvironment()) return;
    if (!entry?.isRunning || entry.isPaused) {
      idleTriggeredRef.current = false;
      return;
    }

    const timeoutMs = prefs.idleTimeoutMinutes * 60 * 1000;
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      if (idleTriggeredRef.current) return;
      if (Date.now() - lastActivityRef.current < timeoutMs) return;

      idleTriggeredRef.current = true;
      const res = await fetch("/api/time/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "idle" }),
      });
      if (!res.ok) return;

      void refresh();
      toast("Timer paused due to inactivity", {
        action: {
          label: "Resume",
          onClick: async () => {
            const resumeRes = await fetch("/api/time/resume-paused", { method: "POST" });
            if (resumeRes.ok) void refresh();
          },
        },
      });
    }, 15000);

    return () => window.clearInterval(id);
  }, [entry?.isRunning, entry?.isPaused, prefs, refresh]);
}
