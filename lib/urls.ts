const URL_REGEX = /(https?:\/\/[^\s<]+[^\s<.,;:!?"')\]}])/gi;

export function extractUrls(text: string): string[] {
  return [...text.matchAll(URL_REGEX)].map((m) => m[0]);
}

export function splitTextWithUrls(text: string): { type: "text" | "url"; value: string }[] {
  const parts: { type: "text" | "url"; value: string }[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_REGEX)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, index) });
    }
    parts.push({ type: "url", value: match[0] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}
