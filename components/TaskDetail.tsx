"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Paperclip, Bell, ListChecks, Users, Activity } from "lucide-react";
import { AssigneeChips, type TaskAssigneeUser } from "@/components/AssigneeChips";
import { renderCommentBody } from "@/lib/mentions";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

interface Subtask { id: string; title: string; completed: boolean }
interface Comment { id: string; body: string; user: { name: string }; createdAt: string; replies?: Comment[] }
interface Activity { id: string; action: string; details: string | null; createdAt: string }
interface Attachment { id: string; filename: string; url: string }

interface TaskDetailProps {
  taskId: string;
  readOnly?: boolean;
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

export function TaskDetail({ taskId, readOnly = false }: TaskDetailProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [assignees, setAssignees] = useState<TaskAssigneeUser[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [remindAt, setRemindAt] = useState("");

  const load = async () => {
    const res = await fetch(`/api/tasks/${taskId}`);
    const data = await res.json();
    if (res.ok) {
      setSubtasks(data.task.subtasks ?? []);
      setComments(data.task.comments ?? []);
      setAttachments(data.task.attachments ?? []);
      setAssignees(data.task.assignees ?? []);
      setActivities(data.task.activities ?? []);
    }
  };

  useEffect(() => { load(); }, [taskId]);

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSubtask }),
    });
    if (res.ok) { setNewSubtask(""); load(); }
  };

  const toggleSubtask = async (sub: Subtask) => {
    await fetch(`/api/tasks/${taskId}/subtasks/${sub.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: sub.title, completed: !sub.completed }),
    });
    load();
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newComment }),
    });
    if (res.ok) { setNewComment(""); load(); }
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: form });
    if (res.ok) { toast.success("File uploaded"); load(); }
    else toast.error("Upload failed");
  };

  const setReminder = async () => {
    if (!remindAt) return;
    const res = await fetch(`/api/tasks/${taskId}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remindAt }),
    });
    if (res.ok) { toast.success("Reminder set"); setRemindAt(""); }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {assignees.length > 0 && (
        <Section icon={Users} title="Responsible">
          <AssigneeChips assignees={assignees} />
        </Section>
      )}

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
            onKeyDown={(e) => e.key === "Enter" && addSubtask()}
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
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{c.user.name}</span>
              <p
                className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
                dangerouslySetInnerHTML={{ __html: renderCommentBody(c.body) }}
              />
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
          <Input
            hideLabel
            placeholder="Write a comment... Use @Name to mention"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()}
            className="h-9 text-sm"
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
                href={a.url}
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

      {activities.length > 0 && (
        <Section icon={Activity} title="Activity">
          <div className="max-h-32 space-y-1 overflow-y-auto text-xs text-zinc-500">
            {activities.map((a) => (
              <p key={a.id}>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{a.action}</span>
                {a.details ? ` — ${a.details}` : ""}
              </p>
            ))}
          </div>
        </Section>
      )}

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
  );
}
