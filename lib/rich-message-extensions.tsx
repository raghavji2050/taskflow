"use client";

import type { ComponentType } from "react";
import { ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Mention from "@tiptap/extension-mention";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import type { Editor } from "@tiptap/core";
import { getLowlight } from "@/lib/rich-message-lowlight";
import { isAllowedLinkUrl } from "@/lib/rich-message-links";
import { MentionSuggestionList } from "@/components/chat/MentionSuggestionList";

export interface RichEditorMember {
  id: string;
  name: string;
}

function createSuggestionRenderer<T extends object>(Component: ComponentType<T>) {
  return () => {
    let renderer: ReactRenderer | null = null;

    return {
      onStart: (props: T & { clientRect?: (() => DOMRect | null) | null }) => {
        renderer = new ReactRenderer(Component, {
          props,
          editor: (props as { editor?: Editor }).editor as Editor,
        });
        const el = renderer.element as HTMLElement;
        el.style.position = "absolute";
        el.style.zIndex = "50";
        document.body.appendChild(el);
        updatePosition(el, props.clientRect);
      },
      onUpdate: (props: T & { clientRect?: (() => DOMRect | null) | null }) => {
        renderer?.updateProps(props);
        if (renderer?.element) {
          updatePosition(renderer.element as HTMLElement, props.clientRect);
        }
      },
      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === "Escape") return true;
        return (renderer?.ref as { onKeyDown?: (props: { event: KeyboardEvent }) => boolean } | null)
          ?.onKeyDown?.(props) ?? false;
      },
      onExit: () => {
        renderer?.destroy();
        renderer = null;
      },
    };
  };
}

function updatePosition(el: HTMLElement, clientRect?: (() => DOMRect | null) | null) {
  const rect = clientRect?.();
  if (!rect) return;
  el.style.left = `${rect.left + window.scrollX}px`;
  el.style.top = `${rect.top + window.scrollY - 8}px`;
  el.style.transform = "translateY(-100%)";
}

export function createEditorExtensions(options: {
  placeholder?: string;
  members?: RichEditorMember[];
  currentUserId?: string;
}) {
  const lowlight = getLowlight();
  const members = (options.members ?? []).filter((m) => m.id !== options.currentUserId);

  return [
    StarterKit.configure({
      codeBlock: false,
      heading: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      validate: (url) => isAllowedLinkUrl(url),
      HTMLAttributes: {
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
    Placeholder.configure({
      placeholder: options.placeholder ?? "Type a message",
    }),
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: "plaintext",
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    ...(members.length > 0
      ? [
          Mention.configure({
            HTMLAttributes: { class: "rich-mention" },
            suggestion: {
              char: "@",
              items: ({ query }) =>
                members
                  .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
                  .slice(0, 8)
                  .map((m) => ({ id: m.id, label: m.name })),
              command: ({ editor, range, props }) => {
                editor
                  .chain()
                  .focus()
                  .insertContentAt(range, [
                    {
                      type: "mention",
                      attrs: { id: props.id, label: props.label ?? props.id },
                    },
                    { type: "text", text: " " },
                  ])
                  .run();
              },
              render: createSuggestionRenderer(MentionSuggestionList),
            },
          }),
        ]
      : []),
  ];
}
