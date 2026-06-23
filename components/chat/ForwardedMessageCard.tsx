"use client";

import { cn } from "@/lib/utils";
import { MessageBody } from "@/components/chat/MessageBody";
import { MessageAttachmentPreview } from "@/components/chat/MessageAttachmentPreview";
import { DocumentShareCard } from "@/components/chat/DocumentShareCard";
import { MessageLinkPreview } from "@/components/chat/MessageLinkPreview";
import type { FormattedForwardedFrom } from "@/lib/message-format";

interface ForwardedMessageCardProps {
  forwarded: FormattedForwardedFrom;
  isOwn?: boolean;
  mentionMembers?: { name: string }[];
}

export function ForwardedMessageCard({
  forwarded,
  isOwn,
  mentionMembers = [],
}: ForwardedMessageCardProps) {
  return (
    <div
      className={cn(
        "mb-2 rounded-lg border-l-2 px-2 py-1.5 text-xs",
        isOwn ? "border-white/50 bg-white/10" : "border-[var(--accent)] bg-[var(--surface-hover)]"
      )}
    >
      <p
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide",
          isOwn ? "text-white/80" : "text-[var(--muted)]"
        )}
      >
        Forwarded from {forwarded.sourceLabel}
      </p>
      <p className={cn("mt-0.5 font-semibold", isOwn ? "text-white" : "text-[var(--foreground)]")}>
        {forwarded.user.name}
      </p>

      {forwarded.deleted ? (
        <p className={cn("mt-1 italic", isOwn ? "text-white/70" : "text-[var(--muted)]")}>
          Message unavailable
        </p>
      ) : (
        <>
          {forwarded.body && (
            <div className={cn("mt-1", isOwn ? "text-white/95" : "text-[var(--foreground)]")}>
              <MessageBody
                body={forwarded.body}
                members={mentionMembers}
                inline
                mentionClassName={isOwn ? "text-white bg-white/15" : undefined}
                linkClassName={isOwn ? "text-white underline" : undefined}
              />
            </div>
          )}

          {forwarded.attachments.length > 0 && (
            <MessageAttachmentPreview
              attachments={forwarded.attachments}
              isOwn={isOwn}
              messageBody={forwarded.body}
            />
          )}

          {forwarded.sharedDocument && (
            <DocumentShareCard document={forwarded.sharedDocument} isOwn={isOwn} />
          )}

          {!forwarded.sharedDocument && forwarded.body && (
            <MessageLinkPreview
              body={forwarded.body}
              attachmentUrls={forwarded.attachments.map((a) => a.url)}
              isOwn={isOwn}
              compact
            />
          )}
        </>
      )}
    </div>
  );
}
