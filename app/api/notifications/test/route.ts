import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { isPushConfigured, sendPushToSubscription } from "@/lib/push";

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
        lastError =
          error instanceof Error ? error.message : "Push delivery failed — check VAPID keys";
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
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
