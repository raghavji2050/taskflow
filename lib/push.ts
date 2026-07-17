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

function toDataPayload(userId: string, payload: PushPayload): Record<string, string> {
  const safeBody = payload.body?.trim() || "New message";
  const data: Record<string, string> = {
    userId,
    title: payload.title || "TaskFlow",
    body: safeBody,
    url: payload.url ?? "/dashboard",
  };
  if (payload.icon) data.icon = payload.icon;
  if (payload.conversationId) data.conversationId = payload.conversationId;
  if (payload.messageId) data.messageId = payload.messageId;
  if (payload.test) data.test = "true";
  return data;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      if (process.env.PUSH_DEBUG === "1") {
        console.warn("[push] Firebase Admin not configured — cannot send push");
      }
      return;
    }

    const tokens = await prisma.pushSubscription.findMany({ where: { userId } });
    if (tokens.length === 0) {
      if (process.env.PUSH_DEBUG === "1") {
        console.warn(`[push] No FCM tokens for user ${userId}`);
      }
      return;
    }

    const data = toDataPayload(userId, payload);
    // Data-only so the service worker / onMessage always control display.
    const response = await messaging.sendEachForMulticast({
      tokens: tokens.map((t) => t.fcmToken),
      data,
      webpush: {
        fcmOptions: {
          link: payload.url ?? "/dashboard",
        },
      },
    });

    const toDelete: string[] = [];
    response.responses.forEach((result, index) => {
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
  } catch (error) {
    console.warn(`[push] sendPushToUser failed for ${userId}:`, error);
  }
}

/** Send to every token for the user; returns how many succeeded. Throws if none and errors exist. */
export async function sendTestPushToUser(userId: string): Promise<{ sent: number; error?: string }> {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    throw new Error("Push notifications are not configured on the server");
  }

  const tokens = await prisma.pushSubscription.findMany({ where: { userId } });
  if (tokens.length === 0) {
    return { sent: 0, error: "No push subscription found" };
  }

  const data = toDataPayload(userId, {
    title: "TaskFlow notifications enabled",
    body: "You'll now get a message here when someone messages you.",
    url: "/dashboard/messages",
    test: true,
  });

  const response = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.fcmToken),
    data,
    webpush: {
      fcmOptions: { link: "/dashboard/messages" },
    },
  });

  const toDelete: string[] = [];
  let lastError: string | undefined;
  response.responses.forEach((result, index) => {
    if (result.success) return;
    lastError = result.error?.message ?? result.error?.code ?? "FCM delivery failed";
    console.warn("[push/test] delivery failed", lastError, result.error);
    if (isPermanentTokenError(result.error?.code)) {
      toDelete.push(tokens[index].id);
    }
  });

  if (toDelete.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: toDelete } } });
  }

  return { sent: response.successCount, error: response.successCount === 0 ? lastError : undefined };
}
