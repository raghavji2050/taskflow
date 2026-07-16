import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";
import { looksLikeMarkdown } from "@/lib/markdown-detect";

export { looksLikeMarkdown };

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function markdownToSafeHtml(body: string): string {
  const raw = marked.parse(body, { async: false }) as string;
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
  });
  // Ensure external links open safely in a new tab.
  return clean.replace(/<a /gi, '<a target="_blank" rel="noopener noreferrer" ');
}
