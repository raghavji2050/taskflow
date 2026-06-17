"use client";

import { useState } from "react";
import type { ConversationType } from "@prisma/client";
import type { SharedMomPreview } from "@/lib/mom-format";
import { cn } from "@/lib/utils";
import { formatMomTimeRange } from "@/lib/document-ui";
import { MomQuickModal } from "@/components/chat/MomQuickModal";

interface MomShareCardProps {
  mom: SharedMomPreview;
  isOwn?: boolean;
  className?: string;
}

const MAX_VISIBLE_POINTS = 3;

function isGroupMom(type?: ConversationType) {
  return type === "GROUP" || type === "WORKSPACE";
}

function attendeeDisplay(mom: SharedMomPreview) {
  if (mom.allAttendees) return mom.attendeesLabel;
  if (mom.attendeeNames && mom.attendeeNames.length > 0) {
    return mom.attendeeNames.join(", ");
  }
  return mom.attendeesLabel;
}

export function MomShareCard({ mom, isOwn, className }: MomShareCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const points = mom.points ?? [];
  const showAttendees = isGroupMom(mom.conversationType) && mom.attendeesLabel !== "—";
  const mutedClass = isOwn ? "text-white/75" : "text-[var(--muted)]";

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={cn(
          "mt-2 flex w-full max-w-sm cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors hover:shadow-sm",
          isOwn
            ? "border-white/25 bg-white/10 hover:bg-white/15"
            : "border-[var(--card-border)] bg-[var(--surface-hover)] hover:bg-[var(--card)]",
          className
        )}
      >
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none" aria-hidden>
            📝
          </span>
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-sm font-semibold",
                isOwn ? "text-white" : "text-[var(--foreground)]"
              )}
            >
              {mom.title}
            </span>
            <span
              className={cn(
                "mt-0.5 block text-xs",
                isOwn ? "text-white/80" : "text-[var(--muted)]"
              )}
            >
              {formatMomTimeRange(mom.startedAt, mom.endedAt)}
            </span>
          </div>
        </div>

        {points.length > 0 ? (
          <ul className={cn("space-y-0.5 text-[11px] leading-snug", mutedClass)}>
            {points.slice(0, MAX_VISIBLE_POINTS).map((point, index) => (
              <li key={`${index}-${point}`} className="flex gap-1.5">
                <span className="shrink-0">•</span>
                <span className="line-clamp-2 min-w-0">{point}</span>
              </li>
            ))}
            {points.length > MAX_VISIBLE_POINTS && (
              <li className="pl-3.5 opacity-80">+{points.length - MAX_VISIBLE_POINTS} more</li>
            )}
          </ul>
        ) : (
          <p className={cn("text-[11px]", mutedClass)}>
            {mom.pointCount} point{mom.pointCount === 1 ? "" : "s"}
          </p>
        )}

        {showAttendees && (
          <p className={cn("text-[11px]", mutedClass)}>
            <span className={isOwn ? "text-white/60" : "text-[var(--muted-foreground)]"}>
              With:{" "}
            </span>
            {attendeeDisplay(mom)}
          </p>
        )}
      </button>

      <MomQuickModal momId={mom.id} isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
