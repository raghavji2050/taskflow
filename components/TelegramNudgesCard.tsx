"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type TelegramStatus = {
  configured: boolean;
  botUsername: string | null;
  linked: boolean;
  linkedAt: string | null;
  telegramDigestEnabled: boolean;
};

export function TelegramNudgesCard() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const load = () =>
    fetch("/api/user/telegram")
      .then((r) => r.json())
      .then((d) => d.telegram && setStatus(d.telegram))
      .catch(() => {});

  useEffect(() => {
    void load();
  }, []);

  const call = async (method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch("/api/user/telegram", {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      return data;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    const data = await call("POST");
    if (data?.url) {
      setLinkUrl(data.url);
      window.open(data.url, "_blank", "noopener,noreferrer");
    }
  };

  if (!status) return null;

  return (
    <section data-testid="telegram-nudges-settings">
      <Card className="mb-6 p-6">
        <h2 className="section-label mb-2">Telegram daily digest &amp; reply-to-update</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Get your top tasks on Telegram every day. Reply <strong>done</strong>,{" "}
          <strong>blocked &lt;reason&gt;</strong> or <strong>snooze 2d</strong> and TaskFlow updates the task — no
          need to open the app.
        </p>

        {!status.configured ? (
          <p className="text-sm text-[var(--muted)]">Telegram isn&apos;t set up on this server yet.</p>
        ) : status.linked ? (
          <div className="space-y-3">
            <p className="text-sm">
              ✅ Connected{status.botUsername ? ` to @${status.botUsername}` : ""}
              {status.linkedAt ? ` since ${new Date(status.linkedAt).toLocaleDateString()}` : ""}.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="telegram-digest-toggle"
                checked={status.telegramDigestEnabled}
                disabled={busy}
                onChange={async (e) => {
                  const data = await call("PATCH", { telegramDigestEnabled: e.target.checked });
                  if (data?.telegram) setStatus(data.telegram);
                }}
                className="h-4 w-4 rounded accent-[var(--accent)]"
              />
              Send my daily digest on Telegram
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const data = await call("DELETE");
                if (data?.telegram) {
                  setStatus(data.telegram);
                  toast.success("Telegram disconnected");
                }
              }}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button size="sm" disabled={busy} onClick={() => void connect()} data-testid="telegram-connect">
              Connect Telegram
            </Button>
            {linkUrl && (
              <p className="text-xs text-[var(--muted)]">
                Tap <strong>Start</strong> in Telegram, then{" "}
                <button type="button" className="underline" onClick={() => void load()}>
                  refresh
                </button>
                . Didn&apos;t open?{" "}
                <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  Open the bot
                </a>
                .
              </p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
