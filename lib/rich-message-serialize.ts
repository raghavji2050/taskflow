import { z } from "zod";
import {
  ALLOWED_MARK_TYPES,
  ALLOWED_NODE_TYPES,
  MAX_CODE_BLOCK_CHARS,
  MAX_MESSAGE_BODY_LENGTH,
  type RichMessageDoc,
  emptyRichDoc,
  isRichDoc,
} from "@/lib/rich-message-types";

type JsonNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: JsonNode[];
};

const jsonNodeSchema: z.ZodType<JsonNode> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    text: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z
      .array(
        z.object({
          type: z.string(),
          attrs: z.record(z.string(), z.unknown()).optional(),
        })
      )
      .optional(),
    content: z.array(jsonNodeSchema).optional(),
  })
);

export function plainTextFromBodyJson(doc: RichMessageDoc | null | undefined): string {
  if (!doc || !isRichDoc(doc)) return "";
  const parts: string[] = [];

  const walk = (node: JsonNode, context: { block: boolean; listDepth: number }) => {
    if (node.type === "text" && node.text) {
      parts.push(node.text);
      return;
    }
    if (node.type === "hardBreak") {
      parts.push("\n");
      return;
    }
    if (node.type === "mention") {
      const label = String(node.attrs?.label ?? node.attrs?.id ?? "");
      parts.push(`@${label}`);
      return;
    }
    if (node.type === "codeBlock") {
      const code = (node.content ?? [])
        .map((child) => (child.type === "text" ? child.text ?? "" : ""))
        .join("");
      parts.push(code);
      return;
    }

    const children = node.content ?? [];
    const isBlock =
      node.type === "paragraph" ||
      node.type === "blockquote" ||
      node.type === "listItem" ||
      node.type === "taskItem" ||
      node.type === "tableRow" ||
      node.type === "tableCell" ||
      node.type === "tableHeader";

    if (isBlock && parts.length > 0 && !parts[parts.length - 1]!.endsWith("\n")) {
      parts.push("\n");
    }

    for (const child of children) {
      walk(child, {
        block: isBlock,
        listDepth: node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList"
          ? context.listDepth + 1
          : context.listDepth,
      });
    }

    if (
      node.type === "paragraph" ||
      node.type === "codeBlock" ||
      node.type === "blockquote" ||
      node.type === "listItem" ||
      node.type === "taskItem"
    ) {
      parts.push("\n");
    }
  };

  walk(doc as JsonNode, { block: false, listDepth: 0 });
  return parts.join("").replace(/\n+$/g, "").trim();
}

function sanitizeNode(node: JsonNode): JsonNode | null {
  if (!node.type || !ALLOWED_NODE_TYPES.has(node.type)) return null;

  if (node.type === "text") {
    if (typeof node.text !== "string") return null;
    const marks = (node.marks ?? [])
      .filter((m) => ALLOWED_MARK_TYPES.has(m.type))
      .map((m) => {
        if (m.type === "link") {
          const href = String(m.attrs?.href ?? "");
          if (!href.startsWith("http") && !href.startsWith("mailto:") && !href.startsWith("/")) {
            return null;
          }
          return { type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer" } };
        }
        return { type: m.type, attrs: m.attrs };
      })
      .filter((m) => m !== null);
    return { type: "text", text: node.text, marks: marks.length ? marks : undefined };
  }

  if (node.type === "codeBlock") {
    const code = (node.content ?? [])
      .map((child) => (child.type === "text" ? child.text ?? "" : ""))
      .join("")
      .slice(0, MAX_CODE_BLOCK_CHARS);
    const language = String(node.attrs?.language ?? "plaintext");
    return {
      type: "codeBlock",
      attrs: { language },
      content: code ? [{ type: "text", text: code }] : undefined,
    };
  }

  if (node.type === "mention") {
    const id = String(node.attrs?.id ?? "");
    const label = String(node.attrs?.label ?? "");
    if (!id || !label) return null;
    return { type: "mention", attrs: { id, label } };
  }

  const content = (node.content ?? [])
    .map((child) => sanitizeNode(child))
    .filter((child): child is JsonNode => child !== null);

  const attrs = node.attrs ? { ...node.attrs } : undefined;
  if (node.type === "taskItem" && attrs) {
    attrs.checked = Boolean(attrs.checked);
  }

  return {
    type: node.type,
    attrs,
    content: content.length ? content : undefined,
  };
}

export function sanitizeBodyJson(input: unknown): RichMessageDoc | null {
  const parsed = jsonNodeSchema.safeParse(input);
  if (!parsed.success || parsed.data.type !== "doc") return null;
  const sanitized = sanitizeNode(parsed.data);
  if (!sanitized || sanitized.type !== "doc") return null;
  return sanitized as RichMessageDoc;
}

export function validateBodyJson(input: unknown): RichMessageDoc {
  const sanitized = sanitizeBodyJson(input);
  if (!sanitized) {
    throw new Error("Invalid message formatting");
  }
  const plain = plainTextFromBodyJson(sanitized);
  if (plain.length > MAX_MESSAGE_BODY_LENGTH) {
    throw new Error(`Message cannot exceed ${MAX_MESSAGE_BODY_LENGTH} characters`);
  }
  return sanitized;
}

export function isEmptyRichDoc(doc: RichMessageDoc | null | undefined): boolean {
  if (!doc) return true;
  return plainTextFromBodyJson(doc).trim().length === 0;
}

export function hasRichFormatting(doc: RichMessageDoc | null | undefined): boolean {
  if (!doc || !isRichDoc(doc)) return false;
  let rich = false;

  const walk = (node: JsonNode) => {
    if (node.type && node.type !== "doc" && node.type !== "paragraph" && node.type !== "text") {
      rich = true;
      return;
    }
    if (node.marks && node.marks.length > 0) {
      rich = true;
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };

  walk(doc as JsonNode);
  return rich;
}

export function normalizeMessageContent(params: {
  body?: string;
  bodyJson?: unknown | null;
}): { body: string; bodyJson: RichMessageDoc | null } {
  let bodyJson: RichMessageDoc | null = null;
  if (params.bodyJson != null) {
    bodyJson = validateBodyJson(params.bodyJson);
  }

  let body = (params.body ?? "").trim();
  if (!body && bodyJson) {
    body = plainTextFromBodyJson(bodyJson);
  }
  if (bodyJson && !hasRichFormatting(bodyJson)) {
    bodyJson = null;
  }
  if (!bodyJson && body) {
    bodyJson = null;
  }

  if (body.length > MAX_MESSAGE_BODY_LENGTH) {
    throw new Error(`Message cannot exceed ${MAX_MESSAGE_BODY_LENGTH} characters`);
  }

  return { body, bodyJson };
}

export { emptyRichDoc };
