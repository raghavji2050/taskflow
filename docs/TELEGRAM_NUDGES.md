# Telegram daily digest + reply-to-update

Each user can link Telegram in **Settings → Telegram daily digest & reply-to-update**. The daily cron
(`/api/cron/reminders`, 08:00 UTC) sends a numbered top-5 list. The user replies without opening the app:

| Reply | Effect |
| --- | --- |
| `done` / `1 done` / `done 1` | Marks the task completed (clears any blocker) |
| `blocked <reason>` / `2 blocked waiting on client` | Saves `blockerNote` + `blockedAt`, in-app alert to workspace owners/admins and the task creator |
| `snooze` / `snooze 3d` / `3 snooze 3d` / `+2d` | Moves the due date forward (default 2 days, 1–14) |
| `help`, `/unlink` | Command list / stop messages |

A number picks the task from the digest being replied to (or the latest digest from the last 3 days).
Every update re-checks that the user can still edit the task. Parsing lives in `lib/nudge-reply-parser.ts`
and is channel-agnostic, so WhatsApp can reuse it later.

## Env vars

- `TELEGRAM_BOT_TOKEN`: from @BotFather. If unset, everything no-ops (cron, settings show "not set up").
- `TELEGRAM_WEBHOOK_SECRET`: random string (A-Z, a-z, 0-9, `_`, `-`). The webhook returns 401 without it.
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`: bot username without `@`, used for the `t.me/<bot>?start=<token>` link.

## Register the webhook (once)

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d url=https://taskflow-vault.vercel.app/api/telegram/webhook -d secret_token=$TELEGRAM_WEBHOOK_SECRET -d 'allowed_updates=["message"]'
```
