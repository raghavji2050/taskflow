import { createLowlight, common } from "lowlight";
import type { CodeLanguage } from "@/lib/rich-message-types";

const lowlight = createLowlight(common);

export function getLowlight() {
  return lowlight;
}

export function highlightCode(code: string, language: string): string {
  const lang = language === "prisma" ? "sql" : language;
  try {
    if (lowlight.registered(lang)) {
      const tree = lowlight.highlight(lang, code);
      return treeToHtml(tree);
    }
  } catch {
    // fall through
  }
  try {
    const tree = lowlight.highlightAuto(code);
    return treeToHtml(tree);
  } catch {
    return escapeHtml(code);
  }
}

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string | string[] };
  children?: HastNode[];
};

function treeToHtml(node: HastNode): string {
  if (node.type === "text") return escapeHtml(node.value ?? "");
  if (node.type === "root") {
    return (node.children ?? []).map(treeToHtml).join("");
  }
  if (node.type === "element" && node.tagName) {
    const className = node.properties?.className;
    const cls = Array.isArray(className) ? className.join(" ") : className ?? "";
    const inner = (node.children ?? []).map(treeToHtml).join("");
    return cls
      ? `<span class="${cls}">${inner}</span>`
      : `<${node.tagName}>${inner}</${node.tagName}>`;
  }
  return "";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function languageLabel(language: string): string {
  const map: Record<string, string> = {
    typescript: "TypeScript",
    javascript: "JavaScript",
    tsx: "TSX",
    jsx: "JSX",
    html: "HTML",
    css: "CSS",
    json: "JSON",
    sql: "SQL",
    prisma: "Prisma",
    bash: "Bash",
    python: "Python",
    java: "Java",
    go: "Go",
    rust: "Rust",
    php: "PHP",
    plaintext: "Plain Text",
  };
  return map[language as CodeLanguage] ?? language;
}
