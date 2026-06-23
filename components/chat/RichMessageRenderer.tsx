"use client";

import type { ReactNode } from "react";
import { MessageBody } from "@/components/chat/MessageBody";
import { CodeSnippet } from "@/components/chat/CodeSnippet";
import { isMentionAllId } from "@/lib/mentions";
import { sanitizeLinkHref } from "@/lib/rich-message-links";
import { isRichDoc } from "@/lib/rich-message-types";
import { cn } from "@/lib/utils";

type JsonNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: JsonNode[];
};

interface RichMessageRendererProps {
  body: string;
  bodyJson?: unknown | null;
  members?: { name: string }[];
  className?: string;
  mentionClassName?: string;
  linkClassName?: string;
  inline?: boolean;
  inOwnBubble?: boolean;
  emojiOnly?: boolean;
  emojiSizeClass?: string;
}

function renderMarks(text: string, marks: JsonNode["marks"], linkClassName?: string): ReactNode {
  if (!marks?.length) return text;
  return marks.reduce<ReactNode>((node, mark) => {
    if (mark.type === "bold") return <strong>{node}</strong>;
    if (mark.type === "italic") return <em>{node}</em>;
    if (mark.type === "underline") return <u>{node}</u>;
    if (mark.type === "strike") return <s>{node}</s>;
    if (mark.type === "code") {
      return (
        <code className="rounded bg-[var(--surface-hover)] px-1 py-0.5 font-mono text-[0.9em]">
          {node}
        </code>
      );
    }
    if (mark.type === "link") {
      const href = sanitizeLinkHref(String(mark.attrs?.href ?? ""));
      if (!href) return node;
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("underline break-all cursor-pointer", linkClassName ?? "text-[var(--accent)]")}
          onClick={(e) => e.stopPropagation()}
        >
          {node}
        </a>
      );
    }
    return node;
  }, text);
}

function renderNode(
  node: JsonNode,
  key: string,
  opts: Pick<RichMessageRendererProps, "mentionClassName" | "linkClassName" | "inOwnBubble">
): ReactNode {
  if (node.type === "text" && node.text != null) {
    return <span key={key}>{renderMarks(node.text, node.marks, opts.linkClassName)}</span>;
  }
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "mention") {
    const id = String(node.attrs?.id ?? "");
    const label = String(node.attrs?.label ?? node.attrs?.id ?? "");
    const display = isMentionAllId(id) ? "all" : label;
    return (
      <span
        key={key}
        className={cn(
          "rounded px-0.5 font-semibold text-[var(--accent)]",
          opts.mentionClassName
        )}
      >
        @{display}
      </span>
    );
  }
  if (node.type === "codeBlock") {
    const code = (node.content ?? [])
      .map((c) => (c.type === "text" ? c.text ?? "" : ""))
      .join("");
    const language = String(node.attrs?.language ?? "plaintext");
    return <CodeSnippet key={key} code={code} language={language} inOwnBubble={opts.inOwnBubble} />;
  }
  if (node.type === "blockquote") {
    return (
      <blockquote
        key={key}
        className="my-1 border-l-2 border-[var(--border)] pl-3 text-[var(--muted)]"
      >
        {(node.content ?? []).map((child, i) =>
          renderNode(child, `${key}-bq-${i}`, opts)
        )}
      </blockquote>
    );
  }
  if (node.type === "bulletList") {
    return (
      <ul key={key} className="my-1 list-disc pl-5">
        {(node.content ?? []).map((child, i) => (
          <li key={`${key}-bl-${i}`}>
            {(child.content ?? []).map((inner, j) =>
              renderNode(inner, `${key}-bli-${i}-${j}`, opts)
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (node.type === "orderedList") {
    return (
      <ol key={key} className="my-1 list-decimal pl-5">
        {(node.content ?? []).map((child, i) => (
          <li key={`${key}-ol-${i}`}>
            {(child.content ?? []).map((inner, j) =>
              renderNode(inner, `${key}-oli-${i}-${j}`, opts)
            )}
          </li>
        ))}
      </ol>
    );
  }
  if (node.type === "taskList") {
    return (
      <ul key={key} className="my-1 list-none space-y-1 pl-0">
        {(node.content ?? []).map((child, i) => {
          const checked = Boolean(child.attrs?.checked);
          return (
            <li key={`${key}-tl-${i}`} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={checked}
                readOnly
                className="mt-1"
                aria-label={checked ? "Completed task" : "Incomplete task"}
              />
              <span className={checked ? "text-[var(--muted)] line-through" : undefined}>
                {(child.content ?? []).map((inner, j) =>
                  renderNode(inner, `${key}-tli-${i}-${j}`, opts)
                )}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  if (node.type === "table") {
    return (
      <div key={key} className="my-2 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <tbody>
            {(node.content ?? []).map((row, ri) => (
              <tr key={`${key}-tr-${ri}`} className="border-b border-[var(--border)]">
                {(row.content ?? []).map((cell, ci) => {
                  const Tag = cell.type === "tableHeader" ? "th" : "td";
                  return (
                    <Tag
                      key={`${key}-td-${ri}-${ci}`}
                      className="border border-[var(--border)] px-2 py-1 align-top"
                    >
                      {(cell.content ?? []).map((inner, j) =>
                        renderNode(inner, `${key}-cell-${ri}-${ci}-${j}`, opts)
                      )}
                    </Tag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (node.type === "paragraph") {
    const children = (node.content ?? []).map((child, i) =>
      renderNode(child, `${key}-p-${i}`, opts)
    );
    if (!children.length) return <br key={key} />;
    return (
      <p key={key} className="my-0.5 whitespace-pre-wrap break-words">
        {children}
      </p>
    );
  }

  if (node.content?.length) {
    return (
      <div key={key}>
        {node.content.map((child, i) => renderNode(child, `${key}-c-${i}`, opts))}
      </div>
    );
  }
  return null;
}

export function RichMessageRenderer({
  body,
  bodyJson,
  members = [],
  className,
  mentionClassName,
  linkClassName,
  inline,
  inOwnBubble,
  emojiOnly,
  emojiSizeClass,
}: RichMessageRendererProps) {
  if (!bodyJson || !isRichDoc(bodyJson)) {
    return (
      <MessageBody
        body={body}
        members={members}
        className={cn(emojiOnly && emojiSizeClass, className)}
        mentionClassName={mentionClassName}
        linkClassName={linkClassName}
        inline={inline}
      />
    );
  }

  const doc = bodyJson as JsonNode;
  const children = (doc.content ?? []).map((node, i) =>
    renderNode(node, `root-${i}`, { mentionClassName, linkClassName, inOwnBubble })
  );

  if (inline) {
    return <span className={cn("inline", emojiOnly && emojiSizeClass, className)}>{children}</span>;
  }

  return <div className={cn("text-sm", emojiOnly && emojiSizeClass, className)}>{children}</div>;
}
