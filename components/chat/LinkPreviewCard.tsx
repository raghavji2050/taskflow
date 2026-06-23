"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { LinkPreviewData } from "@/lib/link-preview";
import { cn } from "@/lib/utils";

interface LinkPreviewCardProps {
  preview: LinkPreviewData;
  isOwn?: boolean;
  compact?: boolean;
  className?: string;
  onDismiss?: () => void;
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LinkPreviewCard({
  preview,
  isOwn = false,
  compact = false,
  className,
  onDismiss,
}: LinkPreviewCardProps) {
  const hostname = hostnameFromUrl(preview.url);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "mt-2 flex w-full overflow-hidden rounded-xl border text-left transition-colors hover:shadow-sm",
        isOwn
          ? "border-white/25 bg-white/10 hover:bg-white/15"
          : "border-[var(--card-border)] bg-[var(--surface-hover)] hover:bg-[var(--card)]",
        compact ? "max-w-none" : "max-w-sm",
        className
      )}
    >
      {preview.image && !imageFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt=""
          className={cn(
            "shrink-0 object-cover",
            compact ? "h-14 w-14" : "h-16 w-16 sm:h-20 sm:w-20"
          )}
          onError={() => setImageFailed(true)}
        />
      )}
      <span className="min-w-0 flex-1 p-2.5">
        <span
          className={cn(
            "flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide",
            isOwn ? "text-white/70" : "text-[var(--muted)]"
          )}
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          {hostname}
        </span>
        <span
          className={cn(
            "mt-0.5 block truncate text-sm font-semibold",
            isOwn ? "text-white" : "text-[var(--foreground)]"
          )}
        >
          {preview.title}
        </span>
        {preview.description && !compact && (
          <span
            className={cn(
              "mt-0.5 line-clamp-2 text-xs",
              isOwn ? "text-white/80" : "text-[var(--muted)]"
            )}
          >
            {preview.description}
          </span>
        )}
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
          className={cn(
            "shrink-0 self-start p-2 text-xs",
            isOwn ? "text-white/70 hover:text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
          )}
          aria-label="Dismiss preview"
        >
          ×
        </button>
      )}
    </a>
  );
}

export function LinkPreviewSkeleton({
  isOwn = false,
  compact = false,
  className,
}: {
  isOwn?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-2 flex w-full animate-pulse overflow-hidden rounded-xl border",
        isOwn
          ? "border-white/25 bg-white/10"
          : "border-[var(--card-border)] bg-[var(--surface-hover)]",
        compact ? "max-w-none" : "max-w-sm",
        className
      )}
      aria-hidden
    >
      <div
        className={cn(
          "shrink-0 bg-[var(--surface-3)]",
          compact ? "h-14 w-14" : "h-16 w-16 sm:h-20 sm:w-20"
        )}
      />
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div className="h-2 w-16 rounded bg-[var(--surface-3)]" />
        <div className="h-3 w-3/4 rounded bg-[var(--surface-3)]" />
        {!compact && <div className="h-2 w-full rounded bg-[var(--surface-3)]" />}
      </div>
    </div>
  );
}
