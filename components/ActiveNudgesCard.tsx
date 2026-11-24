"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";

export function ActiveNudgesCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/nudge-prefs")
      .then((r) => r.json())
      .then((d) => {
        if (d.prefs) setEnabled(d.prefs.activeNudgesEnabled);
      })
      .catch(() => {});
  }, []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    setEnabled(next);
    try {
      const res = await fetch("/api/user/nudge-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeNudgesEnabled: next }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success(next ? "Nudges turned on" : "Nudges turned off");
    } catch {
      setEnabled(!next);
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (enabled === null) return null;

  return (
    <section data-testid="active-nudges-settings">
      <Card className="mb-6 p-6">
        <h2 className="section-label mb-2">Nudges</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          TaskFlow reminds you when a task goes overdue or has had no update for 3 days, and sends
          a weekly summary on Pro workspaces.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="active-nudges-toggle"
            checked={enabled}
            disabled={saving}
            onChange={(e) => void toggle(e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--accent)]"
          />
          Overdue alerts, stale-task nudges and weekly summary
        </label>
      </Card>
    </section>
  );
}
