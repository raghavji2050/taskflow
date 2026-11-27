import { NextResponse } from "next/server";
import { verifyTelegramSecret } from "@/lib/telegram";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/telegram-nudges";

export const dynamic = "force-dynamic";

/**
 * Telegram Bot API webhook. Telegram sends `x-telegram-bot-api-secret-token` (set via setWebhook
 * secret_token); we reject everything else. Always 200 on valid requests so Telegram doesn't retry.
 */
export async function POST(request: Request) {
  if (!verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }
  try {
    await handleTelegramUpdate(update);
  } catch (error) {
    console.error("[telegram:webhook] failed", error instanceof Error ? error.message : "unknown");
  }
  return NextResponse.json({ ok: true });
}
