"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function getVapidPublicKey(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  }
  const res = await fetch("/api/notifications/vapid-key");
  const data = await res.json();
  return data.publicKey ?? null;
}

async function ensureServiceWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

export function PushSubscribe() {
  const [status, setStatus] = useState<"loading" | "idle" | "enabled" | "unsupported">("loading");
  const [busy, setBusy] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    try {
      const res = await fetch("/api/notifications/subscribe");
      const data = res.ok ? await res.json() : { subscribed: false };
      setStatus(data.subscribed ? "enabled" : "idle");
    } catch {
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      ensureServiceWorker().catch(() => {});
    }
    checkStatus();
  }, [checkStatus]);

  const subscribe = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push notifications are not supported in this browser");
      return;
    }

    if (!window.isSecureContext) {
      toast.error("Push requires HTTPS or localhost");
      return;
    }

    setBusy(true);
    try {
      const vapidKey = await getVapidPublicKey();
      if (!vapidKey) {
        toast.error("Push not configured on server. Ask admin to run: npm run generate:vapid");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notification permission denied");
        return;
      }

      const registration = await ensureServiceWorker();

      let subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        subscription = null;
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Invalid push subscription from browser");
      }

      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Failed to save subscription");
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
