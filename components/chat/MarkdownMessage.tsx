"use client";

import { useMemo } from "react";
import { markdownToSafeHtml } from "@/lib/markdown-message";
import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  body: string;
  className?: string;
  inOwnBubble?: boolean;
}

/**
 * Renders GFM markdown (headings, tables, bold, lists, code) for messages
 * that arrived as plain text (e.g. inbound webhooks) without TipTap bodyJson.
 */
export function MarkdownMessage({ body, className, inOwnBubble }: MarkdownMessageProps) {
  const html = useMemo(() => markdownToSafeHtml(body), [body]);

  return (
    <div
      className={cn(
        "chat-markdown text-sm break-words",
        inOwnBubble && "chat-markdown-own",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
