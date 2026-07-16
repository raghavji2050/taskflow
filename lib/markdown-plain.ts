/**
 * Strip markdown markers for plain-text surfaces (OS push, notification bell).
 * Keeps readable content; does not aim to be a full markdown parser.
 */
export function stripMarkdown(text: string): string {
  let s = text.replace(/\r\n/g, "\n").trim();
  if (!s) return "";

  // Fenced code blocks → inner text
  s = s.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, code: string) => code.trim());
  s = s.replace(/~~~[\w-]*\n?([\s\S]*?)~~~/g, (_, code: string) => code.trim());

  // Tables: keep cell text, drop pipes / separator rows
  s = s
    .split("\n")
    .filter((line) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
    .map((line) => {
      if (!line.includes("|")) return line;
      return line
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(" · ");
    })
    .join("\n");

  // Headings / blockquotes / list markers
  s = s.replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1");
  s = s.replace(/(^|\n)\s{0,3}>\s?/g, "$1");
  s = s.replace(/(^|\n)\s{0,3}([-*+]|\d+\.)\s+/g, "$1");

  // Images / links
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Inline code / bold / italic / strike
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  s = s.replace(/~~(.*?)~~/g, "$1");

  // Collapse blank lines / trim
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/** Short plain preview for push / list snippets. */
export function plainMessagePreview(text: string, maxLen = 160): string {
  const plain = stripMarkdown(text).replace(/\s+/g, " ").trim();
  if (!plain) return "New message";
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen - 1)}…`;
}
