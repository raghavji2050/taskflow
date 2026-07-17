import { prisma } from "@/lib/prisma";
import { getFirebaseMessaging, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { isFirebaseWebConfigured } from "@/lib/firebase-config";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  conversationId?: string;
  messageId?: string;
  test?: boolean;
};

/** Push is ready when Admin can send and the web client can enroll. */
export function isPushConfigured(): boolean {
  return isFirebaseAdminConfigured() && isFirebaseWebConfigured();
}

const PERMANENT_FCM_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

function isPermanentTokenError(code: string | undefined): boolean {
  if (!code) return false;
  return PERMANENT_FCM_ERRORS.has(code) || /registration-token/i.test(code);
}

function appOrigin(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

function toAbsoluteUrl(pathOrUrl: string | undefined, fallback: string): string {
  const value = (pathOrUrl || fallback).trim();
  if (/^https?:\/\//i.test(value)) return value;
  const origin = appOrigin();
  return `${origin}${value.startsWith("/") ? value : `/${value}`}`;
}

function toDataPayload(userId: string, payload: PushPayload): Record<string, string> {
  const safeBody = payload.body?.trim() || "New message";
  const data: Record<string, string> = {
    userId,
    title: payload.title || "TaskFlow",
    body: safeBody,
    url: payload.url ?? "/dashboard",
    icon: toAbsoluteUrl(payload.icon, "/icon-192.png"),
  };
  if (payload.conversationId) data.conversationId = payload.conversationId;
  if (payload.messageId) data.messageId = payload.messageId;
  if (payload.test) data.test = "true";
  return data;
}

function buildMessage(userId: string, payload: PushPayload) {
  const data = toDataPayload(userId, payload);
  const link = toAbsoluteUrl(payload.url, "/dashboard");

  // Data-only payload: the service worker's onBackgroundMessage calls
  // showNotification. A top-level/webpush `notification` block makes FCM
  // auto-display (and can skip/race the SW when the app is fully closed).
  return {
    data,
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "86400",
      },
      fcmOptions: {
        link,
      },
    },
  };
}

async function deleteInvalidTokens(
  tokens: { id: string }[],
  responses: { success: boolean; error?: { code?: string; message?: string } }[],
  userId: string
) {
  const toDelete: string[] = [];
  responses.forEach((result, index) => {
    if (result.success) return;
    const code = result.error?.code;
    console.warn(
      `[push] FCM send failed for token ${tokens[index]?.id} (user ${userId}):`,
      code ?? result.error?.message
    );
    if (isPermanentTokenError(code)) {
      toDelete.push(tokens[index].id);
    }
  });
  if (toDelete.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: toDelete } } });
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.warn("[push] Firebase Admin not configured — cannot send push");
      return;
    }

    const tokens = await prisma.pushSubscription.findMany({ where: { userId } });
    if (tokens.length === 0) {
      console.warn(`[push] No FCM tokens for user ${userId}`);
      return;
    }

    const message = buildMessage(userId, payload);
    const response = await messaging.sendEachForMulticast({
      tokens: tokens.map((t) => t.fcmToken),
      ...message,
    });

    console.info(
      `[push] sent to user ${userId}: ${response.successCount}/${tokens.length} ok` +
        (response.failureCount ? `, ${response.failureCount} failed` : "")
    );

    await deleteInvalidTokens(tokens, response.responses, userId);
  } catch (error) {
    console.warn(`[push] sendPushToUser failed for ${userId}:`, error);
  }
}

/** Send to every token for the user; returns how many succeeded. */
export async function sendTestPushToUser(userId: string): Promise<{ sent: number; error?: string }> {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    throw new Error("Push notifications are not configured on the server");
  }

  const tokens = await prisma.pushSubscription.findMany({ where: { userId } });
  if (tokens.length === 0) {
    return { sent: 0, error: "No push subscription found" };
  }

  const message = buildMessage(userId, {
    title: "TaskFlow notifications enabled",
    body: "You'll now get a message here when someone messages you.",
    url: "/dashboard/messages",
    test: true,
  });

  const response = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.fcmToken),
    ...message,
  });

  let lastError: string | undefined;
  response.responses.forEach((result) => {
    if (result.success) return;
    lastError = result.error?.message ?? result.error?.code ?? "FCM delivery failed";
    console.warn("[push/test] delivery failed", lastError, result.error);
  });

  await deleteInvalidTokens(tokens, response.responses, userId);

  return { sent: response.successCount, error: response.successCount === 0 ? lastError : undefined };
}
