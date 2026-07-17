"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteToken, getToken, onMessage } from "firebase/messaging";
import {
  getFirebaseMessaging,
  getFirebaseWebVapidKey,
  isFirebaseWebConfigured,
} from "@/lib/firebase-client";

const TOKEN_STORAGE_KEY = "taskflow:fcm-token";

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
      "Also verify Firebase Cloud Messaging is configured on the server."
    );
  }
  if (name === "NotAllowedError") {
    return "Notifications are blocked in your browser settings.";
  }
  return message || "Failed to enable push notifications";
}

async function saveFcmToken(fcmToken: string) {
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fcmToken,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Server rejected push subscription"
    );
  }

  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, fcmToken);
  } catch {
    // ignore
  }
}

export async function ensureServiceWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  // Warm Firebase Messaging inside the SW (fetches public config).
  try {
    registration.active?.postMessage({ type: "taskflow:firebase-config" });
    navigator.serviceWorker.controller?.postMessage({ type: "taskflow:firebase-config" });
  } catch {
    // ignore
  }

  return registration;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext
  );
}

export type PushEnrollmentStatus = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  pushConfigured: boolean;
  serverSubscribed: boolean;
  browserSubscribed: boolean;
  /** FCM push is fully set up on this browser */
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

  // Client-only check when API is unreachable
  if (!pushConfigured) {
    pushConfigured = isFirebaseWebConfigured();
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

export async function subscribeToPush(opts?: { forceRefresh?: boolean }): Promise<boolean> {
  if (!isPushSupported()) return false;

  if (!isFirebaseWebConfigured()) {
    throw new Error(
      "Push is not configured on the server. Add Firebase Cloud Messaging env vars (see .env.example)."
    );
  }

  const vapidKey = getFirebaseWebVapidKey();
  if (!vapidKey) {
    throw new Error("NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await ensureServiceWorker();
  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    throw new Error("Firebase Messaging is not supported in this browser.");
  }

  if (opts?.forceRefresh) {
    try {
      await deleteToken(messaging);
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  let token: string;
  try {
    token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (error) {
    throw new Error(getPushSubscribeErrorMessage(error));
  }

  if (!token) {
    throw new Error("Failed to get an FCM registration token");
  }

  await saveFcmToken(token);
  return true;
}

/** Subscribe via FCM, persist token, and send a test OS notification. */
export async function enablePushWithTest(): Promise<{ ok: boolean; error?: string }> {
  const subscribed = await subscribeToPush();
  if (!subscribed) {
    return { ok: false, error: "Permission denied or push is not configured on the server" };
  }

  let test = await sendTestPushNotification();
  if (!test.ok) {
    const retried = await subscribeToPush({ forceRefresh: true });
    if (retried) {
      test = await sendTestPushNotification();
    }
  }

  if (!test.ok) {
    return {
      ok: false,
      error:
        test.error ??
        "Subscribed but the test notification failed. Check Firebase Admin credentials.",
    };
  }

  window.dispatchEvent(new CustomEvent("taskflow:push-status"));
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }

  const messaging = await getFirebaseMessaging();
  if (messaging) {
    try {
      if (!token) {
        const vapidKey = getFirebaseWebVapidKey();
        const registration = await ensureServiceWorker();
        if (vapidKey) {
          token = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registration,
          });
        }
      }
      await deleteToken(messaging);
    } catch {
      // ignore
    }
  }

  await fetch("/api/notifications/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token ? { fcmToken: token } : {}),
  });

  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }

  window.dispatchEvent(new CustomEvent("taskflow:push-status"));
}

/** True when this browser has a stored FCM token (SW delivers background OS notifications). */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) return true;
    const messaging = await getFirebaseMessaging();
    if (!messaging) return false;
    const vapidKey = getFirebaseWebVapidKey();
    if (!vapidKey) return false;
    const registration = await ensureServiceWorker();
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (token) {
      try {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } catch {
        // ignore
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Refresh FCM token with the server when already enrolled (e.g. on focus). */
export async function refreshPushTokenIfEnrolled(): Promise<void> {
  if (!isPushSupported() || !isFirebaseWebConfigured()) return;
  if (Notification.permission !== "granted") return;

  try {
    const messaging = await getFirebaseMessaging();
    const vapidKey = getFirebaseWebVapidKey();
    if (!messaging || !vapidKey) return;
    const registration = await ensureServiceWorker();
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;
    await saveFcmToken(token);
  } catch {
    // ignore refresh failures
  }
}

/**
 * Foreground FCM handler: in-app toast for normal pushes; OS notification for tests.
 * Background/closed tabs are handled by the service worker.
 */
export function startForegroundMessageListener(): () => void {
  if (typeof window === "undefined") return () => {};

  let unsubscribe: (() => void) | undefined;
  let cancelled = false;

  void (async () => {
    const messaging = await getFirebaseMessaging();
    if (!messaging || cancelled) return;

    unsubscribe = onMessage(messaging, (payload) => {
      const data = payload.data ?? {};
      const title = data.title || payload.notification?.title || "TaskFlow";
      const body = data.body || payload.notification?.body || "New notification";
      const isTest = data.test === "true";

      // Foreground: realtime already drives in-app toasts. Only surface OS/toast for tests.
      if (!isTest) return;

      if (Notification.permission === "granted") {
        try {
          new Notification(title, {
            body,
            icon: data.icon || "/icon-192.png",
            tag: "taskflow-test",
          });
          return;
        } catch {
          // fall through to toast
        }
      }
      toast.success(title, { description: body });
    });
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
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
        description: "Add Firebase Cloud Messaging credentials to environment variables.",
        duration: 10_000,
      });
      return;
    }

    toast("Enable desktop notifications?", {
      description: "Get alerts via FCM when this tab is in the background or closed.",
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
