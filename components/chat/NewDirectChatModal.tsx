"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getInitials } from "@/lib/utils";

interface UserResult {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

interface NewDirectChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export function NewDirectChatModal({ isOpen, onClose, onCreated }: NewDirectChatModalProps) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setUsers([]);
      return;
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

  const startChat = async (userId: string) => {
    setCreating(userId);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DIRECT", userId }),
    });
    const data = await res.json();
    if (res.ok) {
      onCreated(data.conversation.id);
      onClose();
    }
    setCreating(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New direct message" description="Search for any user in TaskFlow">
      <div className="space-y-4">
        <Input
          hideLabel
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          startIcon={<Search className="h-4 w-4" />}
          autoFocus
        />
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {loading && (
            <li className="py-4 text-center text-sm text-[var(--muted)]">Searching…</li>
          )}
          {!loading && query.length >= 2 && users.length === 0 && (
            <li className="py-4 text-center text-sm text-[var(--muted)]">No users found</li>
          )}
          {users.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => void startChat(user.id)}
                disabled={creating === user.id}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-sm font-semibold text-[var(--accent)]">
                  {getInitials(user.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
                </div>
                <UserPlus className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
