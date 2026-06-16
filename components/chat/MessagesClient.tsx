"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, MessageSquarePlus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { ConversationList, type ConversationListItem } from "@/components/chat/ConversationList";
import { ChatThread, type ChatConversation } from "@/components/chat/ChatThread";
import { GlobalSearchPanel } from "@/components/chat/GlobalSearchPanel";
import { NewDirectChatModal } from "@/components/chat/NewDirectChatModal";
import { NewGroupChatModal } from "@/components/chat/NewGroupChatModal";
import { Button } from "@/components/ui/Button";
import { PushSubscribe } from "@/components/PushSubscribe";
import { cn } from "@/lib/utils";

export function MessagesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, data: session } = useSession();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDmModal, setShowDmModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const showMobileThread = Boolean(selectedId);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    if (res.ok) {
      setConversations(data.conversations ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      setLoading(true);
      void loadConversations();
    }
  }, [status, loadConversations]);

  useEffect(() => {
    const paramId = searchParams.get("c");
    if (paramId) setSelectedId(paramId);
    else setSelectedId(null);
  }, [searchParams]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type?: string;
        conversationId?: string;
        messageId?: string;
        senderId?: string;
        preview?: string;
        message?: { body?: string; createdAt?: string; user?: { id: string; name: string } };
      };
      if (
        detail?.type === "message:created" &&
        detail.conversationId &&
        detail.senderId !== session?.user?.id &&
        detail.conversationId !== selectedId
      ) {
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === detail.conversationId);
          if (idx === -1) return prev;
          const previewBody =
            detail.message?.body ?? detail.preview ?? prev[idx].lastMessage?.body ?? "";
          const previewUser = detail.message?.user ?? prev[idx].lastMessage?.user;
          const updated = {
            ...prev[idx],
            unreadCount: prev[idx].unreadCount + 1,
            lastMessage: previewUser
              ? {
                  id: detail.messageId ?? prev[idx].lastMessage?.id ?? detail.conversationId!,
                  body: previewBody,
                  createdAt: detail.message?.createdAt ?? new Date().toISOString(),
                  user: previewUser,
                }
              : prev[idx].lastMessage,
          };
          const next = [...prev];
          next.splice(idx, 1);
          next.unshift(updated);
          return next;
        });
        window.dispatchEvent(new CustomEvent("taskflow:chat-unread"));
      } else if (
        detail?.type === "message:created" &&
        detail.conversationId &&
        detail.senderId !== session?.user?.id
      ) {
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === detail.conversationId);
          if (idx === -1) return prev;
          const previewBody =
            detail.message?.body ?? detail.preview ?? prev[idx].lastMessage?.body ?? "";
          const previewUser = detail.message?.user ?? prev[idx].lastMessage?.user;
          if (!previewUser) return prev;
          const updated = {
            ...prev[idx],
            lastMessage: {
              id: detail.messageId ?? prev[idx].lastMessage?.id ?? detail.conversationId!,
              body: previewBody,
              createdAt: detail.message?.createdAt ?? new Date().toISOString(),
              user: previewUser,
            },
          };
          const next = [...prev];
          next.splice(idx, 1);
          next.unshift(updated);
          return next;
        });
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void loadConversations(), 500);
    };
    window.addEventListener("taskflow:message", handler);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("taskflow:message", handler);
    };
  }, [loadConversations, selectedId, session?.user?.id]);

  const selectedConversation = useMemo<ChatConversation | null>(() => {
    const found = conversations.find((c) => c.id === selectedId);
    if (!found) return null;
    return {
      id: found.id,
      type: found.type,
      name: found.name,
      participants: found.participants,
      unreadCount: found.unreadCount,
      canPost: found.canPost,
      archivedAt: found.archivedAt,
    };
  }, [conversations, selectedId]);

  const handleDeleted = useCallback(() => {
    setSelectedId(null);
    router.replace("/dashboard/messages", { scroll: false });
    void loadConversations();
  }, [loadConversations, router]);

  const handleListDelete = useCallback(
    async (conversationId: string, type: string) => {
      const isDirect = type === "DIRECT";
      const message = isDirect
        ? "Remove this conversation from your list?"
        : "Leave this group? It will be removed from your list.";
      if (!window.confirm(message)) return;

      const res = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(isDirect ? "Conversation removed" : "Left group");
        if (selectedId === conversationId) {
          setSelectedId(null);
          router.replace("/dashboard/messages", { scroll: false });
        }
        void loadConversations();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Could not delete conversation");
      }
    },
    [loadConversations, router, selectedId]
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    router.replace(`/dashboard/messages?c=${id}`, { scroll: false });
  };

  const handleBack = () => {
    setSelectedId(null);
    router.replace("/dashboard/messages", { scroll: false });
  };

  const handleCreated = (id: string) => {
    void loadConversations().then(() => handleSelect(id));
  };

  const handleRead = useCallback(() => {
    setConversations((prev) => {
      const target = prev.find((c) => c.id === selectedId);
      if (!target || target.unreadCount === 0) return prev;
      queueMicrotask(() => window.dispatchEvent(new CustomEvent("taskflow:chat-unread")));
      return prev.map((c) => (c.id === selectedId ? { ...c, unreadCount: 0 } : c));
    });
  }, [selectedId]);

  const handleMessageSent = useCallback(
    (
      conversationId: string,
      lastMessage: {
        id: string;
        body: string;
        createdAt: string;
        user: { id: string; name: string };
      }
    ) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) return prev;
        const updated = {
          ...prev[idx],
          lastMessage,
          unreadCount: conversationId === selectedId ? 0 : prev[idx].unreadCount,
        };
        const next = [...prev];
        next.splice(idx, 1);
        next.unshift(updated);
        return next;
      });
    },
    [selectedId]
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => {
      document.body.style.overflow = mq.matches ? "hidden" : "";
    };
    update();
    mq.addEventListener("change", update);
    return () => {
      mq.removeEventListener("change", update);
      document.body.style.overflow = "";
    };
  }, []);

  if (status === "loading") return null;

  const threadLoading = Boolean(selectedId) && !selectedConversation && loading;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-14 max-md:z-30 max-md:h-auto max-md:bg-[var(--background)]"
      )}
    >
      <div className="mb-3 hidden shrink-0 px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8 md:block">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--foreground)]">Messages</h1>
            <p className="hidden text-sm text-[var(--muted)] sm:block">
              Direct messages, groups, and team channels
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <PushSubscribe variant="toolbar" />
            <Button type="button" size="sm" variant="secondary" onClick={() => setGlobalSearchOpen(true)}>
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowGroupModal(true)}>
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">New group</span>
            </Button>
            <Button size="sm" onClick={() => setShowDmModal(true)}>
              <MessageSquarePlus className="h-4 w-4" />
              <span className="hidden sm:inline">New message</span>
            </Button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden border-[var(--card-border)] bg-[var(--background)]",
          "max-md:flex-1 max-md:border-0 md:flex-row md:rounded-xl md:border"
        )}
      >
        <div
          className={cn(
            "flex h-full min-h-0 w-full shrink-0 flex-col md:w-72 md:max-w-xs",
            showMobileThread && "max-md:hidden"
          )}
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={handleSelect}
            loading={loading}
            onNewDm={() => setShowDmModal(true)}
            onNewGroup={() => setShowGroupModal(true)}
            onSearch={() => setGlobalSearchOpen(true)}
            onDelete={handleListDelete}
          />
        </div>

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            !showMobileThread && "max-md:hidden"
          )}
        >
          {threadLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--muted)]" />
            </div>
          ) : (
            <ChatThread
              conversation={selectedConversation}
              readOnly={selectedConversation?.canPost === false}
              onRead={handleRead}
              onDeleted={handleDeleted}
              onCleared={loadConversations}
              onConversationUpdated={loadConversations}
              onMessageSent={handleMessageSent}
              onBack={showMobileThread ? handleBack : undefined}
            />
          )}
        </div>
      </div>

      {globalSearchOpen && (
        <GlobalSearchPanel
          conversations={conversations}
          onClose={() => setGlobalSearchOpen(false)}
          onSelect={(conversationId, message) => {
            setGlobalSearchOpen(false);
            handleSelect(conversationId);
            setTimeout(() => {
              window.location.hash = `msg-${message.id}`;
            }, 300);
          }}
        />
      )}

      <NewDirectChatModal
        isOpen={showDmModal}
        onClose={() => setShowDmModal(false)}
        onCreated={handleCreated}
      />
      <NewGroupChatModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
