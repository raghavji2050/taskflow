"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  enablePushWithTest,
  getPushEnrollmentStatus,
  getPushSubscribeErrorMessage,
  isPushSupported,
} from "@/lib/push-client";

interface PushEnrollmentBannerProps {
  className?: string;
}

export function PushEnrollmentBanner({ className }: PushEnrollmentBannerProps) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(true);

  const refresh = useCallback(async () => {
    if (!isPushSupported() || Notification.permission === "denied") {
      setVisible(false);
      return;
    }
    const status = await getPushEnrollmentStatus();
    setPushConfigured(status.pushConfigured);
    setVisible(!status.enrolled);
  }, []);

  useEffect(() => {
    void refresh();
    const onStatus = () => void refresh();
    window.addEventListener("taskflow:push-status", onStatus);
    document.addEventListener("visibilitychange", onStatus);
    return () => {
      window.removeEventListener("taskflow:push-status", onStatus);
      document.removeEventListener("visibilitychange", onStatus);
    };
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    try {
      const result = await enablePushWithTest();
      if (result.ok) {
        toast.success("Desktop notifications enabled — check for a test alert");
        setVisible(false);
      } else {
        toast.error(result.error ?? "Could not enable notifications");
      }
    } catch (error) {
      toast.error(getPushSubscribeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      className={
        className ??
        "mx-2 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color-mix(in_oklab,var(--accent)_30%,var(--border))] bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface-1))] px-3 py-2.5 sm:mx-4 lg:mx-6"
      }
    >
      <div className="flex min-w-0 items-start gap-2">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-[var(--foreground)]">Enable desktop notifications</p>
          <p className="text-[var(--muted)]">
            {pushConfigured
              ? "Get chat alerts via FCM when you're away from this tab."
              : "Push is not configured on this server (Firebase credentials missing)."}
          </p>
        </div>
      </div>
      {pushConfigured && (
        <Button size="sm" variant="primary" onClick={() => void enable()} isLoading={busy}>
          Enable & test
        </Button>
      )}
    </div>
  );
}
