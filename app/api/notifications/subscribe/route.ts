import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { isPushConfigured } from "@/lib/push";
import { z } from "zod";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const count = await prisma.pushSubscription.count({ where: { userId: user.id } });
    return NextResponse.json({
      subscribed: count > 0,
      count,
      pushConfigured: isPushConfigured(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!isPushConfigured()) {
      return NextResponse.json(
        { error: "Push notifications are not configured. Run: npm run generate:vapid" },
        { status: 503 }
      );
    }

    const { endpoint, keys } = subscribeSchema.parse(await request.json());

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: user.id },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: user.id },
    });

    return NextResponse.json({ message: "Subscribed" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ message: "Unsubscribed" });
  } catch (error) {
    return handleApiError(error);
  }
}
