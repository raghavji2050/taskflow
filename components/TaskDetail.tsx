"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Paperclip, Bell, ListChecks, Users, Activity, BookOpen, FileText } from "lucide-react";
import { toast } from "sonner";
import { AssigneeChips, type TaskAssigneeUser } from "@/components/AssigneeChips";
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

interface Subtask { id: string; title: string; completed: boolean }
interface Comment { id: string; body: string; user: { name: string }; createdAt: string; replies?: Comment[] }
interface Activity { id: string; action: string; details: string | null; createdAt: string }
interface Attachment { id: string; filename: string; url: string }
interface LinkedDoc { id: string; title: string; type: string; updatedAt: string }

interface TaskDetailProps {
  taskId: string;
  readOnly?: boolean;
  members?: { id: string; name: string }[];
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
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

export function TaskDetail({ taskId, readOnly = false, members = [] }: TaskDetailProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [assignees, setAssignees] = useState<TaskAssigneeUser[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);
  const [taskWorkspaceId, setTaskWorkspaceId] = useState<string | null>(null);
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const { subscribe } = useRealtime();

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}`);
    const data = await res.json();
    if (res.ok) {
      setSubtasks(data.task.subtasks ?? []);
      setComments(data.task.comments ?? []);
      setAttachments(data.task.attachments ?? []);
      setAssignees(data.task.assignees ?? []);
      setActivities(data.task.activities ?? []);
      setTaskWorkspaceId(data.task.workspaceId ?? null);
    }
    const docsRes = await fetch(`/api/tasks/${taskId}/documents`);
    const docsData = await docsRes.json();
    if (docsRes.ok) setLinkedDocs(docsData.documents ?? []);
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

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

  return (
    <>
    <div className="grid gap-4 sm:grid-cols-2">
      {assignees.length > 0 && (
        <Section icon={Users} title="Responsible">
          <AssigneeChips assignees={assignees} />
        </Section>
      )}

      <Section icon={BookOpen} title="Linked docs">
        {linkedDocs.length === 0 ? (
          <p className="text-xs text-zinc-400">No linked documents yet.</p>
        ) : (
          <ul className="space-y-2">
            {linkedDocs.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => setViewingDocId(doc.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-left text-sm text-indigo-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-zinc-800 dark:hover:border-indigo-900 dark:hover:bg-indigo-950/30"
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

      <Section icon={ListChecks} title="Subtasks">
        <div className="space-y-2">
          {subtasks.length === 0 && (
            <p className="text-xs text-zinc-400">No subtasks yet</p>
          )}
          {subtasks.map((sub) => (
            <label
              key={sub.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-zinc-100 px-3 py-2 text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
            >
              <input
                type="checkbox"
                checked={sub.completed}
                disabled={readOnly}
                onChange={() => toggleSubtask(sub)}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-500"
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
          <Button size="sm" onClick={addSubtask} className="h-9 shrink-0">Add</Button>
        </div>
        )}
      </Section>

      <Section icon={MessageSquare} title="Comments">
        <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
          {comments.length === 0 && (
            <p className="text-xs text-zinc-400">No comments yet</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800/80">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{c.user.name}</span>
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
                className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
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
                  <Button size="sm" className="h-8 shrink-0" onClick={() => void addReply(c.id)}>Post</Button>
                </div>
              )}
              {c.replies?.map((r) => (
                <div key={r.id} className="ml-3 mt-2 border-l-2 border-zinc-200 pl-2 dark:border-zinc-700">
                  <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">{r.user.name}</span>
                  <p
                    className="text-xs text-zinc-500"
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
          <Button size="sm" onClick={addComment} className="h-9 shrink-0">Post</Button>
        </div>
        )}
      </Section>

      <Section icon={Paperclip} title="Attachments">
        {attachments.length === 0 ? (
          <p className="text-xs text-zinc-400">No files attached</p>
        ) : (
          <div className="space-y-1.5">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={getAttachmentServeUrl(a.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-sm text-indigo-500 hover:underline"
              >
                {a.filename}
              </a>
            ))}
          </div>
        )}
        {!readOnly && (
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500 transition-colors hover:border-indigo-300 hover:text-indigo-500 dark:border-zinc-700">
          <Paperclip className="h-3.5 w-3.5" />
          Upload file
          <input type="file" onChange={uploadFile} className="hidden" />
        </label>
        )}
      </Section>

      <Section icon={Activity} title="Activity">
          <div className="max-h-32 space-y-2 overflow-y-auto text-xs text-zinc-500">
            {activities.length === 0 && (
              <p className="text-zinc-400">No activity yet — changes will appear here.</p>
            )}
            {activities.map((a) => (
              <p key={a.id}>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{formatActivityAction(a.action)}</span>
                {a.details ? ` — ${a.details}` : ""}
                <span className="ml-1 text-zinc-400">· {formatRelativeDate(a.createdAt)}</span>
              </p>
            ))}
          </div>
        </Section>

      <Section icon={Bell} title="Reminder">
        <p className="mb-3 text-xs text-zinc-400">Get notified before this task is due</p>
        {!readOnly ? (
        <div className="flex gap-2">
          <Input
            hideLabel
            type="datetime-local"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
            className="h-9 text-sm"
          />
          <Button size="sm" onClick={setReminder} className="h-9 shrink-0">Set</Button>
        </div>
        ) : (
          <p className="text-xs text-zinc-400">View only — you cannot set reminders</p>
        )}
      </Section>
    </div>

    <DocumentQuickModal
      documentId={viewingDocId}
      isOpen={!!viewingDocId}
      onClose={() => setViewingDocId(null)}
      readOnly={readOnly}
    />
    </>
  );
}
