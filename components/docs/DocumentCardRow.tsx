"use client";

import Link from "next/link";
import {
  CheckSquare2,
  ExternalLink,
  Eye,
  History,
  MessageSquare,
  Paperclip,
  Pin,
  Send,
  Trash2,
} from "lucide-react";
import type { DocumentType } from "@prisma/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DocumentTypeBadge } from "@/components/docs/DocumentTypeBadge";
import { DOCUMENT_TYPE_ICONS, formatDocDate } from "@/lib/document-ui";
import { cn } from "@/lib/utils";

export interface DocumentListRow {
  id: string;
  title: string;
  type: DocumentType;
  icon: string | null;
  pinned: boolean;
  updatedAt: string;
  user: { id: string; name: string };
  _count: {
    versions: number;
    comments: number;
    children: number;
    attachments: number;
    taskLinks?: number;
    messageLinks?: number;
  };
}

interface DocumentCardRowProps {
  doc: DocumentListRow;
  readOnly?: boolean;
  onQuickView: (id: string) => void;
  onShare: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
}

function StatChip({
  icon: Icon,
  label,
}: {
  icon: typeof History;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
}

export function DocumentCardRow({
  doc,
  readOnly,
  onQuickView,
  onShare,
  onPin,
  onDelete,
}: DocumentCardRowProps) {
  const icon = doc.icon ?? DOCUMENT_TYPE_ICONS[doc.type];

  return (
    <Card className="group flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <button
        type="button"
        onClick={() => onQuickView(doc.id)}
        className="flex min-w-0 flex-1 items-start gap-3 text-left sm:items-center"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-xl">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {doc.pinned && (
              <Pin className="h-3.5 w-3.5 shrink-0 fill-[var(--accent)] text-[var(--accent)]" />
            )}
            <h3 className="truncate text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)]">
              {doc.title}
            </h3>
            <DocumentTypeBadge type={doc.type} />
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {doc.user.name} · Updated {formatDocDate(doc.updatedAt)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatChip
              icon={History}
              label={`${doc._count.versions} ver${doc._count.versions !== 1 ? "s" : ""}`}
            />
            <StatChip
              icon={MessageSquare}
              label={`${doc._count.comments} comment${doc._count.comments !== 1 ? "s" : ""}`}
            />
            {doc._count.attachments > 0 && (
              <StatChip
                icon={Paperclip}
                label={`${doc._count.attachments} file${doc._count.attachments !== 1 ? "s" : ""}`}
              />
            )}
            {(doc._count.taskLinks ?? 0) > 0 && (
              <StatChip
                icon={CheckSquare2}
                label={`${doc._count.taskLinks} task${doc._count.taskLinks !== 1 ? "s" : ""}`}
              />
            )}
            {(doc._count.messageLinks ?? 0) > 0 && (
              <StatChip
                icon={Send}
                label={`${doc._count.messageLinks} share${doc._count.messageLinks !== 1 ? "s" : ""}`}
              />
            )}
            {doc._count.children > 0 && (
              <StatChip icon={ExternalLink} label={`${doc._count.children} sub-pages`} />
            )}
          </div>
        </div>
      </button>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-[var(--card-border)] pt-3 sm:border-t-0 sm:pt-0">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 gap-1.5 px-2.5"
          onClick={() => onQuickView(doc.id)}
          title="Quick view"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">View</span>
        </Button>
        {!readOnly && (
          <>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 gap-1.5 px-2.5"
              onClick={() => onShare(doc.id)}
              title="Share in chat"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn("h-8 w-8 p-0", doc.pinned && "text-[var(--accent)]")}
              onClick={() => onPin(doc.id, !doc.pinned)}
              title={doc.pinned ? "Unpin" : "Pin"}
            >
              <Pin className={cn("h-3.5 w-3.5", doc.pinned && "fill-current")} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-[var(--muted)] hover:text-red-500"
              onClick={() => onDelete(doc.id)}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <Link href={`/dashboard/docs/${doc.id}`}>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Open full editor">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
