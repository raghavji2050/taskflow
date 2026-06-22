"use client";

import { useCallback, useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";

interface Rule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  config?: string | Record<string, string>;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

function parseConfig(config: Rule["config"]): Record<string, string> {
  if (!config) return {};
  if (typeof config === "string") {
    try {
      return JSON.parse(config) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return config;
}

function triggerLabel(trigger: string) {
  return TRIGGER_OPTIONS.find((o) => o.value === trigger)?.label ?? trigger;
}

function actionLabel(action: string) {
  return ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;
}

function configSummary(
  rule: Rule,
  members: Member[],
  tags: Tag[]
): string {
  const config = parseConfig(rule.config);
  const parts: string[] = [];

  if (rule.action === "notify_assignees") parts.push("Notify assignees");
  else if (rule.action === "notify_user") {
    const member = members.find((m) => m.user.id === config.userId);
    parts.push(member ? `Notify ${member.user.name}` : "Notify user");
  } else if (rule.action === "set_status") {
    parts.push(`Set status to ${STATUS_LABELS[config.status ?? ""] ?? config.status ?? "—"}`);
  } else if (rule.action === "add_tag") {
    const tag = tags.find((t) => t.id === config.tagId);
    parts.push(tag ? `Add tag “${tag.name}”` : "Add tag");
  }

  if (rule.trigger === "due_date_approaching") {
    const hours = config.hoursBefore ?? "24";
    parts.push(`Due in ${hours}h`);
  }

  if (config.message?.trim()) parts.push(`“${config.message.trim()}”`);

  return parts.join(" · ");
}

interface Member {
  user: { id: string; name: string };
}

interface Tag {
  id: string;
  name: string;
}

const TRIGGER_OPTIONS = [
  { value: "task_overdue", label: "Task overdue" },
  { value: "task_assigned", label: "Task assigned" },
  { value: "status_changed", label: "Status changed" },
  { value: "due_date_approaching", label: "Due date approaching" },
];

const ACTION_OPTIONS = [
  { value: "notify_assignees", label: "Notify assignees" },
  { value: "notify_user", label: "Notify user" },
  { value: "set_status", label: "Set status" },
  { value: "add_tag", label: "Add tag" },
];

export function AutomationRulesPanel({
  workspaceId,
  embedded = false,
}: {
  workspaceId: string;
  embedded?: boolean;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("task_overdue");
  const [action, setAction] = useState("notify_assignees");
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("IN_PROGRESS");
  const [tagId, setTagId] = useState("");
  const [hoursBefore, setHoursBefore] = useState("24");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [rulesRes, workspacesRes, tagsRes] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}/automations`),
      fetch("/api/workspaces"),
      fetch("/api/tags"),
    ]);
    if (rulesRes.ok) {
      const data = await rulesRes.json();
      setRules(data.rules ?? []);
    }
    if (workspacesRes.ok) {
      const data = await workspacesRes.json();
      const ws = (data.workspaces ?? []).find((w: { id: string }) => w.id === workspaceId);
      setMembers(ws?.members ?? []);
    }
    if (tagsRes.ok) {
      const data = await tagsRes.json();
      setTags(data.tags ?? []);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const buildConfig = () => {
    const config: Record<string, string> = {};
    if (message.trim()) config.message = message.trim();
    if (action === "notify_user" && userId) config.userId = userId;
    if (action === "set_status") config.status = status;
    if (action === "add_tag" && tagId) config.tagId = tagId;
    if (trigger === "due_date_approaching") config.hoursBefore = hoursBefore || "24";
    return config;
  };

  const addRule = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/automations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        trigger,
        action,
        config: buildConfig(),
      }),
    });
    if (res.ok) {
      toast.success("Automation created");
      setName("");
      setMessage("");
      await load();
    } else {
      toast.error("Could not create rule");
    }
    setSaving(false);
  };

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    await fetch(`/api/workspaces/${workspaceId}/automations/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await load();
  };

  const deleteRule = async (ruleId: string) => {
    await fetch(`/api/workspaces/${workspaceId}/automations/${ruleId}`, { method: "DELETE" });
    await load();
  };

  const content = (
    <>
      {!embedded && (
        <p className="mb-3 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          <Zap className="h-3 w-3" /> Automations
        </p>
      )}
      <div className="mb-3 space-y-2">
        {rules.map((r) => {
          const summary = configSummary(r, members, tags);
          return (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-3)] px-2.5 py-2 text-xs">
            <div className="min-w-0">
              <span className="font-medium">{r.name}</span>
              <p className="mt-0.5 text-[var(--muted)]">
                {triggerLabel(r.trigger)} → {actionLabel(r.action)}
                {summary ? <span className="text-[var(--muted-foreground)]"> · {summary}</span> : null}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => void toggleRule(r.id, e.target.checked)}
              />
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-red-500" onClick={() => void deleteRule(r.id)}>
                Delete
              </Button>
            </div>
          </div>
          );
        })}
      </div>
      <div className="space-y-2">
        <Input hideLabel placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Select hideLabel className="h-8 text-xs" value={trigger} onChange={(e) => setTrigger(e.target.value)} options={TRIGGER_OPTIONS} />
          <Select hideLabel className="h-8 text-xs" value={action} onChange={(e) => setAction(e.target.value)} options={ACTION_OPTIONS} />
        </div>
        <Input hideLabel placeholder="Notification message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} className="h-8 text-xs" />
        {action === "notify_user" && (
          <Select
            hideLabel
            className="h-8 text-xs"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            options={[
              { value: "", label: "Select member..." },
              ...members.map((m) => ({ value: m.user.id, label: m.user.name })),
            ]}
          />
        )}
        {action === "set_status" && (
          <Select
            hideLabel
            className="h-8 text-xs"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "PENDING", label: "Pending" },
              { value: "IN_PROGRESS", label: "In Progress" },
              { value: "COMPLETED", label: "Completed" },
            ]}
          />
        )}
        {action === "add_tag" && (
          <Select
            hideLabel
            className="h-8 text-xs"
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            options={[
              { value: "", label: "Select tag..." },
              ...tags.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        )}
        {trigger === "due_date_approaching" && (
          <Input
            hideLabel
            type="number"
            min={1}
            placeholder="Hours before due date"
            value={hoursBefore}
            onChange={(e) => setHoursBefore(e.target.value)}
            className="h-8 text-xs"
          />
        )}
        <Button size="sm" className="h-8 w-full sm:w-auto" onClick={() => void addRule()} isLoading={saving}>
          Add rule
        </Button>
      </div>
    </>
  );

  if (embedded) return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">{content}</div>;
  return <Card className="p-4">{content}</Card>;
}
