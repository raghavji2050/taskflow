"use client";

import { splitMessageBody } from "@/lib/mentions";
import { splitTextWithUrls } from "@/lib/urls";
import { cn } from "@/lib/utils";

interface MessageBodyProps {
  body: string;
  members?: { name: string }[];
  className?: string;
  mentionClassName?: string;
  inline?: boolean;
  linkClassName?: string;
}

function renderTextWithUrls(text: string, linkClassName?: string) {
  return splitTextWithUrls(text).map((part, i) =>
    part.type === "url" ? (
      <a
        key={`url-${i}`}
        href={part.value}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("underline break-all", linkClassName ?? "text-[var(--accent)]")}
        onClick={(e) => e.stopPropagation()}
      >
        {part.value}
      </a>
    ) : (
      <span key={`text-${i}`}>{part.value}</span>
    )
  );
}

export function MessageBody({
  body,
  members = [],
  className,
  mentionClassName,
  inline,
  linkClassName,
}: MessageBodyProps) {
  const segments = splitMessageBody(body, members);
  const Tag = inline ? "span" : "p";

  return (
    <Tag className={cn(inline ? "inline" : "whitespace-pre-wrap break-words", className)}>
      {segments.map((seg, i) =>
        seg.type === "mention" ? (
          <span
            key={`${i}-${seg.value}`}
            className={cn(
              "rounded px-0.5 font-semibold text-[var(--accent)]",
              mentionClassName
            )}
          >
            @{seg.value}
          </span>
        ) : (
          <span key={`${i}-text`}>{renderTextWithUrls(seg.value, linkClassName)}</span>
        )
      )}
    </Tag>
  );
}
