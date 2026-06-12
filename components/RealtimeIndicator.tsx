"use client";

import { useRealtime } from "@/components/RealtimeProvider";
import { cn } from "@/lib/utils";

export function RealtimeIndicator() {
  const { connected } = useRealtime();

  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
      title={connected ? "Live sync active" : "Reconnecting..."}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          connected ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" : "bg-amber-400 animate-pulse"
        )}
      />
      {connected ? "Live" : "Syncing"}
    </div>
  );
}
