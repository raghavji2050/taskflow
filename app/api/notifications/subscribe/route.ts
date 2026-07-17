import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { isPushConfigured } from "@/lib/push";
import { z } from "zod";

const subscribeSchema = z.object({
  fcmToken: z.string().min(10).max(4096),
  userAgent: z.string().max(512).optional(),
});

const unsubscribeSchema = z.object({
  fcmToken: z.string().min(10).max(4096).optional(),
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
        {
          error:
            "Push notifications are not configured. Add Firebase Cloud Messaging env vars (see .env.example).",
        },
        { status: 503 }
      );
    }

    const body = subscribeSchema.parse(await request.json());
    const userAgent =
      body.userAgent?.slice(0, 512) ??
      request.headers.get("user-agent")?.slice(0, 512) ??
      null;

    await prisma.pushSubscription.upsert({
      where: { fcmToken: body.fcmToken },
      update: { userId: user.id, userAgent },
      create: { fcmToken: body.fcmToken, userId: user.id, userAgent },
    });

    return NextResponse.json({ message: "Subscribed" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const json = await request.json().catch(() => ({}));
    const { fcmToken } = unsubscribeSchema.parse(json);

    if (fcmToken) {
      await prisma.pushSubscription.deleteMany({
        where: { userId: user.id, fcmToken },
      });
    } else {
      await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    }

    return NextResponse.json({ message: "Unsubscribed" });
  } catch (error) {
    return handleApiError(error);
  }
}
