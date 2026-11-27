import { timingSafeEqual } from "crypto";

/**
 * Minimal Telegram Bot API client (free). Every call no-ops when TELEGRAM_BOT_TOKEN is unset,
 * so builds, tests and the daily cron never break without Telegram configured.
 */

const API_BASE = "https://api.telegram.org";
const MAX_MESSAGE_LENGTH = 4000;

export function isTelegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export function telegramBotUsername(): string | null {
  const name = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return name && /^[A-Za-z0-9_]{5,64}$/.test(name) ? name : null;
}

export function telegramDeepLink(token: string, username = telegramBotUsername()): string | null {
  return username ? `https://t.me/${username}?start=${encodeURIComponent(token)}` : null;
}

/** Constant-time check of the `x-telegram-bot-api-secret-token` header. Fails closed. */
export function verifyTelegramSecret(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type TelegramSendResult = { ok: boolean; messageId: string | null };

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyToMessageId?: string | number | null
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, messageId: null };
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: text.slice(0, MAX_MESSAGE_LENGTH),
      disable_web_page_preview: true,
    };
    if (replyToMessageId) {
      body.reply_parameters = { message_id: Number(replyToMessageId), allow_sending_without_reply: true };
    }
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: { message_id?: number } } | null;
    if (!res.ok || !data?.ok) {
      console.warn("[telegram] sendMessage failed", res.status);
      return { ok: false, messageId: null };
    }
    return { ok: true, messageId: data.result?.message_id != null ? String(data.result.message_id) : null };
  } catch (error) {
    console.warn("[telegram] sendMessage error", error instanceof Error ? error.message : "unknown");
    return { ok: false, messageId: null };
  }
}

export type TelegramDigestTask = { title: string; reason?: string | null };

/** Plain-text numbered digest (no parse_mode, so task titles never need escaping). */
export function formatTelegramDailyDigest(userName: string, tasks: TelegramDigestTask[]): string {
  const first = (userName || "there").trim().split(/\s+/)[0] || "there";
  if (tasks.length === 0) return `Hi ${first}, nothing open on your TaskFlow list today. 🎉`;
  const lines = tasks.map((t, i) => {
    const title = t.title.replace(/\s+/g, " ").trim().slice(0, 120);
    return `${i + 1}. ${title}${t.reason ? ` (${t.reason})` : ""}`;
  });
  const example = tasks.length > 1 ? "1 done · 2 blocked <reason> · 3 snooze 2d" : "done · blocked <reason> · snooze 2d";
  return [
    `☀️ Hi ${first}, your TaskFlow top ${tasks.length} today:`,
    "",
    ...lines,
    "",
    `Reply to update without opening the app: ${example}`,
    "Send help for all commands.",
  ].join("\n");
}
