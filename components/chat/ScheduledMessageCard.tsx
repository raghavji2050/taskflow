"use client";

import { Clock, Pencil, Trash2 } from "lucide-react";
import { formatScheduledForShort } from "@/lib/schedule-message-time";
import type { ScheduledMessageClient } from "@/lib/scheduled-message-types";
import { useScheduledCountdown } from "@/lib/use-scheduled-countdown";
import { cn } from "@/lib/utils";

interface ScheduledMessageCardProps {
  item: ScheduledMessageClient;
  onEdit: (item: ScheduledMessageClient) => void;
  onDelete: (item: ScheduledMessageClient) => void;
  compact?: boolean;
}

export function ScheduledMessageCard({
  item,
  onEdit,
  onDelete,
  compact = false,
}: ScheduledMessageCardProps) {
  const preview = item.body.length > 60 ? `${item.body.slice(0, 60)}…` : item.body;
  const when = formatScheduledForShort(item.scheduledFor, item.timezone);
  const countdown = useScheduledCountdown(
    item.status === "PENDING" ? item.scheduledFor : null
  );
  const attachmentNote =
    item.attachments.length > 0
      ? ` · ${item.attachments.length} file${item.attachments.length === 1 ? "" : "s"}`
      : "";

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--accent)]/35 bg-[var(--accent-soft)]/25 px-2 py-1.5">
        <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <div className="min-w-0 flex-1 truncate text-xs text-[var(--foreground)]">
          <span className="font-medium text-[var(--accent)]">Scheduled</span>
          {countdown && (
            <span className="font-medium tabular-nums text-[var(--accent)]"> · {countdown}</span>
          )}
          <span className="text-[var(--muted)]"> · {when}</span>
          {preview && <span className="text-[var(--muted)]"> · {preview}</span>}
          {attachmentNote && <span className="text-[var(--muted)]">{attachmentNote}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            aria-label="Edit scheduled message"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-red-500/10 hover:text-red-500"
            aria-label="Delete scheduled message"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-[var(--accent)]/40 bg-[var(--accent-soft)]/30 p-4">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
            Scheduled message
          </p>
          <p className="mt-0.5 text-xs font-medium text-[var(--foreground)]">
            {when}
            {countdown && (
              <span className="ml-2 tabular-nums text-[var(--accent)]">({countdown})</span>
            )}
          </p>
          <p className={cn("mt-1 text-sm text-[var(--muted)]", !preview && "hidden")}>{preview}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onEdit(item)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-medium hover:bg-[var(--surface-hover)]"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(item)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 px-3 text-xs font-medium text-red-500 hover:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
