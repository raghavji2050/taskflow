"use client";

import { splitMessageBody } from "@/lib/mentions";
import { EmojiAwareText } from "@/lib/emoji-text";
import { splitTextWithUrls } from "@/lib/urls";
import { cn } from "@/lib/utils";

interface MessageBodyProps {
  body: string;
  members?: { name: string }[];
  className?: string;
  mentionClassName?: string;
  inline?: boolean;
  linkClassName?: string;
  skipEmojiWrap?: boolean;
}

function renderTextWithUrls(text: string, linkClassName?: string, skipEmojiWrap?: boolean) {
  return splitTextWithUrls(text).map((part, i) =>
    part.type === "url" ? (
      <a
        key={`url-${i}`}
        href={part.value}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("underline break-all cursor-pointer", linkClassName ?? "text-[var(--accent)]")}
        onClick={(e) => e.stopPropagation()}
      >
        {part.value}
      </a>
    ) : skipEmojiWrap ? (
      <span key={`text-${i}`}>{part.value}</span>
    ) : (
      <EmojiAwareText key={`text-${i}`} text={part.value} keyPrefix={`u${i}-`} />
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
  skipEmojiWrap,
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
          <span key={`${i}-text`}>{renderTextWithUrls(seg.value, linkClassName, skipEmojiWrap)}</span>
        )
      )}
    </Tag>
  );
}
