"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  History,
  MessageSquare,
  Save,
  Trash2,
  Pin,
  Paperclip,
  RotateCcw,
  CheckSquare2,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { TaskEditModal } from "@/components/TaskEditModal";
import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { DocumentTypeBadge } from "@/components/docs/DocumentTypeBadge";
import { DOCUMENT_TYPE_ICONS, formatDocDate } from "@/lib/document-ui";
import { cn, formatRelativeDate, getStatusColor } from "@/lib/utils";
import type { DocumentType } from "@prisma/client";
import { LinkTaskPicker } from "@/components/docs/LinkTaskPicker";
import { ShareDocumentPanel } from "@/components/docs/ShareDocumentPanel";
import type { SerializedLinkedMessage } from "@/lib/message-audience";
import {
  DocumentAttachmentsPanel,
  type DocumentAttachmentRow,
} from "@/components/docs/DocumentAttachmentsPanel";

interface DocumentData {
  id: string;
  title: string;
  body: string;
  type: DocumentType;
  icon: string | null;
  pinned: boolean;
  archived: boolean;
  workspaceId: string | null;
  updatedAt: string;
  user: { id: string; name: string };
  children: { id: string; title: string; type: DocumentType; icon: string | null }[];
  taskLinks: { task: { id: string; title: string; status: string; workspaceId: string | null } }[];
  messageLinks: {
    message: SerializedLinkedMessage;
  }[];
  attachments: DocumentAttachmentRow[];
  _count: { versions: number; comments: number; attachments: number };
}

interface VersionRow {
  id: string;
  versionNumber: number;
  title: string;
  changeNote: string | null;
  createdAt: string;
  user: { name: string };
}

interface CommentRow {
  id: string;
  body: string;
  createdAt: string;
  user: { name: string };
  version?: { versionNumber: number } | null;
  replies?: CommentRow[];
}

type SideSection = "versions" | "comments" | "tasks" | "chat" | "files";

const sideSections: {
  id: SideSection;
  icon: typeof History;
  label: string;
  countKey?: keyof DocumentData["_count"] | "taskLinks" | "messageLinks";
}[] = [
  { id: "versions", icon: History, label: "Versions", countKey: "versions" },
  { id: "comments", icon: MessageSquare, label: "Comments", countKey: "comments" },
  { id: "tasks", icon: CheckSquare2, label: "Link to task", countKey: "taskLinks" },
  { id: "chat", icon: Send, label: "Share in chat", countKey: "messageLinks" },
  { id: "files", icon: Paperclip, label: "Files", countKey: "attachments" },
];

function getSectionCount(doc: DocumentData, key?: (typeof sideSections)[number]["countKey"]) {
  if (!key) return 0;
  if (key === "taskLinks") return doc.taskLinks.length;
  if (key === "messageLinks") return doc.messageLinks.length;
  return doc._count[key] ?? 0;
}

const typeOptions = [
  { value: "DOC", label: "Documentation" },
  { value: "SOP", label: "SOP" },
  { value: "MEETING_NOTES", label: "Meeting notes" },
  { value: "NOTE", label: "Note" },
];

const taskStatusLabel: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
};

