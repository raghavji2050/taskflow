"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useSession } from "next-auth/react";
import { formatDurationShort } from "@/lib/time-format";
import { useTimeRealtime } from "@/lib/useTimeRealtime";

interface TimeDashboardWidgetsProps {
  compact?: boolean;
}

export function TimeDashboardWidgets({ compact = false }: TimeDashboardWidgetsProps) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [today, setToday] = useState(0);
  const [week, setWeek] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/time/user/${userId}?range=today&limit=1`);
    const data = await res.json();
    if (res.ok) {
      setToday(data.summary?.today ?? 0);
      setWeek(data.summary?.week ?? 0);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useTimeRealtime({ userId, onEvent: () => void load() });

  if (!userId) return null;

  if (compact) {
    return (
      <div className="flex shrink-0 items-center gap-4 border-l border-[var(--card-border)] pl-4">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-[var(--muted)]" />
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">Today</p>
            <p className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
              {formatDurationShort(today)}
            </p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">This week</p>
          <p className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
            {formatDurationShort(week)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="widget-card rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
          <Clock className="h-3.5 w-3.5" />
          My time today
        </div>
        <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
          {formatDurationShort(today)}
        </p>
      </div>
      <div className="widget-card rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
          <Clock className="h-3.5 w-3.5" />
          This week
        </div>
        <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
          {formatDurationShort(week)}
        </p>
      </div>
    </div>
  );
}
