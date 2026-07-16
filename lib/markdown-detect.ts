/** Heuristic: does this plain-text body look like markdown worth rendering? */
export function looksLikeMarkdown(body: string): boolean {
  const text = body.trim();
  if (!text || text.length < 3) return false;
  return (
    /(^|\n)#{1,6}\s+\S/.test(text) ||
    /(^|\n)\|.+\|/.test(text) ||
    /(^|\n)(-{3,}|\*{3,}|_{3,})\s*$/m.test(text) ||
    /(^|\n)(```|~~~)/.test(text) ||
    /(^|\n)>\s+\S/.test(text) ||
    /(^|\n)([-*+]|\d+\.)\s+\S/.test(text) ||
    /\*\*[^*\n]+\*\*|__[^_\n]+__/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text)
  );
}
