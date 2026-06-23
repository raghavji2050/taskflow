import type { RichMessageDoc } from "@/lib/rich-message-types";
import { plainTextFromBodyJson } from "@/lib/rich-message-serialize";

export function getMessageCopyText(body: string, bodyJson?: unknown | null): string {
  const doc = bodyJson as RichMessageDoc | null | undefined;
  if (doc) {
    const fromJson = plainTextFromBodyJson(doc).trim();
    if (fromJson) return fromJson;
  }
  return body.trim();
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
