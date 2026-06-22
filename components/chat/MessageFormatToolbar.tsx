"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  SquareCode,
  Strikethrough,
  Underline,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageFormatToolbarProps {
  editor: Editor | null;
  className?: string;
  compact?: boolean;
  integrated?: boolean;
}

function ToolbarButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        pressed && "bg-[var(--accent-soft)] text-[var(--accent)]"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px shrink-0 bg-[var(--border)]" aria-hidden />;
}

export function MessageFormatToolbar({
  editor,
  className,
  compact,
  integrated,
}: MessageFormatToolbarProps) {
  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter URL", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const icon = "h-3.5 w-3.5";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5",
        !integrated && "rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]/50 p-1",
        className
      )}
      role="toolbar"
      aria-label="Message formatting"
    >
      <ToolbarButton
        label="Bold"
        pressed={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className={icon} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        pressed={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className={icon} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        pressed={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className={icon} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        pressed={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className={icon} strokeWidth={2} />
      </ToolbarButton>
      {!compact && <Divider />}
      <ToolbarButton
        label="Inline code"
        pressed={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className={icon} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        pressed={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className={icon} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton
        label="Bullet list"
        pressed={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className={icon} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton
        label="Ordered list"
        pressed={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className={icon} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton
        label="Checklist"
        pressed={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListTodo className={icon} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton label="Insert link" onClick={setLink}>
        <Link className={icon} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton
        label="Code block"
        pressed={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock({ language: "typescript" }).run()}
      >
        <SquareCode className={icon} strokeWidth={2} />
      </ToolbarButton>
    </div>
  );
}
