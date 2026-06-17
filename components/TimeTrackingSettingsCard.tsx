"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { TimeTrackingPrefs } from "@/lib/time-tracking-prefs";

export function TimeTrackingSettingsCard() {
  const [prefs, setPrefs] = useState<TimeTrackingPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/time-prefs")
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
      const res = await fetch("/api/user/time-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        toast.success("Time tracking settings saved");
      } else {
        toast.error((await res.json()).error ?? "Could not save");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!prefs) return null;

  return (
    <Card className="mb-6 p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Time tracking
      </h2>
      <div className="space-y-4">
        <Input
          label="Remind after running (hours, 0 = off)"
          type="number"
          min={0}
          max={24}
          value={prefs.runningReminderHours}
          onChange={(e) =>
            setPrefs({ ...prefs, runningReminderHours: Number(e.target.value) || 0 })
          }
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs.runningReminderEndOfDay}
            onChange={(e) =>
              setPrefs({ ...prefs, runningReminderEndOfDay: e.target.checked })
            }
            className="h-4 w-4 rounded accent-[var(--accent)]"
          />
          Remind at end of day
        </label>
        <Input
          label="End of day hour (0–23)"
          type="number"
          min={0}
          max={23}
          value={prefs.endOfDayHour}
          onChange={(e) =>
            setPrefs({ ...prefs, endOfDayHour: Number(e.target.value) || 18 })
          }
        />
        <Input
          label="Pause after idle (minutes, 0 = off, desktop only)"
          type="number"
          min={0}
          max={120}
          value={prefs.idleTimeoutMinutes}
          onChange={(e) =>
            setPrefs({ ...prefs, idleTimeoutMinutes: Number(e.target.value) || 0 })
          }
        />
        <Input
          label="Timezone (IANA)"
          value={prefs.timezone}
          onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
        />
        <Button type="button" onClick={() => void save()} isLoading={saving}>
          Save time settings
        </Button>
      </div>
    </Card>
  );
}
