"use client";

import { useRealtime } from "@/components/RealtimeProvider";
import { cn } from "@/lib/utils";

export function RealtimeIndicator() {
  const { connected } = useRealtime();

  return (
    <div
      className="flex w-full items-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--muted)]"
      title={connected ? "Live sync active" : "Reconnecting..."}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          connected ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "animate-pulse bg-amber-400"
        )}
      />
      {connected ? "Live sync" : "Reconnecting…"}
    </div>
  );
}
