"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PUSH_FOREGROUND_HEARTBEAT_MS } from "@/lib/push-foreground";

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function getVapidPublicKey(): Promise<string | null> {
  // Prefer the live server key so it always matches VAPID_PRIVATE_KEY (avoids stale build-time env).
  try {
    const res = await fetch("/api/notifications/vapid-key");
    if (res.ok) {
      const data = (await res.json()) as { publicKey?: string | null; configured?: boolean };
      if (data.publicKey) return data.publicKey;
      if (!data.configured) return null;
    }
  } catch {
    // fall through to build-time key
  }
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  }
  return null;
}

export function parseVapidPublicKey(base64String: string): Uint8Array {
  const key = base64String.trim();
  if (!key) {
    throw new Error("Push is not configured on the server. Ask an admin to run: npm run generate:vapid");
  }
  let bytes: Uint8Array;
  try {
    bytes = urlBase64ToUint8Array(key);
  } catch {
    throw new Error("Invalid VAPID public key. Regenerate keys with: npm run generate:vapid");
  }
  if (bytes.length !== 65) {
    throw new Error(
      `Invalid VAPID public key length (${bytes.length}, expected 65). Regenerate with: npm run generate:vapid`
    );
  }
  return bytes;
}

export function getPushSubscribeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message && !error.message.includes("push service")) {
    return error.message;
  }
  const name =
    error && typeof error === "object" && "name" in error ? String((error as { name: string }).name) : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "AbortError" || message.includes("push service error")) {
    return (
      "Browser push registration failed. On Brave: open brave://settings/privacy, enable " +
      '"Use Google services for push messaging", allow notifications for this site, then retry. ' +
      "Also verify VAPID keys are set on the server (npm run generate:vapid) and restart the app."
    );
  }
  if (name === "NotAllowedError") {
    return "Notifications are blocked in your browser settings.";
  }
  return message || "Failed to enable push notifications";
}

async function savePushSubscription(subscription: PushSubscription) {
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

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Server rejected push subscription"
    );
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) {
    throw new Error("Push is not configured on the server. Run: npm run generate:vapid");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const applicationServerKey = parseVapidPublicKey(vapidKey);
  const registration = await ensureServiceWorker();
  let subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    try {
      await savePushSubscription(subscription);
      return true;
    } catch {
      try {
        await subscription.unsubscribe();
      } catch {
        // ignore
      }
      subscription = null;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });
  } catch (error) {
    throw new Error(getPushSubscribeErrorMessage(error));
  }

  await savePushSubscription(subscription);
  return true;
}

export async function ensureServiceWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.isSecureContext
  );
}

export type PushEnrollmentStatus = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  pushConfigured: boolean;
  serverSubscribed: boolean;
  browserSubscribed: boolean;
  /** VAPID push is fully set up on this browser */
  enrolled: boolean;
};

export async function getPushEnrollmentStatus(): Promise<PushEnrollmentStatus> {
  if (!isPushSupported()) {
    return {
      supported: false,
      permission: "unsupported",
      pushConfigured: false,
      serverSubscribed: false,
      browserSubscribed: false,
      enrolled: false,
    };
  }

  let pushConfigured = false;
  let serverSubscribed = false;
  try {
    const res = await fetch("/api/notifications/subscribe");
    if (res.ok) {
      const data = (await res.json()) as { pushConfigured?: boolean; subscribed?: boolean };
      pushConfigured = Boolean(data.pushConfigured);
      serverSubscribed = Boolean(data.subscribed);
    }
  } catch {
    // ignore
  }

  const browserSubscribed = await hasActivePushSubscription();
  const permission = Notification.permission;
  const enrolled =
    pushConfigured &&
    serverSubscribed &&
    browserSubscribed &&
    permission === "granted";

  return {
    supported: true,
    permission,
    pushConfigured,
    serverSubscribed,
    browserSubscribed,
    enrolled,
  };
}

export async function isPushSubscribed(): Promise<boolean> {
  const status = await getPushEnrollmentStatus();
  return status.enrolled;
}

export async function sendTestPushNotification(): Promise<{
  ok: boolean;
  sent: number;
  error?: string;
}> {
  const res = await fetch("/api/notifications/test", { method: "POST" });
  const data = (await res.json().catch(() => ({}))) as { error?: string; sent?: number };
  if (!res.ok) {
    return { ok: false, sent: 0, error: data.error ?? "Test push failed" };
  }
  const sent = data.sent ?? 0;
  if (sent === 0) {
    return {
      ok: false,
      sent: 0,
      error: "No active push subscription. Try enabling notifications again.",
    };
  }
  return { ok: true, sent };
}

