"use client";

import { useEffect, useState } from "react";
import { Search, Users, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn, getInitials } from "@/lib/utils";

interface UserResult {
  id: string;
  name: string;
  email: string;
}

interface NewGroupChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export function NewGroupChatModal({ isOpen, onClose, onCreated }: NewGroupChatModalProps) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setQuery("");
      setUsers([]);
      setSelected([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setUsers([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (res.ok) setUsers(data.users ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggleUser = (user: UserResult) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user]
    );
  };

  const createGroup = async () => {
    if (selected.length === 0) return;
    setCreating(true);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "GROUP",
        name: name.trim() || undefined,
        memberIds: selected.map((u) => u.id),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      onCreated(data.conversation.id);
      onClose();
    }
    setCreating(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New group chat"
      description="Add members and optionally name your group"
    >
      <div className="space-y-4">
        <Input
          label="Group name"
          hideLabel
          placeholder="Group name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          startIcon={<Users className="h-4 w-4" />}
        />

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2 py-1 text-xs font-medium text-[var(--accent)]"
              >
                {user.name}
                <button type="button" onClick={() => toggleUser(user)} aria-label={`Remove ${user.name}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <Input
          hideLabel
          placeholder="Search members to add…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          startIcon={<Search className="h-4 w-4" />}
        />

        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {loading && <li className="py-2 text-center text-sm text-[var(--muted)]">Searching…</li>}
          {users.map((user) => {
            const isSelected = selected.some((u) => u.id === user.id);
            return (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => toggleUser(user)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    isSelected ? "bg-[var(--accent)]/10" : "hover:bg-[var(--surface-hover)]"
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-hover)] text-xs font-semibold">
                    {getInitials(user.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => void createGroup()}
            disabled={selected.length === 0 || creating}
            isLoading={creating}
          >
            Create group
          </Button>
        </div>
      </div>
    </Modal>
  );
}
