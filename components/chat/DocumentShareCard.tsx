"use client";

import { useState } from "react";
import type { DocumentType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { DocumentTypeBadge } from "@/components/docs/DocumentTypeBadge";
import { DocumentQuickModal } from "@/components/docs/DocumentQuickModal";
import { DOCUMENT_TYPE_ICONS } from "@/lib/document-ui";

export interface SharedDocumentPreview {
  id: string;
  title: string;
  type: DocumentType | string;
  icon: string | null;
}

interface DocumentShareCardProps {
  document: SharedDocumentPreview;
  isOwn?: boolean;
  className?: string;
}

export function DocumentShareCard({ document, isOwn, className }: DocumentShareCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const icon = document.icon?.trim() || DOCUMENT_TYPE_ICONS[document.type as DocumentType] || "📄";

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={cn(
          "mt-2 flex w-full max-w-xs cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors hover:shadow-sm",
          isOwn
            ? "border-white/25 bg-white/10 hover:bg-white/15"
            : "border-[var(--card-border)] bg-[var(--surface-hover)] hover:bg-[var(--card)]",
          className
        )}
      >
        <span className="text-xl leading-none" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm font-semibold",
              isOwn ? "text-white" : "text-[var(--foreground)]"
            )}
          >
            {document.title}
          </span>
          <DocumentTypeBadge
            type={document.type as DocumentType}
            className={cn("mt-1", isOwn && "border-white/20 bg-white/10 text-white/90")}
          />
        </span>
      </button>

      <DocumentQuickModal
        documentId={document.id}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
