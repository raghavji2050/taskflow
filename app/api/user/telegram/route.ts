import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createTelegramLink, getTelegramStatus, telegramPrefsSchema } from "@/lib/telegram-nudges";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ telegram: await getTelegramStatus(user.id) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Generate a one-time link token and a t.me deep link (/start <token>). */
export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const link = await createTelegramLink(user.id);
    if (!link) return NextResponse.json({ error: "Telegram is not set up on this server yet" }, { status: 503 });
    return NextResponse.json(link);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = telegramPrefsSchema.parse(await request.json());
    await prisma.user.update({ where: { id: user.id }, data });
    return NextResponse.json({ telegram: await getTelegramStatus(user.id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: null, telegramLinkToken: null, telegramLinkedAt: null },
    });
    return NextResponse.json({ telegram: await getTelegramStatus(user.id) });
  } catch (error) {
    return handleApiError(error);
  }
}
