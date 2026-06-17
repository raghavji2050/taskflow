"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { DocumentType } from "@prisma/client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { DocumentTypeBadge } from "@/components/docs/DocumentTypeBadge";
import {
  DocumentAttachmentsPanel,
  type DocumentAttachmentRow,
} from "@/components/docs/DocumentAttachmentsPanel";
import { DOCUMENT_TYPE_ICONS, formatDocDate } from "@/lib/document-ui";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { MomQuickModal } from "@/components/chat/MomQuickModal";

interface DocumentQuickModalProps {
  documentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  readOnly?: boolean;
}

interface DocumentPreview {
  id: string;
  title: string;
  body: string;
  type: DocumentType;
  icon: string | null;
  updatedAt: string;
  user: { name: string };
  _count: { versions: number; comments: number; attachments: number };
  taskLinks: { task: { id: string; title: string } }[];
  attachments: DocumentAttachmentRow[];
  meetingMinutes?: { id: string } | null;
}

const typeOptions = [
  { value: "DOC", label: "Documentation" },
  { value: "SOP", label: "SOP" },
  { value: "MEETING_NOTES", label: "Meeting notes" },
  { value: "NOTE", label: "Note" },
];

export function DocumentQuickModal({
  documentId,
  isOpen,
  onClose,
  readOnly: readOnlyProp,
}: DocumentQuickModalProps) {
  const { canEditTasks } = useWorkspace();
  const readOnly = readOnlyProp ?? !canEditTasks;

  const [doc, setDoc] = useState<DocumentPreview | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<DocumentType>("DOC");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [momModalOpen, setMomModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load document");
      const document = data.document as DocumentPreview;
      setDoc(document);
      setTitle(document.title);
      setBody(document.body);
      setType(document.type);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load document");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [documentId, onClose]);

  useEffect(() => {
    if (isOpen && documentId) void load();
    if (!isOpen) {
      setDoc(null);
      setTitle("");
      setBody("");
    }
  }, [isOpen, documentId, load]);

  const save = async () => {
    if (!documentId || readOnly) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setDoc(data.document);
      setTitle(data.document.title);
      setBody(data.document.body);
      setType(data.document.type);
      toast.success("Document saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = doc
    ? `${doc.icon ?? DOCUMENT_TYPE_ICONS[doc.type]} ${doc.title}`
    : "Document";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={loading ? "Loading…" : modalTitle}
      description={
        doc
          ? `${doc.user.name} · ${formatDocDate(doc.updatedAt)} · ${doc._count.comments} comment${doc._count.comments === 1 ? "" : "s"}${doc._count.attachments > 0 ? ` · ${doc._count.attachments} file${doc._count.attachments === 1 ? "" : "s"}` : ""}`
          : undefined
      }
      size="xl"
      priority="elevated"
      footer={
        doc ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DocumentTypeBadge type={doc.type} />
            <div className="flex flex-wrap gap-2">
              {doc.meetingMinutes?.id && (
                <Button variant="secondary" size="sm" onClick={() => setMomModalOpen(true)}>
                  Edit structured MoM
                </Button>
              )}
              <Link href={`/dashboard/docs/${doc.id}`} onClick={onClose}>
                <Button variant="secondary" size="sm">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open full editor
                </Button>
              </Link>
              {!readOnly && (
                <Button size="sm" onClick={() => void save()} isLoading={saving}>
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
              )}
            </div>
          </div>
        ) : undefined
      }
    >
      {loading && (
        <div className="flex items-center justify-center py-16 text-sm text-[var(--muted)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading document…
        </div>
      )}
      {!loading && doc && (
        <div className="space-y-4">
          {!readOnly && (
            <>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                label="Title"
                hideLabel
                className="text-base font-semibold"
              />
              <Select
                label="Type"
                value={type}
                onChange={(e) => setType(e.target.value as DocumentType)}
                options={typeOptions}
              />
            </>
          )}
          {readOnly && (
            <div className="flex items-center gap-2">
              <DocumentTypeBadge type={doc.type} />
            </div>
          )}
          <Textarea
            label="Content"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={readOnly}
            rows={14}
            className="min-h-[280px] font-mono text-sm"
          />
          {doc.taskLinks.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase text-[var(--muted)]">Linked tasks</p>
              <ul className="space-y-1">
                {doc.taskLinks.map(({ task }) => (
                  <li key={task.id} className="text-sm text-[var(--foreground)]">
                    {task.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {doc.attachments.length > 0 && (
            <DocumentAttachmentsPanel
              documentId={doc.id}
              attachments={doc.attachments}
              readOnly
              onChange={() => void load()}
            />
          )}
        </div>
      )}
      {doc?.meetingMinutes?.id && (
        <MomQuickModal
          momId={doc.meetingMinutes.id}
          isOpen={momModalOpen}
          onClose={() => setMomModalOpen(false)}
          onUpdated={() => void load()}
        />
      )}
    </Modal>
  );
}
