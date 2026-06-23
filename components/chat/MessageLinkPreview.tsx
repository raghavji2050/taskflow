"use client";

import { useMemo, useState } from "react";
import { LinkPreviewCard, LinkPreviewSkeleton } from "@/components/chat/LinkPreviewCard";
import { pickPreviewUrlFromMessage } from "@/lib/link-preview";
import { useLinkPreview } from "@/lib/use-link-preview";

interface MessageLinkPreviewProps {
  body: string;
  bodyJson?: unknown | null;
  attachmentUrls?: string[];
  isOwn?: boolean;
  compact?: boolean;
}

export function MessageLinkPreview({
  body,
  bodyJson,
  attachmentUrls,
  isOwn = false,
  compact = false,
}: MessageLinkPreviewProps) {
  const previewUrl = useMemo(
    () => pickPreviewUrlFromMessage(body, bodyJson, { attachmentUrls }),
    [body, bodyJson, attachmentUrls]
  );

  const { data, loading, error } = useLinkPreview(previewUrl);

  if (!previewUrl || error) return null;
  if (loading && !data) {
    return <LinkPreviewSkeleton isOwn={isOwn} compact={compact} />;
  }
  if (!data) return null;

  return <LinkPreviewCard preview={data} isOwn={isOwn} compact={compact} />;
}

interface ComposerLinkPreviewProps {
  body: string;
  bodyJson?: unknown | null;
}

export function ComposerLinkPreview({ body, bodyJson }: ComposerLinkPreviewProps) {
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);

  const previewUrl = useMemo(
    () => pickPreviewUrlFromMessage(body, bodyJson),
    [body, bodyJson]
  );

  const activeUrl = previewUrl && previewUrl !== dismissedUrl ? previewUrl : null;
  const { data, loading, error } = useLinkPreview(activeUrl);

  if (!activeUrl || error) return null;
  if (loading && !data) {
    return <LinkPreviewSkeleton compact className="mt-0" />;
  }
  if (!data) return null;

  return (
    <LinkPreviewCard
      preview={data}
      compact
      className="mt-0"
      onDismiss={() => setDismissedUrl(previewUrl)}
    />
  );
}
