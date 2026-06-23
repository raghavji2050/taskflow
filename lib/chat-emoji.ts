/** True when the message is only emoji (and optional whitespace), suitable for sticker-style display. */
export function isEmojiOnlyMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!/\p{Extended_Pictographic}/u.test(trimmed)) return false;
  if (/[A-Za-z0-9@#$%^&*()[\]{}<>/\\|`~_=+]/.test(trimmed)) return false;

  const remainder = trimmed
    .replace(/[\p{Extended_Pictographic}\s\u200d\ufe0f]/gu, "")
    .replace(/[\u{1f3fb}-\u{1f3ff}]/gu, "")
    .replace(/[\u{20e3}]/gu, "");

  return remainder.length === 0;
}

export function emojiOnlySizeClass(text: string): string {
  const trimmed = text.trim();
  const clusters = [...trimmed].filter((c) => /\p{Extended_Pictographic}/u.test(c));
  const count = clusters.length || 1;
  if (count === 1) return "text-5xl";
  if (count <= 3) return "text-4xl";
  return "text-3xl";
}
