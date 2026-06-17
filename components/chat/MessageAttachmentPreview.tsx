"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Film,
  Loader2,
  Music,
  Presentation,
  X,
} from "lucide-react";
import {
  formatFileSize,
  getAttachmentKind,
  getFileExtension,
  isAttachmentOnlyBody,
  isImageAttachment,
  isPdfAttachment,
  type AttachmentKind,
} from "@/lib/attachments";
import { getAttachmentDownloadUrl, getAttachmentServeUrl } from "@/lib/blob-url";
import { cn } from "@/lib/utils";

interface AttachmentRow {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size?: number;
}

const KIND_META: Record<
  AttachmentKind,
  { icon: typeof File; stripe: string; badge: string; label: string }
> = {
  image: { icon: File, stripe: "bg-emerald-500/15 text-emerald-600", badge: "bg-emerald-500", label: "Image" },
  pdf: { icon: FileText, stripe: "bg-red-500/15 text-red-600", badge: "bg-red-500", label: "PDF" },
  video: { icon: Film, stripe: "bg-violet-500/15 text-violet-600", badge: "bg-violet-500", label: "Video" },
  audio: { icon: Music, stripe: "bg-pink-500/15 text-pink-600", badge: "bg-pink-500", label: "Audio" },
  word: { icon: FileText, stripe: "bg-blue-500/15 text-blue-600", badge: "bg-blue-500", label: "Document" },
  spreadsheet: {
    icon: FileSpreadsheet,
    stripe: "bg-green-500/15 text-green-600",
    badge: "bg-green-600",
    label: "Spreadsheet",
  },
  presentation: {
    icon: Presentation,
    stripe: "bg-orange-500/15 text-orange-600",
    badge: "bg-orange-500",
    label: "Presentation",
  },
  archive: { icon: Archive, stripe: "bg-amber-500/15 text-amber-700", badge: "bg-amber-500", label: "Archive" },
  text: { icon: FileText, stripe: "bg-slate-500/15 text-slate-600", badge: "bg-slate-500", label: "Text" },
  code: { icon: FileCode, stripe: "bg-cyan-500/15 text-cyan-600", badge: "bg-cyan-500", label: "Code" },
  other: { icon: File, stripe: "bg-zinc-500/15 text-zinc-600", badge: "bg-zinc-500", label: "File" },
};

function attachmentDisplayUrl(storedUrl: string) {
  if (!storedUrl) return "";
  if (storedUrl.startsWith("blob:")) return storedUrl;
  return getAttachmentServeUrl(storedUrl);
}

function attachmentDownloadHref(storedUrl: string, filename: string) {
  if (!storedUrl) return undefined;
  if (storedUrl.startsWith("blob:")) return storedUrl;
  return getAttachmentDownloadUrl(storedUrl, filename);
}

function ImageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse bg-[var(--surface-hover)]",
        className
      )}
      aria-hidden
    />
  );
}

function UploadOverlay({ label = "Uploading…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-black/45 backdrop-blur-[1px]">
      <Loader2 className="h-6 w-6 animate-spin text-white" aria-hidden />
      <span className="text-[10px] font-medium text-white/90">{label}</span>
    </div>
  );
}

interface ImageLightboxProps {
  images: { url: string; alt: string; downloadHref?: string }[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && images.length > 1) {
        setIndex((i) => (i - 1 + images.length) % images.length);
      }
      if (e.key === "ArrowRight" && images.length > 1) {
        setIndex((i) => (i + 1) % images.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  if (!mounted) return null;

  const current = images[index];
  if (!current) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 truncate text-sm font-medium text-white">{current.alt}</p>
        <div className="flex shrink-0 items-center gap-1">
          {current.downloadHref && (
            <a
              href={current.downloadHref}
              download={current.alt}
              className="rounded-lg p-2 cursor-pointer text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-4"
        onClick={onClose}
      >
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + images.length) % images.length);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % images.length);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 md:right-14"
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.url}
        alt={current.alt}
        className="max-h-[85vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      </div>
    </div>,
    document.body
  );
}

