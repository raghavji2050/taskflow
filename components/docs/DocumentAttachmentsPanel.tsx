"use client";

import { useRef, useState, useEffect } from "react";
import {
  Download,
  Eye,
  File,
  FileImage,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ImageLightbox } from "@/components/chat/MessageAttachmentPreview";
import {
  formatFileSize,
  isImageAttachment,
  isPdfAttachment,
} from "@/lib/attachments";
import { formatRelativeDate, cn } from "@/lib/utils";

export interface DocumentAttachmentRow {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
  user: { id: string; name: string };
}

interface DocumentAttachmentsPanelProps {
  documentId: string;
  attachments: DocumentAttachmentRow[];
  readOnly?: boolean;
  onChange: () => void;
}

function fileIcon(mimeType: string, filename: string) {
  if (isPdfAttachment(mimeType, filename)) return FileText;
  if (isImageAttachment(mimeType)) return FileImage;
  return File;
}

export function DocumentAttachmentsPanel({
  documentId,
  attachments,
  readOnly = false,
  onChange,
}: DocumentAttachmentsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (attachments.length === 0) {
      setPreviewId(null);
      return;
    }
    setPreviewId((current) => {
      if (current && attachments.some((a) => a.id === current)) return current;
      return (
        attachments.find((a) => isPdfAttachment(a.mimeType, a.filename))?.id ?? null
      );
    });
  }, [attachments]);

  const preview = attachments.find((a) => a.id === previewId) ?? null;

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/documents/${documentId}/attachments`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast.success(`Uploaded ${file.name}`);
      setPreviewId(data.attachment.id);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const remove = async (attachmentId: string) => {
    if (!confirm("Remove this attachment?")) return;
    setDeletingId(attachmentId);
    try {
      const res = await fetch(
        `/api/documents/${documentId}/attachments/${attachmentId}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Attachment removed");
      if (previewId === attachmentId) setPreviewId(null);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg bg-[var(--accent-soft)]/50 px-3 py-2.5 text-xs leading-relaxed text-[var(--muted)]">
        <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        Attach PDFs, images, and files. PDFs open inline below — click any file to preview.
      </p>

      {!readOnly && (
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.md,.zip"
            onChange={(e) => void upload(e)}
          />
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload file"}
          </Button>
          <p className="mt-1.5 text-center text-[10px] text-[var(--muted)]">Max 20 MB per file</p>
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--muted)]">No attachments yet.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((file) => {
            const Icon = fileIcon(file.mimeType, file.filename);
            const isPdf = isPdfAttachment(file.mimeType, file.filename);
            const isImage = isImageAttachment(file.mimeType);
            const isActive = previewId === file.id;

            return (
              <li
                key={file.id}
                className={cn(
                  "rounded-lg border p-2.5 transition-colors",
                  isActive
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
                    : "border-[var(--card-border)] bg-[var(--card)]"
                )}
              >
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--foreground)]">
                      {file.filename}
                    </p>
                    <p className="text-[10px] text-[var(--muted)]">
                      {formatFileSize(file.size)} · {file.user.name} ·{" "}
                      {formatRelativeDate(file.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    {(isPdf || isImage) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        aria-label="Preview"
                        onClick={() => {
                          if (isImage) setLightboxUrl(file.url);
                          else setPreviewId(file.id);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <a
                      href={file.url}
                      download={file.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                      aria-label="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    {!readOnly && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-[var(--muted)] hover:text-red-500"
                        disabled={deletingId === file.id}
                        aria-label="Remove"
                        onClick={() => void remove(file.id)}
                      >
                        {deletingId === file.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                {!isPdf && !isImage && (
                  <button
                    type="button"
                    onClick={() => setPreviewId(isActive ? null : file.id)}
                    className="mt-2 text-[10px] text-[var(--accent)] hover:underline"
                  >
                    {isActive ? "Hide details" : "Show in list"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {preview && isPdfAttachment(preview.mimeType, preview.filename) && (
        <div className="overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--background)]">
          <div className="flex items-center justify-between border-b border-[var(--card-border)] px-3 py-2">
            <p className="truncate text-xs font-medium text-[var(--foreground)]">
              {preview.filename}
            </p>
            <button
              type="button"
              onClick={() => setPreviewId(null)}
              className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface-hover)]"
              aria-label="Close preview"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <iframe
            src={`${preview.url}#toolbar=1&navpanes=0`}
            title={preview.filename}
            className="h-[min(420px,55vh)] w-full bg-white"
          />
        </div>
      )}

      {lightboxUrl && (
        <ImageLightbox
          images={[{ url: lightboxUrl, alt: "Attachment preview" }]}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </div>
  );
}