/** Subscribe via VAPID, persist to server, and send a test OS notification. */
export async function enablePushWithTest(): Promise<{ ok: boolean; error?: string }> {
  const subscribed = await subscribeToPush();
  if (!subscribed) {
    return { ok: false, error: "Permission denied or push is not configured on the server" };
  }

  const test = await sendTestPushNotification();
  if (!test.ok) {
    return {
      ok: false,
      error:
        test.error ??
        "Subscribed but the test notification failed. Check VAPID keys in server environment variables.",
    };
  }

  window.dispatchEvent(new CustomEvent("taskflow:push-status"));
  return { ok: true };
}

/** True when this browser has an active Web Push subscription (SW delivers OS notifications). */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

export function usePushEnrollment() {
  const [needsEnable, setNeedsEnable] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isPushSupported()) {
      setNeedsEnable(false);
      setPushConfigured(false);
      setLoading(false);
      return;
    }
    if (Notification.permission === "denied") {
      setNeedsEnable(false);
      setLoading(false);
      return;
    }
    const status = await getPushEnrollmentStatus();
    setPushConfigured(status.pushConfigured);
    setNeedsEnable(!status.enrolled);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onPushStatus = () => void refresh();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    window.addEventListener("taskflow:push-status", onPushStatus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("taskflow:push-status", onPushStatus);
    };
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const result = await enablePushWithTest();
      if (result.ok) {
        toast.success("Desktop notifications enabled — check for a test alert");
        setNeedsEnable(false);
        return true;
      }
      toast.error(result.error ?? "Could not enable notifications");
      await refresh();
      return false;
    } catch (error) {
      toast.error(getPushSubscribeErrorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { needsEnable, pushConfigured, loading, busy, enable, refresh };
}

const PROMPT_KEY = "taskflow:push-prompted";

export function wasPushPrompted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(PROMPT_KEY) === "1";
}

export function markPushPrompted() {
  localStorage.setItem(PROMPT_KEY, "1");
}

export function showPushEnrollmentToast() {
  void getPushEnrollmentStatus().then((status) => {
    if (!status.pushConfigured) {
      toast.error("Push notifications are not configured on this server", {
        description: "Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to environment variables.",
        duration: 10_000,
      });
      return;
    }

    toast("Enable desktop notifications?", {
      description: "Get chat alerts via Web Push (VAPID) when this tab is in the background.",
      duration: 15_000,
      onDismiss: () => markPushPrompted(),
      action: {
        label: "Enable",
        onClick: () => {
          markPushPrompted();
          void enablePushWithTest()
            .then((result) => {
              if (result.ok) {
                toast.success("Desktop notifications enabled — check for a test alert");
              } else {
                toast.error(result.error ?? "Could not enable notifications");
              }
            })
            .catch((error) => toast.error(getPushSubscribeErrorMessage(error)));
        },
      },
    });
  });
}

/** Tell the service worker and server whether this tab is in the foreground. */
function reportForegroundState(userId: string, visible: boolean) {
  const body = JSON.stringify({ visible });

  // sendBeacon survives tab close; keepalive fetch is a fallback.
  if (!visible && typeof navigator.sendBeacon === "function") {
    const sent = navigator.sendBeacon(
      "/api/notifications/foreground",
      new Blob([body], { type: "application/json" })
    );
    if (sent) return;
  }

  void fetch("/api/notifications/foreground", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: !visible,
  });
}

export async function syncForegroundToServiceWorker(userId?: string) {
  if (!("serviceWorker" in navigator)) return;

  const visible = !document.hidden;
  const payload = {
    type: "taskflow:visibility",
    visible,
    userId: userId ?? null,
  };

  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage(payload);
  } catch {
    // ignore
  }
  navigator.serviceWorker.controller?.postMessage(payload);

  if (userId) {
    reportForegroundState(userId, visible);
  }
}

export function startForegroundSync(userId?: string): () => void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }

  const send = () => {
    if (userId) void syncForegroundToServiceWorker(userId);
  };

  const onController = () => send();
  navigator.serviceWorker.addEventListener("controllerchange", onController);

  send();
  document.addEventListener("visibilitychange", send);
  window.addEventListener("pagehide", send);

  const heartbeat = window.setInterval(() => {
    if (!document.hidden && userId) void syncForegroundToServiceWorker(userId);
  }, PUSH_FOREGROUND_HEARTBEAT_MS);

  return () => {
    clearInterval(heartbeat);
    navigator.serviceWorker.removeEventListener("controllerchange", onController);
    document.removeEventListener("visibilitychange", send);
    window.removeEventListener("pagehide", send);
    navigator.serviceWorker.controller?.postMessage({
      type: "taskflow:visibility",
      visible: false,
      userId: userId ?? null,
    });
    if (userId) {
      reportForegroundState(userId, false);
    }
  };
}
