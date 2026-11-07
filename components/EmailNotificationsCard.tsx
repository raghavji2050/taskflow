"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { EmailNotificationPrefs } from "@/lib/email-notification-prefs";

export function EmailNotificationsCard() {
  const [prefs, setPrefs] = useState<EmailNotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/email-prefs")
      .then((r) => r.json())
      .then((d) => {
        if (d.prefs) setPrefs(d.prefs);
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/email-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.prefs) setPrefs(data.prefs);
        toast.success("Email notification settings saved");
      } else {
        toast.error((await res.json()).error ?? "Could not save");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!prefs) return null;

  return (
    <section data-testid="email-notifications-settings">
      <Card className="mb-6 p-6">
        <h2 className="section-label mb-2">Email notifications</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Choose which emails TaskFlow sends you. In-app notifications are unchanged.
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="email-digest-toggle"
              checked={prefs.emailDigestEnabled}
              onChange={(e) =>
                setPrefs({ ...prefs, emailDigestEnabled: e.target.checked })
              }
              className="h-4 w-4 rounded accent-[var(--accent)]"
            />
            Daily digest (pending, overdue, ready to start)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="email-mention-toggle"
              checked={prefs.emailMentionEnabled}
              onChange={(e) =>
                setPrefs({ ...prefs, emailMentionEnabled: e.target.checked })
              }
              className="h-4 w-4 rounded accent-[var(--accent)]"
            />
            @Mention emails (task comments and chat)
          </label>
          <Button
            type="button"
            data-testid="email-prefs-save"
            onClick={() => void save()}
            isLoading={saving}
          >
            Save email settings
          </Button>
        </div>
      </Card>
    </section>
  );
}
