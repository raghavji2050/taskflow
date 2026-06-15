export function isImageAttachment(mimeType: string) {
  return mimeType.startsWith("image/");
}

export function isAttachmentOnlyBody(body: string, filename: string) {
  const trimmed = body.trim();
  return trimmed === `📎 ${filename}` || trimmed === filename;
}
