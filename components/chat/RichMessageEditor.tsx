"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { MessageFormatToolbar } from "@/components/chat/MessageFormatToolbar";
import { createChatEnterExtension } from "@/lib/rich-message-enter";
import {
  createEditorExtensions,
  type MentionMembersSource,
} from "@/lib/rich-message-extensions";
import { plainTextFromBodyJson } from "@/lib/rich-message-serialize";
import { emptyRichDoc, type RichMessageDoc } from "@/lib/rich-message-types";
import { cn } from "@/lib/utils";

export interface RichMessageEditorHandle {
  focus: () => void;
  clear: () => void;
  insertEmoji: (emoji: string) => void;
}

interface RichMessageEditorProps {
  bodyJson: RichMessageDoc | null;
  onChange: (value: { body: string; bodyJson: RichMessageDoc | null }) => void;
  onSubmit?: () => void;
  onTyping?: () => void;
  onEditorReady?: (editor: import("@tiptap/react").Editor | null) => void;
  disabled?: boolean;
  members?: { id: string; name: string }[];
  currentUserId?: string;
  placeholder?: string;
  className?: string;
  showToolbar?: boolean;
  toolbarCompact?: boolean;
  initialContent?: RichMessageDoc | null;
  /** Remount editor when switching conversations so mention state stays in sync. */
  editorKey?: string;
  allowTagAll?: boolean;
}

export const RichMessageEditor = forwardRef<RichMessageEditorHandle, RichMessageEditorProps>(
  function RichMessageEditor(
    {
      bodyJson,
      onChange,
      onSubmit,
      onTyping,
      onEditorReady,
      disabled,
      members = [],
      currentUserId,
      placeholder,
      className,
      showToolbar = true,
      toolbarCompact = false,
      initialContent,
      editorKey,
      allowTagAll = false,
    },
    ref
  ) {
    const onChangeRef = useRef(onChange);
    const onTypingRef = useRef(onTyping);
    const onSubmitRef = useRef(onSubmit);
    const membersRef = useRef(members);
    const currentUserIdRef = useRef(currentUserId);
    const allowTagAllRef = useRef(allowTagAll);

    membersRef.current = members;
    currentUserIdRef.current = currentUserId;
    allowTagAllRef.current = allowTagAll;

    const mentionMembers = useMemo<MentionMembersSource>(
      () => ({
        getMembers: () => membersRef.current,
        getCurrentUserId: () => currentUserIdRef.current,
        getAllowTagAll: () => allowTagAllRef.current,
      }),
      []
    );

    useEffect(() => {
      onChangeRef.current = onChange;
      onTypingRef.current = onTyping;
      onSubmitRef.current = onSubmit;
    });

    const editor = useEditor(
      {
        immediatelyRender: false,
        editable: !disabled,
        extensions: [
          ...createEditorExtensions({
            placeholder,
            mentionMembers,
          }),
          ...(onSubmit
            ? [createChatEnterExtension(() => onSubmitRef.current?.())]
            : []),
        ],
        content: initialContent ?? bodyJson ?? emptyRichDoc(),
        editorProps: {
          attributes: {
            class: "rich-message-input min-h-[1.375rem] max-h-28 w-full min-w-0 overflow-x-hidden overflow-y-auto text-sm leading-relaxed break-words focus:outline-none",
          },
        },
        onUpdate: ({ editor: ed }) => {
          const json = ed.getJSON() as RichMessageDoc;
          const body = plainTextFromBodyJson(json);
          onChangeRef.current({ body, bodyJson: json });
          onTypingRef.current?.();
        },
      },
      [editorKey, mentionMembers, placeholder, disabled]
    );

    useEffect(() => {
      if (!editor) return;
      editor.setEditable(!disabled);
      onEditorReady?.(editor);
      return () => onEditorReady?.(null);
    }, [editor, disabled, onEditorReady]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editor?.commands.focus("end"),
        clear: () => {
          editor?.commands.clearContent();
          onChangeRef.current({ body: "", bodyJson: null });
        },
        insertEmoji: (emoji: string) => {
          if (!editor) return;
          editor.chain().focus().insertContent(emoji).run();
          const json = editor.getJSON() as RichMessageDoc;
          onChangeRef.current({
            body: plainTextFromBodyJson(json),
            bodyJson: json,
          });
          onTypingRef.current?.();
        },
      }),
      [editor]
    );

    return (
      <div className={cn("min-w-0 flex-1 basis-0", className)}>
        {showToolbar && !toolbarCompact && (
          <MessageFormatToolbar editor={editor} className="mb-1.5 hidden md:flex" />
        )}
        <EditorContent editor={editor} className="rich-message-editor" />
      </div>
    );
  }
);

export type { JSONContent };
