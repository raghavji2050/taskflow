import type { ReactNode } from "react";

export type TextEmojiPart = { type: "text" | "emoji"; value: string };

const EMOJI_RUN =
  /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|\p{Regional_Indicator}{2}|\d\uFE0F?\u20E3/gu;

export function splitTextWithEmojis(text: string): TextEmojiPart[] {
  if (!text) return [{ type: "text", value: "" }];

  const parts: TextEmojiPart[] = [];
  let last = 0;

  for (const match of text.matchAll(EMOJI_RUN)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ type: "text", value: text.slice(last, index) });
    }
    parts.push({ type: "emoji", value: match[0] });
    last = index + match[0].length;
  }

  if (last < text.length) {
    parts.push({ type: "text", value: text.slice(last) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}

export function wrapEmojisInText(text: string, keyPrefix = ""): ReactNode[] {
  return splitTextWithEmojis(text).map((part, i) =>
    part.type === "emoji" ? (
      <span key={`${keyPrefix}e-${i}`} className="chat-emoji">
        {part.value}
      </span>
    ) : (
      <span key={`${keyPrefix}t-${i}`}>{part.value}</span>
    )
  );
}

export function EmojiAwareText({
  text,
  keyPrefix = "",
  className,
}: {
  text: string;
  keyPrefix?: string;
  className?: string;
}) {
  const parts = splitTextWithEmojis(text);
  if (parts.length === 1 && parts[0].type === "text") {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {wrapEmojisInText(text, keyPrefix)}
    </span>
  );
}
