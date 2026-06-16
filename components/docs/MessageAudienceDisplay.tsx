"use client";

import { Building2, User, Users, NotebookPen } from "lucide-react";
import type { MessageAudienceKind } from "@/lib/message-audience";
import { messageAudienceKindLabel } from "@/lib/message-audience";
import { cn, formatRelativeDate } from "@/lib/utils";

export interface MessageAudienceView {
  kind: MessageAudienceKind;
  title: string;
  recipients: { id: string; name: string }[];
}

interface MessageAudienceDisplayProps {
  sender: { name: string };
  audience: MessageAudienceView;
  sentToLabel: string;
  body?: string;
  createdAt?: string;
  className?: string;
  destinationPrefix?: string;
}

const kindIcon: Record<MessageAudienceKind, typeof User> = {
  direct: User,
  group: Users,
  team: Building2,
  personal: NotebookPen,
};

export function MessageAudienceDisplay({
  sender,
  audience,
  sentToLabel,
  body,
  createdAt,
  className,
  destinationPrefix = "To",
}: MessageAudienceDisplayProps) {
  const Icon = kindIcon[audience.kind];

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="text-[var(--muted)]">
          From{" "}
          <span className="font-semibold text-[var(--foreground)]">{sender.name}</span>
        </span>
        {createdAt && (
          <>
            <span className="text-[var(--muted)]">·</span>
            <span className="text-[var(--muted)]">{formatRelativeDate(createdAt)}</span>
          </>
        )}
      </div>
      <div className="flex items-start gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)]">
          <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {destinationPrefix} · {messageAudienceKindLabel[audience.kind]}
          </p>
          <p className="text-xs font-medium text-[var(--foreground)]">{sentToLabel}</p>
          {audience.recipients.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {audience.recipients.map((r) => (
                <span
                  key={r.id}
                  className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] text-[var(--foreground)]"
                >
                  {r.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {body !== undefined && (
        <p className="line-clamp-2 border-l-2 border-[var(--card-border)] pl-2 text-xs text-[var(--muted)]">
          {body || "(empty message)"}
        </p>
      )}
    </div>
  );
}