export function DocumentEditorClient({ documentId }: { documentId: string }) {
  const router = useRouter();
  const {
    canEditTasks,
    selectedWorkspaceId,
    selectedWorkspace,
    members,
  } = useWorkspace();
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<DocumentType>("DOC");
  const [changeNote, setChangeNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Set<SideSection>>(
    () => new Set(["versions"])
  );
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isTaskSubmitting, setIsTaskSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setDoc(data.document);
      setTitle(data.document.title);
      setBody(data.document.body);
      setType(data.document.type);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  const loadVersions = useCallback(async () => {
    const res = await fetch(`/api/documents/${documentId}/versions`);
    const data = await res.json();
    if (res.ok) setVersions(data.versions);
  }, [documentId]);

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/documents/${documentId}/comments`);
    const data = await res.json();
    if (res.ok) setComments(data.comments);
  }, [documentId]);

  useEffect(() => {
    void load();
    void loadVersions();
    void loadComments();
  }, [load, loadVersions, loadComments]);

  const toggleSection = (id: SideSection) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, type, changeNote: changeNote || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setDoc(data.document);
      setChangeNote("");
      toast.success("Saved");
      void loadVersions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = async (versionId: string, versionNumber: number) => {
    if (!confirm(`Restore version ${versionNumber}? This creates a new version.`)) return;
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restore failed");
      setTitle(data.document.title);
      setBody(data.document.body);
      toast.success(`Restored v${versionNumber}`);
      void load();
      void loadVersions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    const res = await fetch(`/api/documents/${documentId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newComment.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Comment failed");
      return;
    }
    setNewComment("");
    void loadComments();
  };

  const linkTask = async (taskId: string) => {
    const res = await fetch(`/api/documents/${documentId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "task", taskId }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Link failed");
      return;
    }
    toast.success("Task linked");
    void load();
  };

  const removeShare = async (messageId: string) => {
    await fetch(`/api/documents/${documentId}/links`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "message", messageId }),
    });
    void load();
  };

  const unlinkTask = async (taskId: string) => {
    await fetch(`/api/documents/${documentId}/links`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "task", taskId }),
    });
    void load();
  };

  const deleteDoc = async () => {
    if (!confirm("Delete this document permanently?")) return;
    const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Document deleted");
    router.push("/dashboard/docs");
  };

  const togglePin = async () => {
    const res = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !doc?.pinned }),
    });
    if (res.ok) void load();
  };

  const openLinkedTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load task");
      setEditingTask(data.task);
      setIsTaskModalOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open task");
    }
  };

  const handleTaskUpdate = async (formData: TaskInput) => {
    if (!editingTask) return;
    setIsTaskSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${editingTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          workspaceId: editingTask.workspaceId ?? doc?.workspaceId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save task");
      toast.success("Task updated");
      setIsTaskModalOpen(false);
      setEditingTask(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setIsTaskSubmitting(false);
    }
  };

  if (loading || !doc) {
    return <div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />;
  }

  const readOnly = !canEditTasks;
  const taskWorkspaceId =
    editingTask?.workspaceId ?? doc.workspaceId ?? selectedWorkspaceId ?? null;
  const taskIsPersonal = !taskWorkspaceId;
  const taskModalMembers =
    taskWorkspaceId && selectedWorkspaceId === taskWorkspaceId
      ? members.map((m) => m.user)
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/dashboard/docs">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            All docs
          </Button>
        </Link>
        <DocumentTypeBadge type={doc.type} />
        <span className="text-xs text-[var(--muted)]">
          {doc.user.name} · {formatDocDate(doc.updatedAt)}
        </span>
        <div className="ml-auto flex gap-2">
          {!readOnly && (
            <>
              <Button variant="secondary" size="sm" onClick={() => void togglePin()}>
                <Pin className={cn("h-4 w-4", doc.pinned && "fill-current")} />
              </Button>
              <Button variant="danger" size="sm" onClick={() => void deleteDoc()}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => void save()} isLoading={saving}>
                <Save className="h-4 w-4" />
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-4 p-4 sm:p-6">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={readOnly}
            className="text-lg font-semibold"
            hideLabel
            placeholder="Document title"
          />
          {!readOnly && (
            <Select
              label="Type"
              value={type}
              onChange={(e) => setType(e.target.value as DocumentType)}
              options={typeOptions}
            />
          )}
          <Textarea
            label="Content"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={readOnly}
            rows={20}
            className="font-mono text-sm"
            placeholder="Write in markdown..."
          />
          {!readOnly && (
            <Input
              label="Version note (optional)"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="What changed in this save?"
            />
          )}

          {doc.children.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Sub-pages</h3>
              <ul className="space-y-1">
                {doc.children.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/docs/${c.id}`}
                      className="text-sm text-[var(--accent)] hover:underline"
                    >
                      {c.icon ?? DOCUMENT_TYPE_ICONS[c.type]} {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          {sideSections.map(({ id, icon: Icon, label, countKey }) => {
            const open = openSections.has(id);
            const count = getSectionCount(doc, countKey);

            return (
              <div
                key={id}
                className="border-b border-[var(--card-border)] last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium transition-colors",
                    open
                      ? "bg-[var(--accent-soft)]/40 text-[var(--foreground)]"
                      : "text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                  )}
                  aria-expanded={open}
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      !open && "-rotate-90"
                    )}
                  />
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  <span className="flex-1">{label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                      {count}
                    </span>
                  )}
                </button>

                {open && (
                  <div className="max-h-80 overflow-y-auto border-t border-[var(--card-border)] px-3 py-3">
                    {id === "versions" && (
                      <div className="space-y-2">
                        {versions.length === 0 && (
                          <p className="text-xs text-[var(--muted)]">No versions yet.</p>
                        )}
                        {versions.map((v) => (
                          <div
                            key={v.id}
                            className="rounded-lg border border-[var(--card-border)] p-3 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">v{v.versionNumber}</span>
                              {!readOnly && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void restoreVersion(v.id, v.versionNumber)}
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            <p className="mt-1 text-[var(--muted)]">
                              {v.user.name} · {formatDocDate(v.createdAt)}
                            </p>
                            {v.changeNote && (
                              <p className="mt-1 italic text-[var(--foreground)]">{v.changeNote}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {id === "comments" && (
                      <div className="space-y-3">
                        {comments.length === 0 && (
                          <p className="text-xs text-[var(--muted)]">No comments yet.</p>
                        )}
                        {comments.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-lg bg-[var(--surface-hover)] p-3 text-sm"
                          >
                            <p className="font-medium">{c.user.name}</p>
                            <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {formatDocDate(c.createdAt)}
                            </p>
                          </div>
                        ))}
                        {!readOnly && (
                          <div className="space-y-2 border-t border-[var(--card-border)] pt-3">
                            <Textarea
                              value={newComment}
                              onChange={(e) => setNewComment(e.target.value)}
                              rows={3}
                              placeholder="Add a comment..."
                            />
                            <Button
                              size="sm"
                              onClick={() => void addComment()}
                              disabled={!newComment.trim()}
                            >
                              Post
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {id === "tasks" && (
                      <div className="space-y-3 text-sm">
                        <p className="text-xs leading-relaxed text-[var(--muted)]">
                          Attach tasks to this doc for quick reference from the editor or task
                          detail.
                        </p>
                        {doc.taskLinks.length === 0 && (
                          <p className="text-xs text-[var(--muted)]">No linked tasks yet.</p>
                        )}
                        <ul className="space-y-2">
                          {doc.taskLinks.map(({ task }) => (
                            <li
                              key={task.id}
                              className="flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-2.5"
                            >
                              <CheckSquare2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                              <button
                                type="button"
                                onClick={() => void openLinkedTask(task.id)}
                                className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--accent)] hover:underline"
                                title={task.title}
                              >
                                {task.title}
                              </button>
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                                  getStatusColor(task.status)
                                )}
                              >
                                {taskStatusLabel[task.status] ?? task.status}
                              </span>
                              {!readOnly && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0 p-0 text-[var(--muted)] hover:text-red-500"
                                  onClick={() => void unlinkTask(task.id)}
                                  aria-label="Unlink task"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                        {!readOnly && (
                          <LinkTaskPicker
                            workspaceId={doc.workspaceId}
                            linkedTaskIds={doc.taskLinks.map((l) => l.task.id)}
                            onLink={linkTask}
                          />
                        )}
                      </div>
                    )}

                    {id === "chat" && (
                      <ShareDocumentPanel
                        documentId={documentId}
                        workspaceId={doc.workspaceId}
                        shareHistory={doc.messageLinks}
                        readOnly={readOnly}
                        onShared={() => void load()}
                        onRemoveShare={removeShare}
                      />
                    )}

                    {id === "files" && (
                      <DocumentAttachmentsPanel
                        documentId={documentId}
                        attachments={doc.attachments}
                        readOnly={readOnly}
                        onChange={() => void load()}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </div>

      <TaskEditModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        title={editingTask ? (canEditTasks ? "Edit Task" : "View Task") : "Task"}
        editingTask={editingTask}
        workspaceId={taskWorkspaceId ?? undefined}
        members={taskModalMembers}
        lockWorkspace={!taskIsPersonal}
        isPersonal={taskIsPersonal}
        workspaceName={selectedWorkspace?.name}
        readOnly={!canEditTasks}
        onSubmit={handleTaskUpdate}
        isSubmitting={isTaskSubmitting}
      />
    </div>
  );
}
