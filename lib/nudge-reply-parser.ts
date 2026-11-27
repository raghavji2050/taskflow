/**
 * Channel-agnostic parser for reply-to-update nudges ("done", "2 blocked waiting on client", "snooze 3d").
 * Pure: no I/O, so Telegram today and WhatsApp later can share it.
 */

export const DEFAULT_SNOOZE_DAYS = 2;
export const MIN_SNOOZE_DAYS = 1;
export const MAX_SNOOZE_DAYS = 14;
export const MAX_BLOCKER_LENGTH = 500;

export type NudgeCommand =
  | { kind: "done"; index?: number }
  | { kind: "blocked"; index?: number; reason?: string }
  | { kind: "snooze"; index?: number; days: number }
  | { kind: "help" }
  | { kind: "start"; token?: string }
  | { kind: "unlink" }
  | { kind: "unknown" };

const DONE_WORDS = new Set(["done", "complete", "completed", "finished", "finish", "ho gaya", "hogaya", "✅"]);
const BLOCKED_WORDS = new Set(["blocked", "block", "blocker", "stuck"]);
const SNOOZE_WORDS = new Set(["snooze", "later", "postpone"]);
const HELP_WORDS = new Set(["help", "?", "commands"]);

export function clampSnoozeDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_SNOOZE_DAYS;
  return Math.min(MAX_SNOOZE_DAYS, Math.max(MIN_SNOOZE_DAYS, Math.round(days)));
}

function parseIndex(token: string | undefined): number | undefined {
  if (!token || !/^#?\d{1,2}[.)]?$/.test(token)) return undefined;
  const n = Number(token.replace(/[^\d]/g, ""));
  return n >= 1 ? n : undefined;
}

/** "2d", "+2d", "3 days", "3" → days; null when the text is not a duration. */
function parseDuration(text: string): number | null {
  const m = text.trim().match(/^\+?(\d{1,3})\s*(d|day|days|din)?$/i);
  return m ? clampSnoozeDays(Number(m[1])) : null;
}

export function parseNudgeReply(raw: string | null | undefined): NudgeCommand {
  let text = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) return { kind: "unknown" };

  // Telegram-style slash commands, optionally addressed to the bot ("/done@TaskFlowBot 2").
  const slash = text.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+(.*))?$/i);
  if (slash) {
    const cmd = slash[1].toLowerCase();
    const rest = slash[2]?.trim() ?? "";
    if (cmd === "start") return rest ? { kind: "start", token: rest.split(" ")[0] } : { kind: "start" };
    if (cmd === "unlink" || cmd === "stop") return { kind: "unlink" };
    if (cmd === "help") return { kind: "help" };
    text = `${cmd}${rest ? ` ${rest}` : ""}`;
  }

  const lower = text.toLowerCase();
  if (HELP_WORDS.has(lower)) return { kind: "help" };

  // Optional leading task number: "2 blocked ...", "#3 done", "1. snooze 2d".
  const parts = text.split(" ");
  const index = parseIndex(parts[0]);
  const body = index !== undefined ? parts.slice(1).join(" ") : text;
  const bodyLower = body.toLowerCase();

  // "+2d" / "2 +3d" shorthand for snooze.
  if (/^\+\d/.test(body)) {
    const days = parseDuration(body);
    if (days !== null) return { kind: "snooze", index, days };
  }

  for (const word of DONE_WORDS) {
    if (bodyLower === word) return { kind: "done", index };
    if (bodyLower.startsWith(`${word} `)) {
      const trailing = parseIndex(bodyLower.slice(word.length + 1).trim());
      if (trailing !== undefined && index === undefined) return { kind: "done", index: trailing };
    }
  }

  const [first, ...restWords] = body.split(" ");
  const keyword = first.toLowerCase().replace(/[:,.!]+$/, "");
  const rest = restWords.join(" ").trim();

  if (BLOCKED_WORDS.has(keyword)) {
    const reason = rest.replace(/^(on|by|:|-)\s+/i, "").slice(0, MAX_BLOCKER_LENGTH).trim();
    return reason ? { kind: "blocked", index, reason } : { kind: "blocked", index };
  }

  if (SNOOZE_WORDS.has(keyword)) {
    if (!rest) return { kind: "snooze", index, days: DEFAULT_SNOOZE_DAYS };
    const days = parseDuration(rest);
    if (days !== null) return { kind: "snooze", index, days };
    // "snooze 2 3d" → task 2, 3 days.
    const [maybeIndex, ...afterIndex] = rest.split(" ");
    const trailingIndex = parseIndex(maybeIndex);
    if (trailingIndex !== undefined && index === undefined) {
      const d = afterIndex.length ? parseDuration(afterIndex.join(" ")) : DEFAULT_SNOOZE_DAYS;
      if (d !== null) return { kind: "snooze", index: trailingIndex, days: d };
    }
    return { kind: "snooze", index, days: DEFAULT_SNOOZE_DAYS };
  }

  return { kind: "unknown" };
}

export const NUDGE_REPLY_HELP = [
  "Reply to your TaskFlow digest to update a task:",
  "• done  /  1 done",
  "• blocked waiting on client  /  2 blocked <reason>",
  "• snooze 2d  /  3 snooze 3d  /  +2d  (1-14 days)",
  "Reply directly to a single-task message, or start with the task number from the digest.",
  "/unlink stops Telegram messages.",
].join("\n");
