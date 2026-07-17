"use client";

import { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  ensureServiceWorker,
  enablePushWithTest,
  getPushEnrollmentStatus,
  getPushSubscribeErrorMessage,
  isPushSupported,
  sendTestPushNotification,
  unsubscribeFromPush,
} from "@/lib/push-client";
import { cn } from "@/lib/utils";

type PushSubscribeProps = {
  /** Full card layout for Settings; compact control for page toolbars. */
  variant?: "settings" | "toolbar";
  /** Icon-only toolbar button (mobile headers). */
  iconOnly?: boolean;
  className?: string;
};

type PushUiStatus = "loading" | "idle" | "enabled" | "unsupported" | "denied" | "unconfigured";

export function PushSubscribe({
  variant = "settings",
  iconOnly = false,
  className,
}: PushSubscribeProps) {
  const [status, setStatus] = useState<PushUiStatus>("loading");
  const [busy, setBusy] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    const enrollment = await getPushEnrollmentStatus();
    if (!enrollment.pushConfigured) {
      setStatus("unconfigured");
      return;
    }
    setStatus(enrollment.enrolled ? "enabled" : "idle");
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      ensureServiceWorker().catch(() => {});
    }
    void checkStatus();
    const onFocus = () => void checkStatus();
    const onPushStatus = () => void checkStatus();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    window.addEventListener("taskflow:push-status", onPushStatus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("taskflow:push-status", onPushStatus);
    };
  }, [checkStatus]);

  const subscribe = async () => {
    if (!isPushSupported()) {
      toast.error("Push notifications are not supported in this browser");
      return;
    }

    setBusy(true);
    try {
      const result = await enablePushWithTest();
      if (!result.ok) {
        if (Notification.permission === "denied") {
          setStatus("denied");
          toast.error("Notifications are blocked in your browser settings");
        } else {
          toast.error(result.error ?? "Could not enable notifications");
        }
        await checkStatus();
        return;
      }

      toast.success("Desktop notifications enabled — check for a test alert");
      setStatus("enabled");
    } catch (error) {
      toast.error(getPushSubscribeErrorMessage(error));
      console.error("Push subscribe error:", error);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const test = await sendTestPushNotification();
      if (test.ok) {
        toast.success("Test notification sent");
      } else {
        toast.error(test.error ?? "Test push failed — try enabling notifications again");
        await checkStatus();
      }
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      toast.success("Desktop notifications disabled");
      setStatus("idle");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable push");
    } finally {
      setBusy(false);
    }
  };

  if (variant === "toolbar") {
    if (status === "loading" || status === "unsupported") return null;

    if (status === "unconfigured") {
      return (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled
          className={className}
          title="Firebase Cloud Messaging not configured on server"
        >
          <BellOff className="h-4 w-4" />
          <span className="hidden sm:inline">Push unavailable</span>
        </Button>
      );
    }

    if (iconOnly) {
      if (status === "denied") {
        return (
          <button
            type="button"
            disabled
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] opacity-50",
              className
            )}
            aria-label="Notifications blocked in browser"
            title="Notifications blocked in browser settings"
          >
            <BellOff className="h-4 w-4" />
          </button>
        );
      }

      if (status === "enabled") {
        return (
          <button
            type="button"
            onClick={() => void unsubscribe()}
            disabled={busy}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50",
              className
            )}
            aria-label="Desktop notifications on — click to turn off"
            title="Notifications on — click to turn off"
          >
            <BellRing className={cn("h-4 w-4", busy && "animate-pulse")} />
          </button>
        );
      }

      return (
        <button
          type="button"
          onClick={() => void subscribe()}
          disabled={busy}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50",
            className
          )}
          aria-label="Enable desktop notifications"
          title="Enable desktop notifications"
        >
          <BellRing className={cn("h-4 w-4", busy && "animate-pulse")} />
        </button>
      );
    }

    if (status === "denied") {
      return (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled
          className={className}
          title="Enable notifications in your browser settings"
        >
          <BellOff className="h-4 w-4" />
          <span className="hidden sm:inline">Blocked</span>
        </Button>
      );
    }

    if (status === "enabled") {
      return (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={className}
          onClick={() => void unsubscribe()}
          isLoading={busy}
          title="Click to turn off desktop notifications"
        >
          <BellRing className="h-4 w-4 text-emerald-500" />
          <span className="hidden sm:inline">Notifications on</span>
        </Button>
      );
    }

    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={className}
        onClick={() => void subscribe()}
        isLoading={busy}
      >
        <BellRing className="h-4 w-4" />
        <span className="hidden sm:inline">Enable notifications</span>
        <span className="sm:hidden">Notify</span>
      </Button>
    );
  }

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
      <p className="text-sm text-[var(--muted)]">
        Push notifications are not supported in this browser.
      </p>
    );
  }

  if (status === "unconfigured") {
    return (
      <p className="text-sm text-[var(--muted)]">
        Firebase Cloud Messaging is not configured on this server. Set the Firebase
        env vars listed in .env.example.
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-sm text-[var(--muted)]">
        Notifications are blocked in your browser. Allow them in site settings to enable push.
      </p>
    );
  }

  if (status === "enabled") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-emerald-600 dark:text-emerald-400">
          Push notifications enabled
        </span>
        <Button variant="secondary" size="sm" onClick={() => void sendTest()} isLoading={busy}>
          Send test
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void unsubscribe()} isLoading={busy}>
          <BellOff className="h-4 w-4" />
          Disable
        </Button>
      </div>
    );
  }

  return (
    <Button variant="secondary" size="sm" onClick={() => void subscribe()} isLoading={busy}>
      <BellRing className="h-4 w-4" />
      Enable Push & test
    </Button>
  );
}
