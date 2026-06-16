"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { ArrowLeft, Bookmark, Calendar, ChevronDown, Eraser, Loader2, MessageCircle, MoreVertical, Pin, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatDateJumpModal } from "@/components/chat/ChatDateJumpModal";
import { ChatSearchPanel } from "@/components/chat/ChatSearchPanel";
import { GroupInfoModal } from "@/components/chat/GroupInfoModal";
import { ForwardMessageModal } from "@/components/chat/ForwardMessageModal";
import { MessageBubble, type ChatMessage } from "@/components/chat/MessageBubble";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { PresenceAvatar } from "@/components/chat/PresenceAvatar";
import { useRealtime } from "@/components/RealtimeProvider";
import { formatChatDateLabel, toDateKey } from "@/lib/chat-dates";
import { formatPresenceSubtitle } from "@/lib/presence";
import { attachReceiptStatuses, type ParticipantReceipt } from "@/lib/chat-receipts";
import { isDocumentShareBody } from "@/lib/document-ui";
import { setActiveConversationId } from "@/lib/active-chat";
import { sendTypingIndicator } from "@/lib/realtime-ws-client";
import {
  subscribeConversationChannel,
  unsubscribeConversationChannel,
} from "@/lib/pusher-client";
import { cn } from "@/lib/utils";

export interface ChatConversation {
  id: string;
  type: string;
  name: string;
  participants: { id: string; name: string; email?: string; image?: string | null; lastSeenAt?: string | null }[];
  unreadCount?: number;
  canPost?: boolean;
  archivedAt?: string | null;
}

interface ChatThreadProps {
  conversation: ChatConversation | null;
  readOnly?: boolean;
  onRead?: () => void;
  onDeleted?: () => void;
  onCleared?: () => void;
  onBack?: () => void;
  onConversationUpdated?: () => void;
  onMessageSent?: (
    conversationId: string,
    lastMessage: {
      id: string;
      body: string;
      createdAt: string;
      user: { id: string; name: string };
    }
  ) => void;
}

