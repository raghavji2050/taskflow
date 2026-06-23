import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { isPushForegroundActive } from "@/lib/push-foreground";

export function getVapidPublicKey(): string | null {
  return (
    process.env.VAPID_PUBLIC_KEY ??
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
    null
  );
}

export function isPushConfigured(): boolean {
  return !!(getVapidPublicKey() && process.env.VAPID_PRIVATE_KEY);
}

export function configureWebPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@taskflow.app",
    publicKey,
    privateKey
  );
  return true;
}

export async function sendPushToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: {
    userId: string;
    title: string;
    body: string;
    url?: string;
    conversationId?: string;
    messageId?: string;
  }
) {
  if (!configureWebPush()) {
    throw new Error("Push notifications are not configured on the server");
  }

  const safeBody = payload.body?.trim() || "New message";

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify({ ...payload, body: safeBody })
  );
}

export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    url?: string;
    conversationId?: string;
    messageId?: string;
  }
) {
  try {
    if (!configureWebPush()) {
      if (process.env.PUSH_DEBUG === "1") {
        console.warn("[push] VAPID not configured — cannot send push");
      }
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushForegroundAt: true },
    });
    if (isPushForegroundActive(user?.pushForegroundAt)) {
      if (process.env.PUSH_DEBUG === "1") {
        console.info(`[push] Skipped send for foreground user ${userId}`);
      }
      return;
    }

    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) {
      if (process.env.PUSH_DEBUG === "1") {
        console.warn(`[push] No subscriptions for user ${userId}`);
      }
      return;
    }

    for (const sub of subs) {
      try {
        await sendPushToSubscription(sub, { userId, ...payload });
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? (error as { statusCode?: number }).statusCode
            : undefined;
        console.warn(
          `[push] Failed to send to subscription ${sub.id} (user ${userId})`,
          statusCode ? `status ${statusCode}` : error
        );
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      }
    }
  } catch (error) {
    console.warn(`[push] sendPushToUser failed for ${userId}:`, error);
  }
}