function MediaLightbox({
  attachment,
  onClose,
}: {
  attachment: AttachmentRow;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const url = attachmentDisplayUrl(attachment.url);
  const downloadHref = attachmentDownloadHref(attachment.url, attachment.filename);
  const isPdf = isPdfAttachment(attachment.mimeType, attachment.filename);
  const kind = getAttachmentKind(attachment.mimeType, attachment.filename);
  const isVideo = kind === "video";
  const isAudio = kind === "audio";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={isPdf ? "PDF preview" : isVideo ? "Video preview" : "Audio preview"}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <p className="min-w-0 truncate text-sm font-medium text-white">{attachment.filename}</p>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          {downloadHref && (
            <a
              href={downloadHref}
              download={attachment.filename}
              className="rounded-lg p-2 cursor-pointer text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2 md:p-4">
        {isPdf ? (
          <iframe
            src={`${url}#toolbar=1&navpanes=0`}
            title={attachment.filename}
            className="h-full w-full max-w-5xl rounded-lg bg-white"
          />
        ) : isVideo ? (
          <video
            src={url}
            controls
            autoPlay
            className="max-h-full max-w-full rounded-lg bg-black"
          >
            <track kind="captions" />
          </video>
        ) : isAudio ? (
          <div className="w-full max-w-md rounded-2xl bg-[var(--card)] p-6 shadow-xl">
            <p className="mb-4 truncate text-center text-sm font-medium text-[var(--foreground)]">
              {attachment.filename}
            </p>
            <audio src={url} controls autoPlay className="w-full">
              <track kind="captions" />
            </audio>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function DownloadIconButton({
  href,
  filename,
  className,
}: {
  href?: string;
  filename: string;
  className?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      download={filename}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md cursor-pointer text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
        className
      )}
      aria-label={`Download ${filename}`}
    >
      <Download className="h-3.5 w-3.5" />
    </a>
  );
}

function FileAttachmentCard({
  attachment,
  isOwn,
  onPreview,
  variant = "standalone",
  isSending,
}: {
  attachment: AttachmentRow;
  isOwn?: boolean;
  onPreview?: () => void;
  variant?: "standalone" | "inBubble";
  isSending?: boolean;
}) {
  const kind = getAttachmentKind(attachment.mimeType, attachment.filename);
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const ext = getFileExtension(attachment.filename);
  const downloadHref = attachmentDownloadHref(attachment.url, attachment.filename);
  const previewable = kind === "pdf" || kind === "video" || kind === "audio";
  const inOwnBubble = Boolean(isOwn && variant === "inBubble");

  const shellClass = cn(
    "relative flex min-w-[200px] max-w-[280px] overflow-hidden rounded-xl border text-left shadow-sm transition hover:shadow-md",
    inOwnBubble
      ? "border-white/25 bg-white/12 hover:bg-white/18"
      : isOwn
        ? "border-white/40 bg-white shadow-md hover:shadow-lg"
        : "border-[var(--card-border)] bg-[var(--card)] hover:bg-[var(--surface-hover)]"
  );

  const metaBlock = (
    <>
      <p
        className={cn(
          "line-clamp-2 text-xs font-medium leading-snug",
          inOwnBubble ? "text-white" : isOwn ? "text-zinc-900" : "text-[var(--foreground)]"
        )}
      >
        {attachment.filename}
      </p>
      <p
        className={cn(
          "mt-1 text-[10px] leading-tight",
          inOwnBubble ? "text-white/75" : isOwn ? "text-zinc-500" : "text-[var(--muted)]"
        )}
      >
        {attachment.size ? formatFileSize(attachment.size) : meta.label}
        {previewable && attachment.url ? " · Tap to preview" : ""}
      </p>
    </>
  );

  const downloadBtnClass = inOwnBubble
    ? "text-white/75 hover:bg-white/10 hover:text-white"
    : isOwn
      ? "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
      : undefined;

  const iconColumn = (
    <div className={cn("flex w-14 shrink-0 flex-col items-center justify-center gap-1 py-3", meta.stripe)}>
      <Icon className="h-5 w-5" />
      <span
        className={cn(
          "rounded px-1 py-0.5 text-[9px] font-bold leading-none text-white",
          meta.badge
        )}
      >
        {ext.slice(0, 4)}
      </span>
    </div>
  );

  if (previewable && onPreview && attachment.url) {
    return (
      <div className={shellClass}>
        {isSending && <UploadOverlay />}
        {iconColumn}
        <button
          type="button"
          onClick={onPreview}
          className="flex min-w-0 flex-1 cursor-pointer flex-col justify-center px-2.5 py-2 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent)]"
        >
          {metaBlock}
        </button>
        <div className="flex shrink-0 items-center pr-1">
          <DownloadIconButton
            href={downloadHref}
            filename={attachment.filename}
            className={downloadBtnClass}
          />
        </div>
      </div>
    );
  }

  if (downloadHref) {
    return (
      <div className={shellClass}>
        {isSending && <UploadOverlay />}
        {iconColumn}
        <div className="flex min-w-0 flex-1 flex-col justify-center px-2.5 py-2">{metaBlock}</div>
        <div className="flex shrink-0 items-center pr-1">
          <DownloadIconButton
            href={downloadHref}
            filename={attachment.filename}
            className={downloadBtnClass}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {isSending && <UploadOverlay />}
      {iconColumn}
      <div className="flex min-w-0 flex-1 flex-col justify-center px-2.5 py-2">{metaBlock}</div>
    </div>
  );
}

function ChatImageThumbnail({
  attachment,
  isOwn,
  single,
  onOpen,
  variant = "standalone",
  isSending,
}: {
  attachment: AttachmentRow;
  isOwn?: boolean;
  single: boolean;
  onOpen: () => void;
  variant?: "standalone" | "inBubble";
  isSending?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const src = attachmentDisplayUrl(attachment.url);
  const downloadHref = attachmentDownloadHref(attachment.url, attachment.filename);
  const showSkeleton = !loaded && src && !isSending;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border",
        variant === "inBubble" && isOwn ? "border-white/20" : "border-[var(--card-border)]",
        single ? "max-w-[280px]" : "aspect-square max-w-[140px]",
        src && !isSending && "cursor-pointer"
      )}
    >
      {isSending && <UploadOverlay />}
      {showSkeleton && (
        <ImageSkeleton
          className={cn(
            "absolute inset-0",
            single ? "min-h-[8rem] w-full" : "h-full w-full"
          )}
        />
      )}
      {src ? (
        <button
          type="button"
          onClick={onOpen}
          disabled={isSending}
          className="block h-full w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-default"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={attachment.filename}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={cn(
              "bg-black/5 object-cover transition group-hover:scale-[1.02]",
              single ? "max-h-52 w-full object-contain" : "h-full w-full",
              !loaded && !isSending && "opacity-0"
            )}
          />
        </button>
      ) : (
        <ImageSkeleton className={single ? "min-h-[8rem] w-full" : "h-full w-full min-h-[5rem]"} />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 transition group-hover:opacity-100">
        <p className="truncate text-[10px] font-medium text-white">{attachment.filename}</p>
      </div>
      {downloadHref && (
        <a
          href={downloadHref}
          download={attachment.filename}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-black/50 text-white opacity-0 transition hover:bg-black/70 group-hover:opacity-100"
          aria-label={`Download ${attachment.filename}`}
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

interface MessageAttachmentPreviewProps {
  attachments: AttachmentRow[];
  isOwn?: boolean;
  messageBody?: string;
  isSending?: boolean;
  variant?: "standalone" | "inBubble";
}

export function MessageAttachmentPreview({
  attachments,
  isOwn,
  messageBody,
  isSending,
  variant = "standalone",
}: MessageAttachmentPreviewProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mediaPreview, setMediaPreview] = useState<AttachmentRow | null>(null);

  const images = attachments.filter((a) => isImageAttachment(a.mimeType));
  const files = attachments.filter((a) => !isImageAttachment(a.mimeType));
  const hideBodyForImages =
    images.length > 0 &&
    images.every((img) => messageBody && isAttachmentOnlyBody(messageBody, img.filename));

  return (
    <div className={cn(variant === "inBubble" && "mt-2")}>
      {images.length > 0 && (
        <div
          className={cn(
            "grid gap-1.5",
            images.length === 1 ? "grid-cols-1" : "grid-cols-2"
          )}
        >
          {images.map((a, i) => (
            <ChatImageThumbnail
              key={a.id}
              attachment={a}
              isOwn={isOwn}
              single={images.length === 1}
              onOpen={() => setLightboxIndex(i)}
              variant={variant}
              isSending={isSending}
            />
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap gap-2",
            images.length > 0 && "mt-1.5"
          )}
        >
          {files.map((a) => (
            <FileAttachmentCard
              key={a.id}
              attachment={a}
              isOwn={isOwn}
              variant={variant}
              isSending={isSending}
              onPreview={() => setMediaPreview(a)}
            />
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images.map((a) => ({
            url: attachmentDisplayUrl(a.url),
            alt: a.filename,
            downloadHref: attachmentDownloadHref(a.url, a.filename),
          }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {mediaPreview && (
        <MediaLightbox attachment={mediaPreview} onClose={() => setMediaPreview(null)} />
      )}

      {hideBodyForImages ? <span className="sr-only">{messageBody}</span> : null}
    </div>
  );
}