export function ChatThread({ conversation, readOnly = false, onRead, onDeleted, onCleared, onBack, onConversationUpdated, onMessageSent }: ChatThreadProps) {
  const { data: session } = useSession();
  const { selectedWorkspaceId } = useWorkspace();
  const userId = session?.user?.id;
  const { isUserOnline, presenceVersion } = useRealtime();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [menuMounted, setMenuMounted] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dateJumpOpen, setDateJumpOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"normal" | "date">("normal");
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ParticipantReceipt[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const [peerLastSeenAt, setPeerLastSeenAt] = useState<string | null>(null);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [newMessagesBelow, setNewMessagesBelow] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const onReadRef = useRef(onRead);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadInFlightRef = useRef(false);
  const fetchGenRef = useRef(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSendsRef = useRef<
    Map<string, { body: string; parentId: string | null; file?: File | null }>
  >(new Map());

  const SCROLL_BOTTOM_THRESHOLD = 120;

  onReadRef.current = onRead;

  const updateStickToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return false;
    const near =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
    stickToBottomRef.current = near;
    if (near) setNewMessagesBelow(0);
    return near;
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => updateStickToBottom();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [conversation?.id, updateStickToBottom]);

  useEffect(() => setMenuMounted(true), []);

  useLayoutEffect(() => {
    if (!headerMenuOpen || !menuButtonRef.current) return;
    const rect = menuButtonRef.current.getBoundingClientRect();
    const menuWidth = 176;
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    setMenuPos({ top: rect.bottom + 4, left });
  }, [headerMenuOpen]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const top = el.scrollHeight;
    if (behavior === "instant") {
      el.scrollTop = top;
    } else {
      el.scrollTo({ top, behavior });
    }
    stickToBottomRef.current = true;
    setNewMessagesBelow(0);
  }, []);

  const lastMessage = messages[messages.length - 1];
  const scrollAnchorKey = lastMessage
    ? `${lastMessage.id}:${lastMessage.sendStatus ?? "ok"}:${messages.length}`
    : `empty:${messages.length}`;

  useLayoutEffect(() => {
    if (!stickToBottomRef.current || messages.length === 0) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [scrollAnchorKey, messages.length]);

  const scrollToMessage = useCallback((messageId: string) => {
    setSearchOpen(false);
    const run = () => {
      const container = scrollContainerRef.current;
      const target = document.getElementById(`msg-${messageId}`);
      if (!container || !target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset =
        targetRect.top -
        containerRect.top +
        container.scrollTop -
        container.clientHeight / 2 +
        targetRect.height / 2;
      container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
      target.classList.add("ring-2", "ring-[var(--accent)]", "rounded-lg");
      setTimeout(() => {
        target.classList.remove("ring-2", "ring-[var(--accent)]", "rounded-lg");
      }, 1500);
    };
    setTimeout(run, 80);
  }, []);

  const applyMessageData = useCallback(
    (
      data: {
        messages?: ChatMessage[];
        pinned?: ChatMessage[];
        receipts?: ParticipantReceipt[];
        hasMore?: boolean;
        nextCursor?: string | null;
      },
      opts?: { prepend?: boolean }
    ) => {
      if (data.receipts) setReceipts(data.receipts);
      if (opts?.prepend) {
        const container = scrollContainerRef.current;
        const prevScrollHeight = container?.scrollHeight ?? 0;
        setMessages((prev) => [...(data.messages ?? []), ...prev]);
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop += container.scrollHeight - prevScrollHeight;
          }
        });
      } else {
        setMessages(data.messages ?? []);
        setPinned(data.pinned ?? []);
      }
      setHasMore(Boolean(data.hasMore));
      setCursor(data.nextCursor ?? null);
    },
    []
  );

  const refreshReceiptStatuses = useCallback(
    (nextReceipts: ParticipantReceipt[]) => {
      if (!userId) return;
      setMessages((prev) => attachReceiptStatuses(prev, userId, nextReceipts));
      setPinned((prev) => attachReceiptStatuses(prev, userId, nextReceipts));
    },
    [userId]
  );

  const fetchMessages = useCallback(
    async (convId: string, opts?: { cursor?: string; prepend?: boolean; silent?: boolean }) => {
      const gen = ++fetchGenRef.current;
      if (!opts?.silent) setLoading(true);

      try {
        const params = new URLSearchParams();
        if (opts?.cursor) params.set("cursor", opts.cursor);
        const qs = params.toString();
        const res = await fetch(
          `/api/conversations/${convId}/messages${qs ? `?${qs}` : ""}`
        );
        const data = await res.json();

        if (gen !== fetchGenRef.current) return;

        if (res.ok) {
          applyMessageData(data, { prepend: opts?.prepend });
        } else {
          toast.error("Could not load messages");
        }
      } catch {
        if (gen === fetchGenRef.current) toast.error("Could not load messages");
      } finally {
        if (gen === fetchGenRef.current && !opts?.silent) setLoading(false);
      }
    },
    [applyMessageData]
  );

  const returnToLatest = useCallback(() => {
    const convId = conversation?.id;
    if (!convId) return;
    setViewMode("normal");
    setActiveDateKey(null);
    void fetchMessages(convId).then(() => setTimeout(() => scrollToBottom("instant"), 50));
  }, [conversation?.id, fetchMessages, scrollToBottom]);

  const jumpToDate = useCallback(
    async (dateKey: string) => {
      if (!conversation) return;
      const gen = ++fetchGenRef.current;
      setLoading(true);
      setViewMode("date");
      setActiveDateKey(dateKey);
      setSearchOpen(false);

      try {
        const res = await fetch(
          `/api/conversations/${conversation.id}/messages?date=${dateKey}`
        );
        const data = await res.json();
        if (gen !== fetchGenRef.current) return;

        if (res.ok) {
          setMessages(data.messages ?? []);
          setPinned([]);
          setHasMore(Boolean(data.hasMoreBefore));
          setCursor(
            data.hasMoreBefore && data.messages?.[0]
              ? data.messages[0].createdAt
              : null
          );
        } else {
          toast.error("Could not load messages for that date");
        }
      } catch {
        if (gen === fetchGenRef.current) toast.error("Could not load messages for that date");
      } finally {
        if (gen === fetchGenRef.current) setLoading(false);
      }
    },
    [conversation]
  );

  const navigateToMessage = useCallback(
    async (target: { id: string; createdAt: string }) => {
      if (viewMode === "date") {
        await returnToLatest();
      }
      if (messages.some((m) => m.id === target.id)) {
        scrollToMessage(target.id);
        return;
      }
      const dateKey = toDateKey(target.createdAt);
      await jumpToDate(dateKey);
      setTimeout(() => scrollToMessage(target.id), 150);
    },
    [messages, jumpToDate, scrollToMessage, viewMode, returnToLatest]
  );

  const handleSearchSelect = useCallback(
    async (msg: ChatMessage) => {
      await navigateToMessage({ id: msg.id, createdAt: msg.createdAt });
    },
    [navigateToMessage]
  );

  const updateMessageInState = useCallback((updated: ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    setPinned((prev) => {
      if (updated.deletedAt) return prev.filter((m) => m.id !== updated.id);
      const without = prev.filter((m) => m.id !== updated.id);
      if (updated.pinnedAt) return [updated, ...without];
      return without;
    });
  }, []);

  const markRead = useCallback((convId: string) => {
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      if (markReadInFlightRef.current) return;
      markReadInFlightRef.current = true;
      void fetch(`/api/conversations/${convId}/read`, { method: "PATCH" })
        .then(() => onReadRef.current?.())
        .catch(() => {})
        .finally(() => {
          markReadInFlightRef.current = false;
        });
    }, 300);
  }, []);

  useEffect(() => {
    const convId = conversation?.id;
    if (!convId) {
      setMessages([]);
      setPinned([]);
      setReceipts([]);
      setLoading(false);
      setReplyTo(null);
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
      setActiveConversationId(null);
      return;
    }

    setActiveConversationId(convId);
    setMessages([]);
    setPinned([]);
    setReceipts([]);
    setHasMore(false);
    setCursor(null);
    setReplyTo(null);
    setSearchOpen(false);
    setViewMode("normal");
    setActiveDateKey(null);
    stickToBottomRef.current = true;
    setNewMessagesBelow(0);

    void (async () => {
      await fetchMessages(convId);
      markRead(convId);
    })();

    return () => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
      setActiveConversationId(null);
    };
  }, [conversation?.id, fetchMessages, markRead]);

  useEffect(() => {
    const convId = conversation?.id;
    if (!convId || messages.length === 0) return;

    const hash = window.location.hash;
    if (hash.startsWith("#msg-")) {
      const messageId = hash.slice(5);
      setTimeout(() => scrollToMessage(messageId), 100);
    }
  }, [conversation?.id, messages.length, scrollToMessage]);

  useEffect(() => {
    const convId = conversation?.id;
    if (!convId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        conversationId?: string;
        type?: string;
        message?: ChatMessage;
        messageId?: string;
      };
      if (detail.conversationId !== convId) return;

      if (detail.type === "message:created" && detail.message) {
        const incoming = detail.message;
        const wasNearBottom = updateStickToBottom();
        const shouldStick = wasNearBottom || incoming.user.id === userId;

        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          const withoutOptimistic = prev.filter(
            (m) =>
              !(
                m.sendStatus &&
                m.user.id === incoming.user.id &&
                m.body === incoming.body
              )
          );
          return [...withoutOptimistic, incoming];
        });

        if (shouldStick) {
          stickToBottomRef.current = true;
          setNewMessagesBelow(0);
        } else if (incoming.user.id !== userId) {
          setNewMessagesBelow((n) => n + 1);
        }

        markRead(convId);

        if (isDocumentShareBody(incoming.body) && !incoming.sharedDocument) {
          void fetchMessages(convId, { silent: true });
        }
        return;
      }

      if (detail.type === "message:updated" && detail.message) {
        updateMessageInState(detail.message as ChatMessage);
        return;
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const shouldStick = updateStickToBottom();
        void fetchMessages(convId, { silent: true }).then(() => {
          markRead(convId);
          if (shouldStick) {
            stickToBottomRef.current = true;
            setNewMessagesBelow(0);
          }
        });
      }, 300);
    };

    window.addEventListener("taskflow:message", handler);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("taskflow:message", handler);
    };
  }, [conversation?.id, fetchMessages, markRead, updateMessageInState, updateStickToBottom, userId]);

  useEffect(() => {
    const convId = conversation?.id;
    if (!convId) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        conversationId?: string;
        userId?: string;
        lastReadAt?: string;
        lastReceivedAt?: string;
      };
      if (detail.conversationId !== convId || !detail.userId || detail.userId === userId) return;

      setReceipts((prev) => {
        const existing = prev.find((r) => r.userId === detail.userId);
        const next: ParticipantReceipt = {
          userId: detail.userId!,
          lastReadAt: detail.lastReadAt ?? existing?.lastReadAt ?? null,
          lastReceivedAt: detail.lastReceivedAt ?? existing?.lastReceivedAt ?? null,
        };
        return existing
          ? prev.map((r) => (r.userId === detail.userId ? next : r))
          : [...prev, next];
      });
    };

    window.addEventListener("taskflow:receipt", handler);
    return () => window.removeEventListener("taskflow:receipt", handler);
  }, [conversation?.id, userId]);

  useEffect(() => {
    if (!userId || receipts.length === 0) return;
    refreshReceiptStatuses(receipts);
  }, [receipts, userId, refreshReceiptStatuses]);

  useEffect(() => {
    const convId = conversation?.id;
    if (!convId) return;

    subscribeConversationChannel(convId);
    return () => unsubscribeConversationChannel(convId);
  }, [conversation?.id]);

  useEffect(() => {
    const convId = conversation?.id;
    if (!convId) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        conversationId?: string;
        userId?: string;
        typing?: boolean;
      };
      if (detail.conversationId !== convId || !detail.userId || detail.userId === userId) return;
      setTypingUserIds((prev) => {
        const next = new Set(prev);
        if (detail.typing) next.add(detail.userId!);
        else next.delete(detail.userId!);
        return next;
      });
    };

    window.addEventListener("taskflow:typing", handler);
    return () => window.removeEventListener("taskflow:typing", handler);
  }, [conversation?.id, userId]);

  const handleTyping = useCallback(() => {
    const convId = conversation?.id;
    if (!convId || readOnly) return;
    sendTypingIndicator(convId, true);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => sendTypingIndicator(convId, false), 2500);
  }, [conversation?.id, readOnly]);

  const sendMessageRequest = async (
    convId: string,
    text: string,
    parentId: string | null,
    file?: File | null
  ) => {
    if (file) {
      const formData = new FormData();
      formData.set("body", text);
      if (parentId) formData.set("parentId", parentId);
      formData.set("file", file);
      return fetch(`/api/conversations/${convId}/messages`, { method: "POST", body: formData });
    }
    return fetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, parentId }),
    });
  };

  const handleRetrySend = useCallback(
    async (clientTempId: string) => {
      if (!conversation || !userId || !session?.user?.name) return;
      const pending = pendingSendsRef.current.get(clientTempId);
      if (!pending) return;

      stickToBottomRef.current = true;
      setNewMessagesBelow(0);
      setMessages((prev) =>
        prev.map((m) =>
          m.clientTempId === clientTempId ? { ...m, sendStatus: "sending" as const } : m
        )
      );

      try {
        const res = await sendMessageRequest(
          conversation.id,
          pending.body,
          pending.parentId,
          pending.file
        );
        const data = await res.json();
        if (res.ok) {
          pendingSendsRef.current.delete(clientTempId);
          setMessages((prev) =>
            prev.map((m) =>
              m.clientTempId === clientTempId
                ? { ...data.message, receiptStatus: "sent" as const }
                : m
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.clientTempId === clientTempId ? { ...m, sendStatus: "failed" as const } : m
            )
          );
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === clientTempId ? { ...m, sendStatus: "failed" as const } : m
          )
        );
      }
    },
    [conversation, userId, session?.user?.name]
  );

  const handleSend = async (opts?: { file?: File | null }) => {
    if (!conversation || readOnly || !userId || !session?.user?.name || sending) return;
    const text = body.trim();
    const file = opts?.file;
    if (!text && !file) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    const parentId = replyTo?.id ?? null;
    const optimisticBody = text || (file ? `📎 ${file.name}` : "");

    pendingSendsRef.current.set(tempId, { body: text, parentId, file: file ?? null });
    stickToBottomRef.current = true;
    setNewMessagesBelow(0);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        clientTempId: tempId,
        body: optimisticBody,
        createdAt: new Date().toISOString(),
        user: { id: userId, name: session.user.name ?? "You", image: session.user.image ?? null },
        sendStatus: "sending" as const,
        parent: replyTo
          ? {
              id: replyTo.id,
              body: replyTo.body,
              user: replyTo.user,
              createdAt: replyTo.createdAt,
            }
          : null,
      },
    ]);
    setBody("");
    setReplyTo(null);
    if (conversation.id) sendTypingIndicator(conversation.id, false);

    onMessageSent?.(conversation.id, {
      id: tempId,
      body: optimisticBody,
      createdAt: new Date().toISOString(),
      user: { id: userId, name: session.user.name ?? "You" },
    });

    setSending(true);
    try {
      const res = await sendMessageRequest(conversation.id, text, parentId, file);
      const data = await res.json();

      if (res.ok) {
        pendingSendsRef.current.delete(tempId);
        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === tempId
              ? { ...data.message, receiptStatus: "sent" as const }
              : m
          )
        );
        const sent = data.message as ChatMessage;
        onMessageSent?.(conversation.id, {
          id: sent.id,
          body: sent.body,
          createdAt: sent.createdAt,
          user: { id: sent.user.id, name: sent.user.name },
        });
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === tempId ? { ...m, sendStatus: "failed" as const } : m
          )
        );
        toast.error("Could not send message");
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.clientTempId === tempId ? { ...m, sendStatus: "failed" as const } : m
        )
      );
      toast.error("Could not send message");
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!conversation || readOnly) return;
    const res = await fetch(
      `/api/conversations/${conversation.id}/messages/${messageId}/reactions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      updateMessageInState(data.message);
    }
  };

  const handlePin = async (messageId: string, pin: boolean) => {
    if (!conversation || readOnly) return;
    const res = await fetch(
      `/api/conversations/${conversation.id}/messages/${messageId}/pin`,
      { method: pin ? "POST" : "DELETE" }
    );
    if (res.ok) {
      const data = await res.json();
      updateMessageInState(data.message);
      toast.success(pin ? "Message pinned" : "Message unpinned");
    }
  };

  const handleEdit = async (messageId: string, newBody: string) => {
    if (!conversation || readOnly) return;
    const res = await fetch(
      `/api/conversations/${conversation.id}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newBody }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      updateMessageInState(data.message);
      toast.success("Message updated");
    } else {
      toast.error("Could not edit message");
      throw new Error("edit failed");
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!conversation || readOnly) return;
    const res = await fetch(
      `/api/conversations/${conversation.id}/messages/${messageId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      const data = await res.json();
      updateMessageInState(data.message);
      toast.success("Message deleted");
    } else {
      toast.error("Could not delete message");
    }
  };

  const handleDeleteConversation = async () => {
    if (!conversation) return;
    if (conversation.type === "WORKSPACE" || conversation.type === "PERSONAL") return;

    const isDirect = conversation.type === "DIRECT";
    const message = isDirect
      ? "Remove this conversation from your list?"
      : "Leave this group? It will be removed from your list.";
    if (!window.confirm(message)) return;

    const res = await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(isDirect ? "Conversation removed" : "Left group");
      setHeaderMenuOpen(false);
      onDeleted?.();
    } else {
      toast.error("Could not delete conversation");
    }
  };

  const handleClearChat = async () => {
    if (!conversation || (messages.length === 0 && pinned.length === 0)) return;
    if (
      !window.confirm(
        "Clear all messages from this chat? Messages will only be cleared for you — others can still see them."
      )
    ) {
      return;
    }
    const res = await fetch(`/api/conversations/${conversation.id}/clear`, { method: "POST" });
    if (res.ok) {
      fetchGenRef.current++;
      setMessages([]);
      setPinned([]);
      setHasMore(false);
      setCursor(null);
      setViewMode("normal");
      setActiveDateKey(null);
      setHeaderMenuOpen(false);
      toast.success("Chat cleared");
      onCleared?.();
    } else {
      toast.error("Could not clear chat");
    }
  };

  const loadOlder = () => {
    if (!conversation || !cursor || loading) return;
    void fetchMessages(conversation.id, { cursor, prepend: true });
  };

  const directPeerId =
    conversation?.type === "DIRECT"
      ? conversation.participants.find((p) => p.id !== userId)?.id
      : undefined;

  useEffect(() => {
    setPeerLastSeenAt(null);
  }, [conversation?.id, directPeerId]);

  useEffect(() => {
    if (!directPeerId) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; online?: boolean }>).detail;
      if (detail?.userId !== directPeerId) return;
      setPeerLastSeenAt(detail.online ? null : new Date().toISOString());
    };
    window.addEventListener("taskflow:presence", handler);
    return () => window.removeEventListener("taskflow:presence", handler);
  }, [directPeerId]);

  if (!conversation) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--background)] p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-[var(--foreground)]">Select a conversation</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Choose a chat from the list or start a new one
          </p>
        </div>
      </div>
    );
  }

  const mentionMembers = conversation.participants.map((p) => ({ id: p.id, name: p.name }));
  const showMentions = mentionMembers.length > 1;
  const isPersonal = conversation.type === "PERSONAL";
  const isDirect = conversation.type === "DIRECT";
  const isDmStyle = isDirect || isPersonal;
  const directPeer = isDirect
    ? conversation.participants.find((p) => p.id !== userId)
    : null;

  const typingNames = [...typingUserIds]
    .map((id) => conversation.participants.find((p) => p.id === id)?.name)
    .filter((n): n is string => Boolean(n));

  const subtitle = formatPresenceSubtitle({
    type: conversation.type,
    participantIds: conversation.participants.map((p) => p.id),
    isUserOnline,
    currentUserId: userId,
    peerEmail: directPeer?.email,
    peerLastSeen: peerLastSeenAt ?? directPeer?.lastSeenAt ?? null,
    typingNames,
  });

  const emptyHint = (() => {
    if (conversation.type === "PERSONAL") {
      return "Save notes, links, and reminders here. Only you can see this chat.";
    }
    if (conversation.type === "DIRECT") {
      return `This is the beginning of your conversation with ${conversation.name}.`;
    }
    if (conversation.type === "WORKSPACE") {
      return `Say hi to your team in ${conversation.name}.`;
    }
    return "Send a message to get the group chat started.";
  })();

  const EmptyIcon =
    conversation.type === "PERSONAL"
      ? Bookmark
      : conversation.type === "DIRECT"
      ? MessageCircle
      : conversation.type === "WORKSPACE"
        ? Users
        : MessageCircle;

  const pinnedNotInFeed = pinned.filter((p) => !messages.some((m) => m.id === p.id));
  const pinnedDisplay = [...pinned, ...pinnedNotInFeed].filter(
    (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i
  ).slice(0, 3);

  const canDeleteConversation =
    conversation.type === "DIRECT" || conversation.type === "GROUP";
  const canClearChat = messages.length > 0 || pinned.length > 0;

  const headerMenu = headerMenuOpen && menuMounted ? (
    <>
      <div className="fixed inset-0 z-[200]" onClick={() => setHeaderMenuOpen(false)} aria-hidden="true" />
      <div
        className="fixed z-[201] min-w-[11rem] rounded-lg border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg"
        style={{ top: menuPos.top, left: menuPos.left }}
      >
        <button
          type="button"
          onClick={() => {
            setSearchOpen(true);
            setHeaderMenuOpen(false);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-hover)]"
        >
          <Search className="h-3.5 w-3.5" /> Search messages
        </button>
        <button
          type="button"
          onClick={() => {
            setDateJumpOpen(true);
            setHeaderMenuOpen(false);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-hover)]"
        >
          <Calendar className="h-3.5 w-3.5" /> Go to date
        </button>
        {conversation.type === "GROUP" && (
          <button
            type="button"
            onClick={() => {
              setGroupInfoOpen(true);
              setHeaderMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-hover)]"
          >
            <Users className="h-3.5 w-3.5" /> Group info
          </button>
        )}
        <button
          type="button"
          disabled={!canClearChat}
          onClick={() => void handleClearChat()}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
            canClearChat
              ? "text-red-500 hover:bg-red-500/10"
              : "cursor-not-allowed text-[var(--muted)] opacity-50"
          )}
        >
          <Eraser className="h-3.5 w-3.5" /> Clear chat
        </button>
        <div className="my-1 border-t border-[var(--card-border)]" />
        {canDeleteConversation && (
          <button
            type="button"
            onClick={() => void handleDeleteConversation()}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-500 hover:bg-red-500/10"
          >
            {conversation.type === "DIRECT" ? (
              <>
                <Trash2 className="h-3.5 w-3.5" /> Delete conversation
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" /> Leave group
              </>
            )}
          </button>
        )}
      </div>
    </>
  ) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--background)]">
      <div className="relative z-10 flex shrink-0 items-center gap-1 border-b border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 md:gap-2 md:px-4 md:py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] md:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 pr-[4.5rem]">
          {isDirect && directPeer ? (
            <PresenceAvatar
              name={directPeer.name}
              image={directPeer.image}
              userId={directPeer.id}
              size="md"
            />
          ) : isPersonal ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10">
              <Bookmark className="h-5 w-5 text-[var(--accent)]" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-[var(--foreground)]">
              {conversation.name}
            </h2>
            <p
              className={cn(
                "truncate text-xs",
                isDirect && directPeer && isUserOnline(directPeer.id)
                  ? "font-medium text-emerald-600 dark:text-emerald-400"
                  : "text-[var(--muted)]"
              )}
            >
              {subtitle}
            </p>
          </div>
        </div>
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 md:right-4">
          <button
            type="button"
            onClick={() => {
              setSearchOpen((v) => !v);
              setHeaderMenuOpen(false);
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-hover)]",
              searchOpen ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
            aria-label="Search messages"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setHeaderMenuOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            aria-label="Chat options"
            aria-expanded={headerMenuOpen}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
      {menuMounted && headerMenu ? createPortal(headerMenu, document.body) : null}

      {searchOpen && (
        <ChatSearchPanel
          conversationId={conversation.id}
          onClose={() => setSearchOpen(false)}
          onSelectMessage={handleSearchSelect}
        />
      )}

      {viewMode === "date" && activeDateKey && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--card-border)] bg-[var(--accent)]/5 px-3 py-2 md:px-4">
          <p className="text-xs text-[var(--foreground)]">
            Viewing <span className="font-semibold">{formatChatDateLabel(`${activeDateKey}T12:00:00`)}</span>
          </p>
          <button
            type="button"
            onClick={returnToLatest}
            className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline"
          >
            Back to latest
          </button>
        </div>
      )}

      <ChatDateJumpModal
        isOpen={dateJumpOpen}
        conversationId={conversation.id}
        onClose={() => setDateJumpOpen(false)}
        onSelectDate={(dateKey) => void jumpToDate(dateKey)}
      />

      {pinned.length > 0 && (
        <div className="border-b border-[var(--card-border)] bg-amber-500/5 px-4 py-2">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            <Pin className="h-3 w-3" /> Pinned
          </p>
          <div className="space-y-1">
            {[...pinnedDisplay].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => scrollToMessage(p.id)}
                className="block w-full truncate rounded px-1 text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <span className="font-medium text-[var(--foreground)]">{p.user.name}:</span> {p.body}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollContainerRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-3 md:px-5 md:py-4"
      >
        {hasMore && (
          <div className="mb-4 flex shrink-0 justify-center">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loading}
              className="text-xs font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        {loading && messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--muted)]" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center px-6 py-10">
            <div className="flex max-w-sm flex-col items-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card)]/50 px-8 py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)]/10">
                <EmptyIcon className="h-7 w-7 text-[var(--accent)]" />
              </div>
              <p className="text-base font-semibold text-[var(--foreground)]">No messages yet</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{emptyHint}</p>
              {!readOnly && (
                <p className="mt-4 text-xs text-[var(--muted-foreground)]">
                  Use the toolbar below to send a message, emoji, or file
                </p>
              )}
            </div>
          </div>
        )}
        {messages.length > 0 && (
          <div className="space-y-4 pb-2">
            {messages.map((msg, index) => {
              const prev = messages[index - 1];
              const showDateDivider =
                !prev || toDateKey(prev.createdAt) !== toDateKey(msg.createdAt);

              return (
                <div key={msg.id}>
                  {showDateDivider && (
                    <div className="mb-4 flex justify-center">
                      <span className="rounded-full bg-[var(--surface-hover)] px-3 py-1 text-[10px] font-medium text-[var(--muted)] shadow-sm">
                        {formatChatDateLabel(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <div id={`msg-${msg.id}`}>
                    <MessageBubble
                      message={msg}
                      isOwn={msg.user.id === userId}
                      currentUserId={userId}
                      readOnly={readOnly}
                      mentionMembers={mentionMembers}
                      showUserPresence={false}
                      hideAvatars={isDmStyle}
                      onJumpToMessage={(id, createdAt) => void navigateToMessage({ id, createdAt })}
                      onRetrySend={(tempId) => void handleRetrySend(tempId)}
                      onReply={setReplyTo}
                      onForward={readOnly ? undefined : setForwardMessage}
                      onReact={handleReact}
                      onPin={handlePin}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {newMessagesBelow > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] shadow-lg hover:bg-[var(--surface-hover)]"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          {newMessagesBelow === 1 ? "New message" : `${newMessagesBelow} new messages`}
        </button>
      )}
      </div>

      <div className="shrink-0 border-t border-[var(--card-border)] px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-4 md:py-3">
        <ChatComposer
          body={body}
          onBodyChange={setBody}
          onSend={handleSend}
          onTyping={handleTyping}
          sending={sending}
          readOnly={readOnly}
          members={conversation.participants}
          showMentions={showMentions}
          currentUserId={userId}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      <ForwardMessageModal
        message={forwardMessage}
        isOpen={Boolean(forwardMessage)}
        onClose={() => setForwardMessage(null)}
        workspaceId={selectedWorkspaceId}
      />

      {conversation.type === "GROUP" && (
        <GroupInfoModal
          isOpen={groupInfoOpen}
          conversationId={conversation.id}
          conversationName={conversation.name}
          participants={conversation.participants}
          currentUserId={userId}
          onClose={() => setGroupInfoOpen(false)}
          onUpdated={() => onConversationUpdated?.()}
        />
      )}
    </div>
  );
}
