"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, FileText } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { DocumentCardRow, type DocumentListRow } from "@/components/docs/DocumentCardRow";
import { DocumentQuickModal } from "@/components/docs/DocumentQuickModal";
import { ShareDocumentPanel } from "@/components/docs/ShareDocumentPanel";
import type { SerializedLinkedMessage } from "@/lib/message-audience";
import type { DocumentType } from "@prisma/client";

const typeOptions = [
  { value: "ALL", label: "All types" },
  { value: "DOC", label: "Documentation" },
  { value: "SOP", label: "SOP" },
  { value: "MEETING_NOTES", label: "Meeting notes" },
  { value: "NOTE", label: "Note" },
];

interface ShareDocState {
  id: string;
  title: string;
  workspaceId: string | null;
  messageLinks: { message: SerializedLinkedMessage }[];
}

export function DocsClient() {
  const { selectedWorkspaceId, selectedWorkspace, isPersonal, canEditTasks } = useWorkspace();
  const [documents, setDocuments] = useState<DocumentListRow[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<DocumentType>("DOC");
  const [newBody, setNewBody] = useState("");
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [shareDoc, setShareDoc] = useState<ShareDocState | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ flat: "true" });
      if (selectedWorkspaceId) params.set("workspaceId", selectedWorkspaceId);
      if (search.trim()) params.set("search", search.trim());
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      const res = await fetch(`/api/documents?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load documents");
      setDocuments(data.documents);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspaceId, search, typeFilter]);

  useEffect(() => {
    const t = setTimeout(() => void fetchDocs(), 250);
    return () => clearTimeout(t);
  }, [fetchDocs]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          body: newBody,
          type: newType,
          workspaceId: selectedWorkspaceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      toast.success("Document created");
      setCreateOpen(false);
      setNewTitle("");
      setNewBody("");
      setNewType("DOC");
      await fetchDocs();
      setQuickViewId(data.document.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const openShare = async (docId: string) => {
    setShareLoading(true);
    setShareDoc(null);
    try {
      const res = await fetch(`/api/documents/${docId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load document");
      setShareDoc({
        id: data.document.id,
        title: data.document.title,
        workspaceId: data.document.workspaceId,
        messageLinks: data.document.messageLinks ?? [],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open share");
    } finally {
      setShareLoading(false);
    }
  };

  const handlePin = async (docId: string, pinned: boolean) => {
    const res = await fetch(`/api/documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    });
    if (!res.ok) {
      toast.error("Failed to update pin");
      return;
    }
    void fetchDocs();
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Delete this document permanently?")) return;
    const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Document deleted");
    void fetchDocs();
  };

  const refreshShareDoc = async () => {
    if (!shareDoc) return;
    const res = await fetch(`/api/documents/${shareDoc.id}`);
    const data = await res.json();
    if (res.ok) {
      setShareDoc((prev) =>
        prev
          ? {
              ...prev,
              messageLinks: data.document.messageLinks ?? [],
            }
          : null
      );
    }
    void fetchDocs();
  };

  const scopeLabel = isPersonal
    ? "Personal wiki"
    : `${selectedWorkspace?.name ?? "Team"} wiki`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Wiki"
        title="Docs"
        subtitle={scopeLabel}
        actions={
          canEditTasks && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New document
            </Button>
          )
        }
      />

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search docs..."
          hideLabel
          startIcon={<Search />}
          className="flex-1"
        />
        <Select
          label="Type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={typeOptions}
          className="sm:w-44"
        />
      </Card>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--surface-3)]" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <Card className="flex flex-col items-center py-16 text-center">
          <FileText className="mb-3 h-10 w-10 text-[var(--muted)]" />
          <p className="font-semibold text-[var(--foreground)]">No documents yet</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
            Create SOPs, meeting notes, and team documentation — link them to tasks or share in
            chat.
          </p>
          {canEditTasks && (
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New document
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentCardRow
              key={doc.id}
              doc={doc}
              readOnly={!canEditTasks}
              onQuickView={setQuickViewId}
              onShare={(id) => void openShare(id)}
              onPin={(id, pinned) => void handlePin(id, pinned)}
              onDelete={(id) => void handleDelete(id)}
            />
          ))}
        </div>
      )}

      <DocumentQuickModal
        documentId={quickViewId}
        isOpen={Boolean(quickViewId)}
        onClose={() => {
          setQuickViewId(null);
          void fetchDocs();
        }}
      />

      <Modal
        isOpen={Boolean(shareDoc) || shareLoading}
        onClose={() => {
          if (!shareLoading) setShareDoc(null);
        }}
        title={shareDoc ? `Share “${shareDoc.title}”` : "Share in chat"}
        description="Send this doc to a person, group, or team."
        size="md"
      >
        {shareLoading && (
          <p className="py-8 text-center text-sm text-[var(--muted)]">Loading…</p>
        )}
        {shareDoc && !shareLoading && (
          <ShareDocumentPanel
            documentId={shareDoc.id}
            workspaceId={shareDoc.workspaceId}
            shareHistory={shareDoc.messageLinks}
            readOnly={!canEditTasks}
            onShared={() => void refreshShareDoc()}
            onRemoveShare={async (messageId) => {
              await fetch(`/api/documents/${shareDoc.id}/links`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: "message", messageId }),
              });
              await refreshShareDoc();
            }}
          />
        )}
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New document"
        description="Add documentation, SOPs, or meeting notes to your wiki."
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Onboarding SOP"
          />
          <Select
            label="Type"
            value={newType}
            onChange={(e) => setNewType(e.target.value as DocumentType)}
            options={typeOptions.filter((o) => o.value !== "ALL")}
          />
          <Textarea
            label="Content (optional)"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            rows={6}
            placeholder="Start writing in markdown..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreate()}
              isLoading={creating}
              disabled={!newTitle.trim()}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
