"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MessageSquare,
  Paperclip,
  Bell,
  ListChecks,
  Activity,
  BookOpen,
  FileText,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { renderCommentBody } from "@/lib/mentions";
import { useRealtime } from "@/components/RealtimeProvider";
import type { TaskEvent } from "@/lib/realtime";
import { MentionInput } from "@/components/MentionInput";
import { formatActivityAction } from "@/lib/activity-labels";
import { formatRelativeDate } from "@/lib/utils";
import { getAttachmentServeUrl } from "@/lib/blob-url";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { LinkDocumentPicker } from "@/components/docs/LinkDocumentPicker";
import { DocumentQuickModal } from "@/components/docs/DocumentQuickModal";
import { TimeTracker } from "@/components/tasks/TimeTracker";
import { TimeEntryHistory } from "@/components/tasks/TimeEntryHistory";
import { cn } from "@/lib/utils";

interface Subtask { id: string; title: string; completed: boolean }
interface Comment { id: string; body: string; user: { name: string }; createdAt: string; replies?: Comment[] }
interface ActivityItem { id: string; action: string; details: string | null; createdAt: string }
interface Attachment { id: string; filename: string; url: string }
interface LinkedDoc { id: string; title: string; type: string; updatedAt: string }

type CollabPanel = "work" | "time" | "comments" | "files" | "more";

interface TaskDetailProps {
  taskId: string;
  readOnly?: boolean;
  members?: { id: string; name: string }[];
  layout?: "grid" | "sidebar";
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function PanelHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3 border-b border-[var(--card-border)] pb-2">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
      {description && <p className="mt-0.5 text-[11px] text-[var(--muted)]">{description}</p>}
    </div>
  );
}

function NavBadge({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "ml-auto min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums",
        count > 0
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "bg-[var(--surface-hover)] text-[var(--muted)]"
      )}
    >
      {count}
    </span>
  );
}

