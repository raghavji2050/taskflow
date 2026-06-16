"use client";

import { toast } from "sonner";

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function getVapidPublicKey(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  }
  const res = await fetch("/api/notifications/vapid-key");
  const data = await res.json();
  return data.publicKey ?? null;
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

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

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

  return res.ok;
}

export async function isPushSubscribed(): Promise<boolean> {
  try {
    const res = await fetch("/api/notifications/subscribe");
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.subscribed);
  } catch {
    return false;
  }
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
  toast("Enable desktop notifications?", {
    description: "Get chat alerts when this tab is in the background.",
    duration: 12_000,
    onDismiss: () => markPushPrompted(),
    action: {
      label: "Enable",
      onClick: () => {
        markPushPrompted();
        void subscribeToPush().then((ok) => {
          if (ok) toast.success("Desktop notifications enabled");
          else toast.error("Could not enable notifications");
        });
      },
    },
  });
}

/** Tell the service worker and server whether this tab is in the foreground. */
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
    void fetch("/api/notifications/foreground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible }),
    });
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
  window.addEventListener("focus", send);
  window.addEventListener("blur", send);
  window.addEventListener("pagehide", send);

  const interval = setInterval(() => {
    if (userId) send();
  }, 4000);

  return () => {
    navigator.serviceWorker.removeEventListener("controllerchange", onController);
    document.removeEventListener("visibilitychange", send);
    window.removeEventListener("focus", send);
    window.removeEventListener("blur", send);
    window.removeEventListener("pagehide", send);
    clearInterval(interval);
    navigator.serviceWorker.controller?.postMessage({
      type: "taskflow:visibility",
      visible: false,
      userId: userId ?? null,
    });
    if (userId) {
      void fetch("/api/notifications/foreground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: false }),
        keepalive: true,
      });
    }
  };
}
