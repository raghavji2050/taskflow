"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Building2, Loader2, Send, User, Users } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import {
  LinkPickerEmpty,
  LinkPickerHint,
  LinkSearchInput,
} from "@/components/docs/link-picker-ui";

export interface ConversationTarget {
  key: string;
  kind: "team" | "group" | "direct";
  label: string;
  conversationId?: string;
  userId?: string;
  recipients: { id: string; name: string }[];
  canPost: boolean;
}

interface ConversationRow {
  id: string;
  type: string;
  name: string;
  participants: { id: string; name: string }[];
  canPost: boolean;
  workspaceId?: string | null;
}

interface ConversationTargetPickerProps {
  workspaceId?: string | null;
  readOnly?: boolean;
  hint?: string;
  notePlaceholder?: string;
  sendLabel?: string;
  onSend: (target: ConversationTarget, note: string) => void | Promise<void>;
}

const sectionMeta = {
  team: { label: "Team", icon: Building2 },
  group: { label: "Groups", icon: Users },
  direct: { label: "People", icon: User },
} as const;

function matchesQuery(target: ConversationTarget, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (target.label.toLowerCase().includes(q)) return true;
  return target.recipients.some((r) => r.name.toLowerCase().includes(q));
}

export function ConversationTargetPicker({
  workspaceId = null,
  readOnly,
  hint,
  notePlaceholder = "Add a message… (optional)",
  sendLabel = "Send",
  onSend,
}: ConversationTargetPickerProps) {
  const { data: session } = useSession();
  const { members } = useWorkspace();
  const currentUserId = session?.user?.id;

  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (!res.ok) {
        setConversations([]);
        return;
      }
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const targets = useMemo(() => {
    if (!currentUserId) return { team: [], group: [], direct: [] };

    const team: ConversationTarget[] = [];
    const group: ConversationTarget[] = [];
    const direct: ConversationTarget[] = [];
    const dmUserIds = new Set<string>();

    for (const conv of conversations) {
      if (conv.type === "PERSONAL") continue;
      if (workspaceId && conv.workspaceId && conv.workspaceId !== workspaceId) continue;

      const recipients = conv.participants.filter((p) => p.id !== currentUserId);

      if (conv.type === "WORKSPACE") {
        team.push({
          key: `conv-${conv.id}`,
          kind: "team",
          label: conv.name,
          conversationId: conv.id,
          recipients,
          canPost: conv.canPost,
        });
      } else if (conv.type === "GROUP") {
        group.push({
          key: `conv-${conv.id}`,
          kind: "group",
          label: conv.name,
          conversationId: conv.id,
          recipients,
          canPost: conv.canPost,
        });
      } else if (conv.type === "DIRECT") {
        const other = conv.participants.find((p) => p.id !== currentUserId);
        if (other) dmUserIds.add(other.id);
        direct.push({
          key: `conv-${conv.id}`,
          kind: "direct",
          label: conv.name,
          conversationId: conv.id,
          recipients,
          canPost: conv.canPost,
        });
      }
    }

    const workspaceMembers = members.filter((m) => m.user.id !== currentUserId);

    for (const member of workspaceMembers) {
      if (dmUserIds.has(member.user.id)) continue;
      direct.push({
        key: `user-${member.user.id}`,
        kind: "direct",
        label: member.user.name,
        userId: member.user.id,
        recipients: [{ id: member.user.id, name: member.user.name }],
        canPost: true,
      });
    }

    const sortByLabel = (a: ConversationTarget, b: ConversationTarget) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" });

    return {
      team: team.filter((t) => matchesQuery(t, query)).sort(sortByLabel),
      group: group.filter((t) => matchesQuery(t, query)).sort(sortByLabel),
      direct: direct.filter((t) => matchesQuery(t, query)).sort(sortByLabel),
    };
  }, [conversations, currentUserId, members, query, workspaceId]);

  const hasTargets =
    targets.team.length > 0 || targets.group.length > 0 || targets.direct.length > 0;

  const handleSend = async (target: ConversationTarget) => {
    if (!target.canPost || readOnly) return;
    setSendingKey(target.key);
    try {
      await onSend(target, note.trim());
      setNote("");
    } finally {
      setSendingKey(null);
    }
  };

  const renderSection = (kind: keyof typeof sectionMeta, items: ConversationTarget[]) => {
    if (items.length === 0) return null;
    const { label, icon: Icon } = sectionMeta[kind];

    return (
      <div key={kind} className="space-y-1.5">
        <p className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </p>
        <ul className="space-y-1">
          {items.map((target) => {
            const RowIcon = sectionMeta[target.kind].icon;
            const isSending = sendingKey === target.key;
            return (
              <li
                key={target.key}
                className="flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-2"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)]">
                  <RowIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--foreground)]">{target.label}</p>
                  {target.recipients.length > 0 && target.kind !== "direct" && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {target.recipients.slice(0, 4).map((r) => (
                        <span
                          key={r.id}
                          className="rounded-full bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]"
                        >
                          {r.name}
                        </span>
                      ))}
                      {target.recipients.length > 4 && (
                        <span className="text-[10px] text-[var(--muted)]">
                          +{target.recipients.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <Button
                    size="sm"
                    className="h-8 shrink-0 gap-1 px-2.5"
                    disabled={!target.canPost || isSending}
                    isLoading={isSending}
                    onClick={() => void handleSend(target)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sendLabel}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  if (readOnly) return null;

  return (
    <div className="space-y-3">
      {hint && <LinkPickerHint>{hint}</LinkPickerHint>}

      <LinkSearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search people, groups, or teams…"
        disabled={readOnly}
      />

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={notePlaceholder}
        className="text-xs"
      />

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
        </div>
      ) : !hasTargets ? (
        <LinkPickerEmpty message="No matching recipients" />
      ) : (
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {renderSection("team", targets.team)}
          {renderSection("group", targets.group)}
          {renderSection("direct", targets.direct)}
        </div>
      )}
    </div>
  );
}
