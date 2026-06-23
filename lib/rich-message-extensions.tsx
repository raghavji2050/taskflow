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
import { MENTION_ALL_ID, MENTION_ALL_LABEL } from "@/lib/mentions";

export interface RichEditorMember {
  id: string;
  name: string;
  image?: string | null;
  email?: string;
}

function filterMentionMembers(members: RichEditorMember[], query: string): RichEditorMember[] {
  const q = query.trim().toLowerCase();
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return sorted;
  return sorted.filter((m) => {
    const name = m.name.toLowerCase();
    const email = m.email?.toLowerCase() ?? "";
    const first = name.split(/\s+/)[0] ?? "";
    return name.includes(q) || first.includes(q) || email.includes(q);
  });
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

export interface MentionMembersSource {
  getMembers: () => RichEditorMember[];
  getCurrentUserId: () => string | undefined;
  getAllowTagAll?: () => boolean;
}

function buildMentionSuggestionItems(
  options: {
    members?: RichEditorMember[];
    currentUserId?: string;
    mentionMembers?: MentionMembersSource;
  },
  query: string
) {
  const q = query.trim().toLowerCase();
  const members = filterMentionMembers(getMentionableMembers(options), query).map((m) => ({
    id: m.id,
    label: m.name,
    image: m.image ?? null,
    tagAll: false as const,
  }));

  const allowTagAll = options.mentionMembers?.getAllowTagAll?.() ?? false;
  const includeTagAll = allowTagAll && MENTION_ALL_LABEL.startsWith(q);

  if (!includeTagAll) return members;

  return [
    { id: MENTION_ALL_ID, label: MENTION_ALL_LABEL, image: null, tagAll: true as const },
    ...members,
  ];
}

function getMentionableMembers(options: {
  members?: RichEditorMember[];
  currentUserId?: string;
  mentionMembers?: MentionMembersSource;
}): RichEditorMember[] {
  if (options.mentionMembers) {
    const currentUserId = options.mentionMembers.getCurrentUserId();
    return options.mentionMembers
      .getMembers()
      .filter((m) => m.id !== currentUserId);
  }
  return (options.members ?? []).filter((m) => m.id !== options.currentUserId);
}

/** @internal exported for unit tests */
export function getMentionableMembersForTest(options: {
  members?: RichEditorMember[];
  currentUserId?: string;
  mentionMembers?: MentionMembersSource;
}) {
  return getMentionableMembers(options);
}

export function createEditorExtensions(options: {
  placeholder?: string;
  members?: RichEditorMember[];
  currentUserId?: string;
  mentionMembers?: MentionMembersSource;
}) {
  const lowlight = getLowlight();
  const enableMentions =
    options.mentionMembers != null ||
    (options.members != null && options.currentUserId != null);

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
    ...(enableMentions
      ? [
          Mention.configure({
            HTMLAttributes: { class: "rich-mention" },
            suggestion: {
              char: "@",
              items: ({ query }) => buildMentionSuggestionItems(options, query),
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
