"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  images: { url: string; alt: string }[];
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
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
        className="max-h-[90vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}

interface MessageAttachmentPreviewProps {
  attachments: { id: string; filename: string; url: string; mimeType: string }[];
  isOwn?: boolean;
  messageBody?: string;
}

export function MessageAttachmentPreview({
  attachments,
  isOwn,
  messageBody,
}: MessageAttachmentPreviewProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const images = attachments.filter((a) => isImageAttachment(a.mimeType));
  const files = attachments.filter((a) => !isImageAttachment(a.mimeType));
  const hideBodyForImages =
    images.length > 0 &&
    images.every((img) => messageBody && isAttachmentOnlyBody(messageBody, img.filename));

  return (
    <>
      {images.length > 0 && (
        <div
          className={cn(
            "mt-2 grid gap-1",
            images.length > 1 ? "grid-cols-2" : "grid-cols-1"
          )}
        >
          {images.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.filename}
                loading="lazy"
                className="max-h-48 w-full max-w-[240px] object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={cn("space-y-1", images.length > 0 && "mt-2")}>
          {files.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs underline",
                isOwn ? "bg-white/10" : "bg-[var(--surface-hover)]"
              )}
            >
              📎 {a.filename}
            </a>
          ))}
        </div>
      )}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={images.map((a) => ({ url: a.url, alt: a.filename }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      {hideBodyForImages ? <span className="sr-only">{messageBody}</span> : null}
    </>
  );
}

import { isImageAttachment, isAttachmentOnlyBody } from "@/lib/attachments";
