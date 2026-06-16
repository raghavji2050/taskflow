"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  isPushSubscribed,
  isPushSupported,
  subscribeToPush,
} from "@/lib/push-client";

export function MessagesPushBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!isPushSupported()) {
      setVisible(false);
      return;
    }
    if (Notification.permission === "denied") {
      setVisible(false);
      return;
    }
    const subscribed = await isPushSubscribed();
    setVisible(!subscribed);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const ok = await subscribeToPush();
      if (ok) {
        toast.success("Desktop notifications enabled");
        setVisible(false);
      } else {
        toast.error("Could not enable notifications");
        void check();
      }
    } catch {
      toast.error("Could not enable notifications");
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="mx-4 mb-2 flex items-start gap-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2.5 sm:mx-6 lg:mx-8">
      <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--foreground)]">
          Enable desktop notifications
        </p>
        <p className="text-xs text-[var(--muted)]">
          Get chat alerts when this tab is in the background.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={() => void handleEnable()} isLoading={busy}>
          Enable
        </Button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
