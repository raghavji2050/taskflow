"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  ensureServiceWorker,
  isPushSubscribed,
  isPushSupported,
  subscribeToPush,
} from "@/lib/push-client";

export function PushSubscribe() {
  const [status, setStatus] = useState<"loading" | "idle" | "enabled" | "unsupported">("loading");
  const [busy, setBusy] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }

    const subscribed = await isPushSubscribed();
    setStatus(subscribed ? "enabled" : "idle");
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      ensureServiceWorker().catch(() => {});
    }
    checkStatus();
  }, [checkStatus]);

  const subscribe = async () => {
    if (!isPushSupported()) {
      toast.error("Push notifications are not supported in this browser");
      return;
    }

    setBusy(true);
    try {
      const ok = await subscribeToPush();
      if (!ok) {
        toast.error("Push not configured or permission denied");
        return;
      }

      const testRes = await fetch("/api/notifications/test", { method: "POST" });
      if (testRes.ok) {
        toast.success("Push notifications enabled — check for a test notification");
      } else {
        toast.success("Push notifications enabled");
      }

      setStatus("enabled");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to enable push";
      toast.error(message);
      console.error("Push subscribe error:", error);
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();

      await fetch("/api/notifications/subscribe", { method: "DELETE" });
      toast.success("Push notifications disabled");
      setStatus("idle");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable push");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <Button variant="secondary" size="sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (status === "unsupported") {
    return (
      <p className="text-sm text-zinc-500">Push notifications are not supported in this browser.</p>
    );
  }

  if (status === "enabled") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-emerald-600 dark:text-emerald-400">Push notifications enabled</span>
        <Button variant="secondary" size="sm" onClick={unsubscribe} isLoading={busy}>
          <BellOff className="h-4 w-4" />
          Disable
        </Button>
      </div>
    );
  }

  return (
    <Button variant="secondary" size="sm" onClick={subscribe} isLoading={busy}>
      <BellRing className="h-4 w-4" />
      Enable Push
    </Button>
  );
}
