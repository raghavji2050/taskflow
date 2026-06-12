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
    for (const sub of subs) {
      try {
        await sendPushToSubscription(sub, {
          title: "TaskFlow",
          body: "Push notifications are working!",
          url: "/dashboard",
        });
        sent++;
      } catch {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      }
    }

    return NextResponse.json({ message: "Test notification sent", sent });
  } catch (error) {
    return handleApiError(error);
  }
}
