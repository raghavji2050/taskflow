"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ensureServiceWorker,
  getPushEnrollmentStatus,
  isPushSupported,
  markPushPrompted,
  showPushEnrollmentToast,
  startForegroundSync,
  wasPushPrompted,
} from "@/lib/push-client";

export function PushBootstrap() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!isPushSupported() || status !== "authenticated" || !userId) return;

    let stopSync = () => {};
    void ensureServiceWorker()
      .then(() => {
        stopSync = startForegroundSync(userId);
      })
      .catch(() => {});

    return () => stopSync();
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
