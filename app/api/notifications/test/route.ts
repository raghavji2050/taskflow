import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { isPushConfigured, sendPushToSubscription } from "@/lib/push";

function formatPushDeliveryError(error: unknown): string {
  const statusCode =
    error && typeof error === "object" && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : undefined;
  const body =
    error && typeof error === "object" && "body" in error
      ? String((error as { body?: unknown }).body ?? "")
      : "";
  const message = error instanceof Error ? error.message : "Push delivery failed";

  if (statusCode === 401 || statusCode === 403) {
    return (
      `Push rejected (${statusCode}): browser subscription does not match server VAPID keys. ` +
      "Click Enable again (we will refresh the subscription), or run npm run generate:vapid and restart the server."
    );
  }
  if (statusCode === 404 || statusCode === 410) {
    return `Push subscription expired (${statusCode}). Enable notifications again.`;
  }
  if (statusCode) {
    return `Push service error ${statusCode}${body ? `: ${body.slice(0, 200)}` : ""}`;
  }
  if (/unexpected response code/i.test(message)) {
    return (
      "Push service rejected the notification (likely a stale subscription or VAPID key mismatch). " +
      "Enable notifications again to refresh."
    );
  }
  return message || "Push delivery failed — check VAPID keys";
}

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!isPushConfigured()) {
      return NextResponse.json({ error: "Push not configured" }, { status: 503 });
    }

    const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
    if (subs.length === 0) {
      return NextResponse.json({ error: "No push subscription found" }, { status: 400 });
    }

    let sent = 0;
    let lastError: string | undefined;
    for (const sub of subs) {
      try {
        await sendPushToSubscription(sub, {
          userId: user.id,
          title: "TaskFlow notifications enabled",
          body: "You'll now get a message here when someone messages you.",
          url: "/dashboard/messages",
          test: true,
        });
        sent++;
      } catch (error) {
        lastError = formatPushDeliveryError(error);
        console.warn("[push/test] delivery failed", lastError, error);
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }

    if (sent === 0) {
      return NextResponse.json(
        { error: lastError ?? "Failed to deliver test notification" },
        { status: 502 }
      );
    }

    return NextResponse.json({ message: "Test notification sent", sent });
  } catch (error) {
    return handleApiError(error);
  }
}
