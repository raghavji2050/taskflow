import DOMPurify from "isomorphic-dompurify";

const ALLOWED_PROTOCOLS = /^(https?:|mailto:)/i;

export function isAllowedLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  return ALLOWED_PROTOCOLS.test(trimmed);
}

export function sanitizeLinkHref(url: string): string | null {
  const trimmed = url.trim();
  if (!isAllowedLinkUrl(trimmed)) return null;
  const clean = DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
  return clean || null;
}
