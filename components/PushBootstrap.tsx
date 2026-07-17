"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ensureServiceWorker,
  getPushEnrollmentStatus,
  isPushSupported,
  markPushPrompted,
  refreshPushTokenIfEnrolled,
  showPushEnrollmentToast,
  startForegroundMessageListener,
  wasPushPrompted,
} from "@/lib/push-client";

export function PushBootstrap() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type !== "taskflow:notification-open") return;
      const url = typeof event.data.url === "string" ? event.data.url : null;
      if (!url) return;
      router.push(url);
    };

    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onSwMessage);
  }, [router]);

  useEffect(() => {
    if (!isPushSupported() || status !== "authenticated" || !userId) return;

    let stopForeground = () => {};
    void ensureServiceWorker()
      .then(() => {
        stopForeground = startForegroundMessageListener();
        void refreshPushTokenIfEnrolled();
      })
      .catch(() => {});

    const onFocus = () => void refreshPushTokenIfEnrolled();
    window.addEventListener("focus", onFocus);

    return () => {
      stopForeground();
      window.removeEventListener("focus", onFocus);
    };
  }, [status, userId]);

  useEffect(() => {
    if (!isPushSupported()) return;

    const prompt = async () => {
      const status = await getPushEnrollmentStatus();
      if (status.enrolled) {
        markPushPrompted();
        return;
      }

      if (Notification.permission === "denied") return;

      const onMessages = pathname?.startsWith("/dashboard/messages");
      if (!onMessages && wasPushPrompted()) return;

      showPushEnrollmentToast();
    };

    const delayMs = pathname?.startsWith("/dashboard/messages") ? 1000 : 2500;
    const timer = setTimeout(() => void prompt(), delayMs);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
