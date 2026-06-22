import type { JSONContent } from "@tiptap/react";

export type RichMessageDoc = JSONContent;

export const MAX_MESSAGE_BODY_LENGTH = 4000;
export const MAX_CODE_BLOCK_CHARS = 20_000;

export const SUPPORTED_CODE_LANGUAGES = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "tsx", label: "TSX" },
  { value: "jsx", label: "JSX" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "sql", label: "SQL" },
  { value: "prisma", label: "Prisma" },
  { value: "bash", label: "Bash" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "php", label: "PHP" },
  { value: "plaintext", label: "Plain Text" },
] as const;

export type CodeLanguage = (typeof SUPPORTED_CODE_LANGUAGES)[number]["value"];

export const ALLOWED_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "hardBreak",
  "codeBlock",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "mention",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);

export const ALLOWED_MARK_TYPES = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
]);

export function isRichDoc(value: unknown): value is RichMessageDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as RichMessageDoc).type === "doc"
  );
}

export function emptyRichDoc(): RichMessageDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function plainTextToRichDoc(text: string): RichMessageDoc {
  const trimmed = text.trim();
  if (!trimmed) return emptyRichDoc();
  return {
    type: "doc",
    content: trimmed.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined,
    })),
  };
}