export function TaskDetail({
  taskId,
  readOnly = false,
  members = [],
  layout = "grid",
}: TaskDetailProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);
  const [taskWorkspaceId, setTaskWorkspaceId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>("PENDING");
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [timeEntryCount, setTimeEntryCount] = useState(0);
  const [activePanel, setActivePanel] = useState<CollabPanel>("work");
  const [defaultPanelSet, setDefaultPanelSet] = useState(false);
  const { subscribe } = useRealtime();

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}`);
    const data = await res.json();
    if (res.ok) {
      setSubtasks(data.task.subtasks ?? []);
      setComments(data.task.comments ?? []);
      setAttachments(data.task.attachments ?? []);
      setActivities(data.task.activities ?? []);
      setTaskWorkspaceId(data.task.workspaceId ?? null);
      setTaskStatus(data.task.status ?? "PENDING");
    }
    const docsRes = await fetch(`/api/tasks/${taskId}/documents`);
    const docsData = await docsRes.json();
    if (docsRes.ok) setLinkedDocs(docsData.documents ?? []);

    const timeRes = await fetch(`/api/time/task/${taskId}?limit=1`);
    const timeData = await timeRes.json();
    if (timeRes.ok) setTimeEntryCount(timeData.pagination?.total ?? 0);
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDefaultPanelSet(false);
  }, [taskId]);

  useEffect(() => {
    if (layout !== "sidebar" || defaultPanelSet) return;
    if (subtasks.length > 0) {
      setActivePanel("work");
    } else if (comments.length > 0) {
      setActivePanel("comments");
    } else {
      setActivePanel("time");
    }
    setDefaultPanelSet(true);
  }, [layout, defaultPanelSet, subtasks.length, comments.length]);

  useEffect(() => {
    return subscribe((event: TaskEvent) => {
      if (
        (event.type === "comment:created" || event.type === "task:updated") &&
        event.taskId === taskId
      ) {
        void load();
      }
    });
  }, [subscribe, taskId, load]);

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSubtask.trim() }),
    });
    if (res.ok) {
      setNewSubtask("");
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not add subtask");
    }
  };

  const toggleSubtask = async (sub: Subtask) => {
    const res = await fetch(`/api/tasks/${taskId}/subtasks/${sub.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: sub.title, completed: !sub.completed }),
    });
    if (res.ok) await load();
    else toast.error("Could not update subtask");
  };

  const postComment = async (body: string, parentId?: string | null) => {
    if (!body.trim()) return false;
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parentId: parentId ?? null }),
    });
    if (res.ok) {
      await load();
      return true;
    }
    return false;
  };

  const addComment = async () => {
    if (await postComment(newComment)) setNewComment("");
  };

  const addReply = async (parentId: string) => {
    if (await postComment(replyBody, parentId)) {
      setReplyBody("");
      setReplyingToId(null);
    }
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: form });
    if (res.ok) {
      toast.success("File uploaded");
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Upload failed");
    }
    e.target.value = "";
  };

  const setReminder = async () => {
    if (!remindAt) return;
    const res = await fetch(`/api/tasks/${taskId}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remindAt }),
    });
    if (res.ok) {
      toast.success("Reminder set");
      setRemindAt("");
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not set reminder");
    }
  };

  const linkDocument = async (documentId: string) => {
    const res = await fetch(`/api/documents/${documentId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "task", taskId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not link document");
      return;
    }
    toast.success("Document linked");
    await load();
  };

  const subtasksPanel = (
    <>
      <div className="space-y-2">
        {subtasks.length === 0 && (
          <p className="text-xs text-[var(--muted)]">No subtasks yet</p>
        )}
        {subtasks.map((sub) => (
          <label
            key={sub.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-hover)]"
          >
            <input
              type="checkbox"
              checked={sub.completed}
              disabled={readOnly}
              onChange={() => toggleSubtask(sub)}
              className="h-4 w-4 rounded border-[var(--card-border)] accent-[var(--accent)]"
            />
            <span className={sub.completed ? "line-through opacity-60" : ""}>{sub.title}</span>
          </label>
        ))}
      </div>
      {!readOnly && (
        <div className="mt-3 flex gap-2">
          <Input
            hideLabel
            placeholder="Add subtask..."
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addSubtask();
              }
            }}
            className="h-9 text-sm"
          />
          <Button size="sm" onClick={addSubtask} className="h-9 shrink-0">
            Add
          </Button>
        </div>
      )}
    </>
  );

  const timePanel = (
    <>
      <TimeTracker taskId={taskId} readOnly={readOnly} taskStatus={taskStatus} />
      <div className="mt-4 border-t border-[var(--card-border)] pt-4">
        <p className="mb-2 text-xs font-medium text-[var(--muted)]">History</p>
        <TimeEntryHistory
          taskId={taskId}
          readOnly={readOnly}
          showUserFilter={taskWorkspaceId !== null}
          memberOptions={members}
        />
      </div>
    </>
  );

  const commentsPanel = (
    <>
      <div className={cn("space-y-2 overflow-y-auto pr-1", layout === "sidebar" ? "min-h-[200px]" : "max-h-40")}>
        {comments.length === 0 && (
          <p className="text-xs text-[var(--muted)]">No comments yet</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="rounded-lg bg-[var(--surface-hover)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--foreground)]">{c.user.name}</span>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => {
                    setReplyingToId(replyingToId === c.id ? null : c.id);
                    setReplyBody("");
                  }}
                >
                  Reply
                </Button>
              )}
            </div>
            <p
              className="mt-1 text-sm text-[var(--muted)]"
              dangerouslySetInnerHTML={{ __html: renderCommentBody(c.body) }}
            />
            {replyingToId === c.id && !readOnly && (
              <div className="mt-2 flex gap-2">
                <MentionInput
                  value={replyBody}
                  onChange={setReplyBody}
                  onSubmit={() => void addReply(c.id)}
                  members={members}
                  placeholder={`Reply to ${c.user.name}... Use @Name`}
                  className="h-8 text-xs"
                />
                <Button size="sm" className="h-8 shrink-0" onClick={() => void addReply(c.id)}>
                  Post
                </Button>
              </div>
            )}
            {c.replies?.map((r) => (
              <div key={r.id} className="ml-3 mt-2 border-l-2 border-[var(--card-border)] pl-2">
                <span className="text-[11px] font-semibold text-[var(--foreground)]">{r.user.name}</span>
                <p
                  className="text-xs text-[var(--muted)]"
                  dangerouslySetInnerHTML={{ __html: renderCommentBody(r.body) }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="mt-3 flex gap-2">
          <MentionInput
            value={newComment}
            onChange={setNewComment}
            onSubmit={addComment}
            members={members}
            placeholder="Write a comment... Use @Name to mention"
          />
          <Button size="sm" onClick={addComment} className="h-9 shrink-0">
            Post
          </Button>
        </div>
      )}
    </>
  );

  const filesPanel = (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Attachments</p>
        {attachments.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No files attached</p>
        ) : (
          <div className="space-y-1.5">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={getAttachmentServeUrl(a.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-sm text-[var(--accent)] hover:underline"
              >
                {a.filename}
              </a>
            ))}
          </div>
        )}
        {!readOnly && (
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--card-border)] px-3 py-2 text-xs text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
            <Paperclip className="h-3.5 w-3.5" />
            Upload file
            <input type="file" onChange={uploadFile} className="hidden" />
          </label>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Linked docs</p>
        {linkedDocs.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No linked documents yet.</p>
        ) : (
          <ul className="space-y-2">
            {linkedDocs.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => setViewingDocId(doc.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-[var(--card-border)] px-3 py-2 text-left text-sm text-[var(--accent)] transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate font-medium">{doc.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!readOnly && (
          <LinkDocumentPicker
            workspaceId={taskWorkspaceId}
            linkedDocIds={linkedDocs.map((d) => d.id)}
            onLink={linkDocument}
          />
        )}
      </div>
    </div>
  );

  const morePanel = (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Activity</p>
        <div className={cn("space-y-2 overflow-y-auto text-xs text-[var(--muted)]", layout === "sidebar" ? "" : "max-h-32")}>
          {activities.length === 0 && (
            <p className="text-[var(--muted)]">No activity yet — changes will appear here.</p>
          )}
          {activities.map((a) => (
            <p key={a.id}>
              <span className="font-medium text-[var(--foreground)]">{formatActivityAction(a.action)}</span>
              {a.details ? ` — ${a.details}` : ""}
              <span className="ml-1 opacity-70">· {formatRelativeDate(a.createdAt)}</span>
            </p>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Reminder</p>
        <p className="mb-3 text-xs text-[var(--muted)]">Get notified before this task is due</p>
        {!readOnly ? (
          <div className="flex gap-2">
            <Input
              hideLabel
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="h-9 text-sm"
            />
            <Button size="sm" onClick={setReminder} className="h-9 shrink-0">
              Set
            </Button>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)]">View only — you cannot set reminders</p>
        )}
      </div>
    </div>
  );

  const sidebarNav: { id: CollabPanel; label: string; badge: number }[] = [
    { id: "work", label: "Work", badge: subtasks.length },
    { id: "time", label: "Time", badge: timeEntryCount },
    { id: "comments", label: "Comments", badge: comments.length },
    { id: "files", label: "Files", badge: attachments.length + linkedDocs.length },
    { id: "more", label: "More", badge: activities.length },
  ];

  const sidebarPanelMeta: Record<CollabPanel, { title: string; description?: string }> = {
    work: { title: "Work", description: "Break this task into smaller steps." },
    time: { title: "Time", description: "Track time spent on this task." },
    comments: { title: "Comments", description: "Discuss with your team." },
    files: { title: "Files", description: "Attachments and linked documents." },
    more: { title: "More", description: "Activity log and reminders." },
  };

  return (
    <>
      {layout === "sidebar" ? (
        <div className="flex min-h-[min(60vh,520px)] flex-col gap-4 sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto sm:w-36 sm:flex-col sm:overflow-visible">
            {sidebarNav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePanel(item.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  activePanel === item.id
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                )}
              >
                <span className="flex-1">{item.label}</span>
                <NavBadge count={item.badge} />
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)]/30 p-4">
            <PanelHeader
              title={sidebarPanelMeta[activePanel].title}
              description={sidebarPanelMeta[activePanel].description}
            />
            {activePanel === "work" && subtasksPanel}
            {activePanel === "time" && timePanel}
            {activePanel === "comments" && commentsPanel}
            {activePanel === "files" && filesPanel}
            {activePanel === "more" && morePanel}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Section icon={BookOpen} title="Linked docs">
            {linkedDocs.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No linked documents yet.</p>
            ) : (
              <ul className="space-y-2">
                {linkedDocs.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => setViewingDocId(doc.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-[var(--card-border)] px-3 py-2 text-left text-sm text-[var(--accent)] transition-colors hover:bg-[var(--surface-hover)]"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate font-medium">{doc.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && (
              <LinkDocumentPicker
                workspaceId={taskWorkspaceId}
                linkedDocIds={linkedDocs.map((d) => d.id)}
                onLink={linkDocument}
              />
            )}
          </Section>

          <Section icon={Clock} title="Time tracking">
            {timePanel}
          </Section>

          <Section icon={ListChecks} title="Subtasks">
            {subtasksPanel}
          </Section>

          <Section icon={MessageSquare} title="Comments">
            {commentsPanel}
          </Section>

          <Section icon={Paperclip} title="Attachments">
            {attachments.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No files attached</p>
            ) : (
              <div className="space-y-1.5">
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={getAttachmentServeUrl(a.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm text-[var(--accent)] hover:underline"
                  >
                    {a.filename}
                  </a>
                ))}
              </div>
            )}
            {!readOnly && (
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--card-border)] px-3 py-2 text-xs text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <Paperclip className="h-3.5 w-3.5" />
                Upload file
                <input type="file" onChange={uploadFile} className="hidden" />
              </label>
            )}
          </Section>

          <Section icon={Activity} title="Activity">
            <div className="max-h-32 space-y-2 overflow-y-auto text-xs text-[var(--muted)]">
              {activities.length === 0 && (
                <p className="text-[var(--muted)]">No activity yet — changes will appear here.</p>
              )}
              {activities.map((a) => (
                <p key={a.id}>
                  <span className="font-medium text-[var(--foreground)]">{formatActivityAction(a.action)}</span>
                  {a.details ? ` — ${a.details}` : ""}
                  <span className="ml-1 opacity-70">· {formatRelativeDate(a.createdAt)}</span>
                </p>
              ))}
            </div>
          </Section>

          <Section icon={Bell} title="Reminder">
            <p className="mb-3 text-xs text-[var(--muted)]">Get notified before this task is due</p>
            {!readOnly ? (
              <div className="flex gap-2">
                <Input
                  hideLabel
                  type="datetime-local"
                  value={remindAt}
                  onChange={(e) => setRemindAt(e.target.value)}
                  className="h-9 text-sm"
                />
                <Button size="sm" onClick={setReminder} className="h-9 shrink-0">
                  Set
                </Button>
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">View only — you cannot set reminders</p>
            )}
          </Section>
        </div>
      )}

      <DocumentQuickModal
        documentId={viewingDocId}
        isOpen={!!viewingDocId}
        onClose={() => setViewingDocId(null)}
        readOnly={readOnly}
      />
    </>
  );
}
