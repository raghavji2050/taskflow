"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Paperclip, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { formatFileSize, getFileExtension, isImageAttachment } from "@/lib/attachments";
import { getAttachmentDownloadUrl, getAttachmentServeUrl } from "@/lib/blob-url";
import {
  MAX_SERVER_UPLOAD_BYTES,
  MAX_TASK_ATTACHMENT_BYTES,
  taskAttachmentPrefix,
  validateTaskAttachment,
} from "@/lib/task-attachment-rules";
import { cn, formatRelativeDate } from "@/lib/utils";

export interface TaskAttachmentItem {
  id: string;
  filename: string;
  url: string;
  mimeType?: string;
  size?: number;
  createdAt?: string;
}

async function uploadDirect(taskId: string, file: File) {
  const { upload } = await import("@vercel/blob/client");
  const blob = await upload(`${taskAttachmentPrefix(taskId)}${file.name}`, file, {
    access: "private",
    handleUploadUrl: `/api/tasks/${taskId}/attachments/upload-token`,
    clientPayload: JSON.stringify({ filename: file.name, size: file.size }),
    multipart: file.size > 5 * 1024 * 1024,
  });
  const res = await fetch(`/api/tasks/${taskId}/attachments/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: blob.url, filename: file.name }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
}

async function uploadViaServer(taskId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
}

export function TaskAttachments({
  taskId,
  readOnly = false,
  initial,
  onChanged,
}: {
  taskId: string;
  readOnly?: boolean;
  initial: TaskAttachmentItem[];
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<TaskAttachmentItem[]>(initial);
  const [directUpload, setDirectUpload] = useState(false);
  const [busy, setBusy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/attachments`);
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.attachments ?? []);
    setDirectUpload(Boolean(data.directUpload));
  }, [taskId]);

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    let count = items.length;
    let ok = 0;
    for (const file of files) {
      const err = validateTaskAttachment({ filename: file.name, size: file.size, existingCount: count });
      if (err) {
        toast.error(err);
        continue;
      }
      setBusy((n) => n + 1);
      try {
        if (directUpload) {
          try {
            await uploadDirect(taskId, file);
          } catch (e) {
            if (file.size > MAX_SERVER_UPLOAD_BYTES) throw e;
            await uploadViaServer(taskId, file);
          }
        } else {
          await uploadViaServer(taskId, file);
        }
        ok += 1;
        count += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (ok > 0) {
      toast.success(ok === 1 ? "File uploaded" : `${ok} files uploaded`);
      await refresh();
      onChanged?.();
    }
  };

  const remove = async (a: TaskAttachmentItem) => {
    if (!window.confirm(`Remove ${a.filename}?`)) return;
    const res = await fetch(`/api/tasks/${taskId}/attachments/${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error((await res.json().catch(() => ({}))).error ?? "Could not remove file");
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== a.id));
    toast.success("File removed");
    onChanged?.();
  };

  return (
    <div data-testid="task-attachments">
      {items.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No files attached</p>
      ) : (
        <ul className="space-y-1.5" aria-label="Attached files">
          {items.map((a) => {
            const isImage = isImageAttachment(a.mimeType ?? "");
            const serve = getAttachmentServeUrl(a.url);
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface)] p-1.5"
              >
                <a href={serve} target="_blank" rel="noopener noreferrer" className="shrink-0" tabIndex={-1} aria-hidden>
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={serve} alt="" className="h-9 w-9 rounded object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-9 w-9 flex-col items-center justify-center rounded bg-[var(--accent-soft)] text-[9px] font-semibold text-[var(--accent)]">
                      <FileText className="h-3.5 w-3.5" />
                      {getFileExtension(a.filename).slice(0, 4)}
                    </span>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <a
                    href={serve}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm text-[var(--accent)] hover:underline"
                  >
                    {a.filename}
                  </a>
                  <p className="truncate text-[11px] text-[var(--muted)]">
                    {[a.size ? formatFileSize(a.size) : null, a.createdAt ? formatRelativeDate(a.createdAt) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <a
                  href={getAttachmentDownloadUrl(a.url, a.filename)}
                  download={a.filename}
                  className="rounded p-1.5 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                  aria-label={`Download ${a.filename}`}
                >
                  <Download className="h-4 w-4" />
                </a>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => void remove(a)}
                    className="rounded p-1.5 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-500"
                    aria-label={`Remove ${a.filename}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void uploadFiles(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            "mt-3 flex flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-3 text-center text-xs text-[var(--muted)] transition-colors",
            dragging ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--card-border)]"
          )}
        >
          {busy > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
            </span>
          ) : (
            <UploadCloud className="h-4 w-4" />
          )}
          <span>
            Drop files here or{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
            >
              <Paperclip className="h-3 w-3" />
              browse
            </button>
          </span>
          <span className="text-[10px]">Up to {formatFileSize(MAX_TASK_ATTACHMENT_BYTES)} each</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            aria-label="Upload files"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void uploadFiles(files);
            }}
          />
        </div>
      )}
    </div>
  );
}
