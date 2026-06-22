"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getInitials } from "@/lib/utils";

interface GroupInfoModalProps {
  isOpen: boolean;
  conversationId: string;
  conversationName: string;
  participants: { id: string; name: string; email?: string }[];
  currentUserId?: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function GroupInfoModal({
  isOpen,
  conversationId,
  conversationName,
  participants,
  currentUserId,
  onClose,
  onUpdated,
}: GroupInfoModalProps) {
  const [name, setName] = useState(conversationName);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setName(conversationName);
  }, [isOpen, conversationName]);

  useEffect(() => {
    if (!addOpen || query.trim().length < 2) {
      setUsers([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (res.ok) {
        const existing = new Set(participants.map((p) => p.id));
        setUsers((data.users ?? []).filter((u: { id: string }) => !existing.has(u.id)));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [addOpen, query, participants]);

  const saveName = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/participants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const addMember = async (userId: string) => {
    setAdding(userId);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/participants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addMemberIds: [userId] }),
      });
      if (res.ok) {
        setAddOpen(false);
        setQuery("");
        onUpdated();
      }
    } finally {
      setAdding(null);
    }
  };

  const leaveGroup = async () => {
    if (!window.confirm("Leave this group?")) return;
    const res = await fetch(`/api/conversations/${conversationId}/participants`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave: true }),
    });
    if (res.ok) {
      onUpdated();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Group info" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Group name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-[var(--muted)]">
            Members ({participants.length})
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {participants.map((p) => (
              <li key={p.id} className="rounded-lg px-2 py-1.5 hover:bg-[var(--surface-hover)]">
                {p.name}
                {p.id === currentUserId && (
                  <span className="ml-1 text-[10px] text-[var(--muted)]">(you)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        {addOpen && (
          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users to add…"
            />
            <ul className="max-h-32 overflow-y-auto">
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={adding === u.id}
                    onClick={() => void addMember(u.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]/10 text-xs font-semibold text-[var(--accent)]">
                      {getInitials(u.name)}
                    </span>
                    <span className="truncate">{u.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void saveName()} isLoading={saving} disabled={!name.trim()}>
            Save name
          </Button>
          {!addOpen && (
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
              Add member
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => void leaveGroup()}>
            Leave group
          </Button>
        </div>
      </div>
    </Modal>
  );
}
