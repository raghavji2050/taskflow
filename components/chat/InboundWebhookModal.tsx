"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type InboundStatus = {
  enabled: boolean;
  allowed: boolean;
  token: string | null;
  path: string | null;
};

interface InboundWebhookModalProps {
  isOpen: boolean;
  conversationId: string;
  onClose: () => void;
}

export function InboundWebhookModal({
  isOpen,
  conversationId,
  onClose,
}: InboundWebhookModalProps) {
  const [status, setStatus] = useState<InboundStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedExample, setCopiedExample] = useState(false);

  const webhookUrl =
    status?.path && typeof window !== "undefined"
      ? `${window.location.origin}${status.path}`
      : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/inbound`);
      const data = await res.json();
      if (res.ok) setStatus(data);
      else toast.error(data.error ?? "Could not load webhook");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const enable = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/inbound`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not enable webhook");
        return;
      }
      setStatus(data);
      toast.success("Inbound link enabled");
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!window.confirm("Rotate the link? The old URL will stop working.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/inbound`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not rotate link");
        return;
      }
      setStatus(data);
      toast.success("New link generated");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!window.confirm("Disable the inbound link? External apps will no longer be able to post.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/inbound`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not disable webhook");
        return;
      }
      setStatus(data);
      toast.success("Inbound link disabled");
    } finally {
      setBusy(false);
    }
  };

  const example = webhookUrl
    ? `curl -X POST "${webhookUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"body":"Hello from my app","senderName":"My App"}'`
    : "";

  const copyUrl = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  const copyExample = async () => {
    if (!example) return;
    try {
      await navigator.clipboard.writeText(example);
      setCopiedExample(true);
      toast.success("Example request copied");
      setTimeout(() => setCopiedExample(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="External message link" size="md">
      <div className="space-y-4 text-sm text-[var(--foreground)]">
        <p className="text-[var(--muted)]">
          Give this URL to another app. It can POST a JSON message and it will appear in this
          conversation.
        </p>

        {loading && !status ? (
          <p className="text-[var(--muted)]">Loading…</p>
        ) : status && !status.allowed ? (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 text-[var(--muted)]">
            Inbound links are available for groups and team channels only.
          </p>
        ) : (
          <>
            {!status?.enabled ? (
              <Button type="button" onClick={() => void enable()} disabled={busy}>
                <Link2 className="h-4 w-4" />
                Enable inbound link
              </Button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                    Public POST URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={webhookUrl ?? ""}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs"
                    />
                    <Button type="button" variant="secondary" size="sm" onClick={() => void copyUrl()}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                    Example request
                  </label>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] p-3 pr-12 font-mono text-[11px] leading-relaxed text-[var(--muted)]">
                      {example}
                    </pre>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="absolute right-2 top-2"
                      onClick={() => void copyExample()}
                      aria-label="Copy example request"
                    >
                      {copiedExample ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void rotate()}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Rotate link
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void disable()}
                    className="text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Disable
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
