"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { ArrowLeft, Bookmark, Calendar, ChevronDown, Eraser, Loader2, MessageCircle, MoreVertical, Pin, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ChatComposer } from "@/components/chat/ChatComposer";
import type { SelectedGif } from "@/components/chat/GifPicker";
import { ChatFileDropOverlay } from "@/components/chat/ChatFileDropOverlay";
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
import {
  attachReceiptStatuses,
  mergeParticipantReceipt,
  type ParticipantReceipt,
} from "@/lib/chat-receipts";
import { MomBuilderModal } from "@/components/chat/MomBuilderModal";
import { ScheduleMessageDialog } from "@/components/chat/ScheduleMessageDialog";
import { ScheduledMessageCard } from "@/components/chat/ScheduledMessageCard";
import type { RichMessageDoc } from "@/lib/rich-message-types";
import { hasRichFormatting } from "@/lib/rich-message-serialize";
import type { ScheduledMessageClient } from "@/lib/scheduled-message-types";
import { attachmentPlaceholderBody, isImageAttachment } from "@/lib/attachments";
import { isDocumentShareBody, isMomShareBody } from "@/lib/document-ui";
import { setActiveConversationId } from "@/lib/active-chat";
import { sendTypingIndicator } from "@/lib/realtime-ws-client";
import {
  subscribeConversationChannel,
  unsubscribeConversationChannel,
} from "@/lib/pusher-client";
import { chatFileKey, mergeChatUploadFiles, useFileDragDrop } from "@/lib/chat-file-drop";
import {
  mergeMessageUpdate,
  mergeMessagesFromFetch,
  replaceSentMessage,
  sortChatMessages,
} from "@/lib/chat-message-merge";
import { cn } from "@/lib/utils";
import { useMediaQuery, useVisualViewport } from "@/lib/use-visual-viewport";
import type { GroupRole } from "@/lib/group-permissions";

export interface ChatConversation {
  id: string;
  type: string;
  name: string;
  workspaceId?: string | null;
  participants: {
    id: string;
    name: string;
    email?: string;
    image?: string | null;
    lastSeenAt?: string | null;
    role?: GroupRole;
  }[];
  currentUserRole?: GroupRole;
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
  stagedDrop?: File[] | null;
  onStagedDropConsumed?: () => void;
}

function buildOptimisticAttachments(tempId: string, files: File[]) {
  return files.map((f, i) => ({
    id: `temp-att-${tempId}-${i}`,
    filename: f.name,
    url: isImageAttachment(f.type) ? URL.createObjectURL(f) : "",
    mimeType: f.type || "application/octet-stream",
    size: f.size,
  }));
}

const BLOB_REVOKE_DELAY_MS = 15_000;

function scheduleRevokeOptimisticAttachments(attachments?: ChatMessage["attachments"]) {
  for (const a of attachments ?? []) {
    if (!a.url.startsWith("blob:")) continue;
    setTimeout(() => URL.revokeObjectURL(a.url), BLOB_REVOKE_DELAY_MS);
  }
}

function revokeAllBlobAttachments(messages: ChatMessage[]) {
  for (const m of messages) {
    for (const a of m.attachments ?? []) {
      if (a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
    }
  }
}

export function ChatThread({ conversation, readOnly = false, onRead, onDeleted, onCleared, onBack, onConversationUpdated, onMessageSent, stagedDrop, onStagedDropConsumed }: ChatThreadProps) {
  const { data: session } = useSession();
  const { selectedWorkspaceId, workspaces } = useWorkspace();
  const userId = session?.user?.id;
  const { isUserOnline, presenceVersion } = useRealtime();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const visualViewport = useVisualViewport();
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [bodyJson, setBodyJson] = useState<RichMessageDoc | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
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
  const receiptsRef = useRef<ParticipantReceipt[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const [peerLastSeenAt, setPeerLastSeenAt] = useState<string | null>(null);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [momModalOpen, setMomModalOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingScheduled, setEditingScheduled] = useState<ScheduledMessageClient | null>(null);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessageClient[]>([]);
  const [newMessagesBelow, setNewMessagesBelow] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const onReadRef = useRef(onRead);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadInFlightRef = useRef(false);
  const fetchGenRef = useRef(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);
  const pendingSendsRef = useRef<
    Map<
      string,
      {
        body: string;
        bodyJson: RichMessageDoc | null;
        parentId: string | null;
        files: File[];
        giphyId?: string;
      }
    >
  >(new Map());

  const SCROLL_BOTTOM_THRESHOLD = 120;

  onReadRef.current = onRead;

  const addPendingFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    setPendingFiles((prev) => mergeChatUploadFiles(prev, incoming));
  }, []);

  const handleThreadDropFiles = useCallback(
    (incoming: File[]) => {
      if (readOnly) {
        toast.error("You cannot attach files here");
        return;
      }
      addPendingFiles(incoming);
    },
    [readOnly, addPendingFiles]
  );

  const { isDragging: isThreadDragging, dragHandlers: threadDragHandlers } = useFileDragDrop({
    disabled: readOnly || !conversation,
    onFiles: handleThreadDropFiles,
  });

  useEffect(() => {
    setPendingFiles([]);
    setEditingMessage(null);
    setReplyTo(null);
    setBody("");
    setBodyJson(null);
  }, [conversation?.id]);

  useEffect(() => {
    if (!stagedDrop || stagedDrop.length === 0) return;
    setPendingFiles(mergeChatUploadFiles([], stagedDrop));
    onStagedDropConsumed?.();
  }, [stagedDrop, onStagedDropConsumed]);

  useEffect(() => {
    receiptsRef.current = receipts;
  }, [receipts]);

  useEffect(() => {
    const update = () => setLayoutHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const keyboardOpen =
    isMobile && layoutHeight > 0 && visualViewport.height < layoutHeight * 0.85;

  const withReceipts = useCallback(
    (msgs: ChatMessage[]): ChatMessage[] => {
      if (!userId) return msgs;
      return attachReceiptStatuses(msgs, userId, receiptsRef.current) as ChatMessage[];
    },
    [userId]
  );

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

  const fetchScheduledMessages = useCallback(async (convId: string) => {
    if (readOnly) {
      setScheduledMessages([]);
      return;
    }
    try {
      const res = await fetch(`/api/conversations/${convId}/scheduled-messages`);
      const data = await res.json();
      if (res.ok) {
        setScheduledMessages(data.scheduledMessages ?? []);
      }
    } catch {
      setScheduledMessages([]);
    }
  }, [readOnly]);

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
        setMessages((prev) =>
          withReceipts(mergeMessagesFromFetch(prev, data.messages ?? []))
        );
        setPinned(data.pinned ?? []);
      }
      setHasMore(Boolean(data.hasMore));
      setCursor(data.nextCursor ?? null);
    },
    [withReceipts]
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

  const updateMessageInState = useCallback(
    (updated: ChatMessage) => {
      setMessages((prev) =>
        withReceipts(
          prev.map((m) => {
            if (m.id !== updated.id) return m;
            return mergeMessageUpdate(m, updated);
          })
        )
      );
      setPinned((prev) => {
        if (updated.deletedAt) return prev.filter((m) => m.id !== updated.id);
        const without = prev.filter((m) => m.id !== updated.id);
        const next = updated.pinnedAt ? [updated, ...without] : without;
        return withReceipts(next);
      });
    },
    [withReceipts]
  );

  const markRead = useCallback((convId: string) => {
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      if (markReadInFlightRef.current) return;
      markReadInFlightRef.current = true;
      void fetch(`/api/conversations/${convId}/read`, { method: "PATCH" })
        .then(() => {
          onReadRef.current?.();
          window.dispatchEvent(new CustomEvent("taskflow:chat-unread"));
        })
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
      setScheduledMessages([]);
      setLoading(false);
      setReplyTo(null);
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
      setActiveConversationId(null);
      return;
    }

    setActiveConversationId(convId);
    setMessages((prev) => {
      revokeAllBlobAttachments(prev);
      return [];
    });
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
      await fetchScheduledMessages(convId);
      markRead(convId);
    })();

    return () => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
      setActiveConversationId(null);
    };
  }, [conversation?.id, fetchMessages, fetchScheduledMessages, markRead]);

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
        if (incoming.user.id === userId) {
          void fetchScheduledMessages(convId);
          setMessages((prev) => {
            const withoutOptimistic = prev.filter(
              (m) =>
                !(
                  m.sendStatus &&
                  m.user.id === incoming.user.id &&
                  m.body === incoming.body
                )
            );
            if (withoutOptimistic.some((m) => m.id === incoming.id)) {
              return withReceipts(withoutOptimistic);
            }
            return withReceipts(sortChatMessages([...withoutOptimistic, incoming]));
          });
          return;
        }

        const wasNearBottom = updateStickToBottom();
        const shouldStick = wasNearBottom || incoming.user.id === userId;

        setMessages((prev) => {
          const existingById = prev.find((m) => m.id === incoming.id);
          if (existingById) {
            const existingAtt = existingById.attachments?.length ?? 0;
            const incomingAtt = incoming.attachments?.length ?? 0;
            if (existingAtt > 0 && incomingAtt === 0) return prev;
            if (existingAtt > 0 && incomingAtt > 0) return prev;
          }

          let merged = incoming;
          const optimistic = prev.find(
            (m) =>
              m.sendStatus &&
              m.user.id === incoming.user.id &&
              m.body === incoming.body
          );
          if (optimistic?.attachments?.length && !incoming.attachments?.length) {
            merged = { ...incoming, attachments: optimistic.attachments };
          }

          const withoutOptimistic = prev.filter(
            (m) =>
              !(
                m.sendStatus &&
                m.user.id === incoming.user.id &&
                m.body === incoming.body
              )
          );

          if (withoutOptimistic.some((m) => m.id === merged.id)) {
            return withReceipts(
              sortChatMessages(
                withoutOptimistic.map((m) => {
                  if (m.id !== merged.id) return m;
                  const mAtt = m.attachments?.length ?? 0;
                  const mergedAtt = merged.attachments?.length ?? 0;
                  return mergedAtt >= mAtt ? merged : m;
                })
              )
            );
          }

          return withReceipts(sortChatMessages([...withoutOptimistic, merged]));
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
        if (isMomShareBody(incoming.body) && !incoming.sharedMom) {
          void fetchMessages(convId, { silent: true });
        }
        return;
      }

      if (detail.type === "message:updated" && detail.message) {
        updateMessageInState(detail.message as ChatMessage);
        return;
      }

      if (pendingSendsRef.current.size > 0) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (pendingSendsRef.current.size > 0) return;
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
  }, [
    conversation?.id,
    fetchMessages,
    fetchScheduledMessages,
    markRead,
    updateMessageInState,
    updateStickToBottom,
    userId,
    withReceipts,
  ]);

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
        const next = mergeParticipantReceipt(existing, {
          userId: detail.userId!,
          lastReadAt: detail.lastReadAt,
          lastReceivedAt: detail.lastReceivedAt,
        });
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

    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    const recoverReceipts = () => {
      if (document.hidden) return;
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => void fetchMessages(convId, { silent: true }), 1000);
    };

    document.addEventListener("visibilitychange", recoverReceipts);
    window.addEventListener("focus", recoverReceipts);
    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      document.removeEventListener("visibilitychange", recoverReceipts);
      window.removeEventListener("focus", recoverReceipts);
    };
  }, [conversation?.id, fetchMessages]);

  useEffect(() => {
    setTypingUserIds(new Set());
  }, [conversation?.id]);

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

  useEffect(() => {
    const convId = conversation?.id;
    if (!convId || !userId) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        type?: string;
        conversationId?: string;
        userId?: string;
      };
      if (detail.conversationId !== convId || detail.userId !== userId) return;

      if (detail.type === "conversation:cleared") {
        fetchGenRef.current++;
        setMessages([]);
        setPinned([]);
        setHasMore(false);
        setCursor(null);
        setViewMode("normal");
        setActiveDateKey(null);
        onCleared?.();
        return;
      }

      if (detail.type === "conversation:removed") {
        onDeleted?.();
      }
    };

    window.addEventListener("taskflow:conversation", handler);
    return () => window.removeEventListener("taskflow:conversation", handler);
  }, [conversation?.id, userId, onCleared, onDeleted]);

  const handleTyping = useCallback(() => {
    const convId = conversation?.id;
    if (!convId || readOnly) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      sendTypingIndicator(convId, true);
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => sendTypingIndicator(convId, false), 2500);
  }, [conversation?.id, readOnly]);

  const sendGifMessageRequest = async (
    convId: string,
    giphyId: string,
    parentId: string | null
  ) => {
    return fetch(`/api/conversations/${convId}/messages/gif`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giphyId, parentId }),
    });
  };

  const sendMessageRequest = async (
    convId: string,
    text: string,
    parentId: string | null,
    files: File[] = [],
    json: RichMessageDoc | null = null
  ) => {
    if (files.length > 0) {
      const formData = new FormData();
      formData.set("body", text);
      if (json && hasRichFormatting(json)) {
        formData.set("bodyJson", JSON.stringify(json));
      }
      if (parentId) formData.set("parentId", parentId);
      for (const file of files) {
        formData.append("files", file);
      }
      return fetch(`/api/conversations/${convId}/messages`, { method: "POST", body: formData });
    }
    return fetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: text,
        bodyJson: json && hasRichFormatting(json) ? json : null,
        parentId,
      }),
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
        const res = pending.giphyId
          ? await sendGifMessageRequest(conversation.id, pending.giphyId, pending.parentId)
          : await sendMessageRequest(
              conversation.id,
              pending.body,
              pending.parentId,
              pending.files,
              pending.bodyJson
            );
        const data = await res.json();
        if (res.ok) {
          pendingSendsRef.current.delete(clientTempId);
          setMessages((prev) => {
            const old = prev.find((m) => m.clientTempId === clientTempId);
            scheduleRevokeOptimisticAttachments(old?.attachments);
            return withReceipts(
              replaceSentMessage(prev, clientTempId, data.message as ChatMessage)
            );
          });
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
    [conversation, userId, session?.user?.name, withReceipts]
  );

  const handleSendGif = async (gif: SelectedGif) => {
    if (!conversation || readOnly || !userId || !session?.user?.name || editingMessage) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    const parentId = replyTo?.id ?? null;
    const filename = `giphy-${gif.id}.gif`;
    const optimisticBody = attachmentPlaceholderBody(1, [filename]);
    const optimisticAttachments = [
      {
        id: `temp-att-${tempId}-0`,
        filename,
        url: gif.previewUrl,
        mimeType: "image/gif",
        size: 0,
      },
    ];

    pendingSendsRef.current.set(tempId, {
      body: optimisticBody,
      bodyJson: null,
      parentId,
      files: [],
      giphyId: gif.id,
    });
    stickToBottomRef.current = true;
    setNewMessagesBelow(0);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        clientTempId: tempId,
        body: optimisticBody,
        bodyJson: null,
        createdAt: new Date().toISOString(),
        user: { id: userId, name: session.user.name ?? "You", image: session.user.image ?? null },
        sendStatus: "sending" as const,
        attachments: optimisticAttachments,
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
    setReplyTo(null);
    if (conversation.id) sendTypingIndicator(conversation.id, false);

    onMessageSent?.(conversation.id, {
      id: tempId,
      body: optimisticBody,
      createdAt: new Date().toISOString(),
      user: { id: userId, name: session.user.name ?? "You" },
    });

    try {
      const res = await sendGifMessageRequest(conversation.id, gif.id, parentId);
      const data = await res.json();
      if (res.ok) {
        pendingSendsRef.current.delete(tempId);
        setMessages((prev) => {
          const old = prev.find((m) => m.clientTempId === tempId);
          scheduleRevokeOptimisticAttachments(old?.attachments);
          return withReceipts(
            replaceSentMessage(prev, tempId, data.message as ChatMessage)
          );
        });
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === tempId ? { ...m, sendStatus: "failed" as const } : m
          )
        );
        toast.error(data.error ?? "Could not send GIF");
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.clientTempId === tempId ? { ...m, sendStatus: "failed" as const } : m
        )
      );
      toast.error("Could not send GIF");
    }
  };

  const handleScheduleOpen = () => {
    if (!body.trim() && pendingFiles.length === 0) return;
    setEditingScheduled(null);
    setScheduleDialogOpen(true);
  };

  const handleScheduled = () => {
    setBody("");
    setBodyJson(null);
    setReplyTo(null);
    setPendingFiles([]);
    if (conversation?.id) void fetchScheduledMessages(conversation.id);
  };

  const handleDeleteScheduled = async (item: ScheduledMessageClient) => {
    try {
      const res = await fetch(`/api/conversations/scheduled-messages/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete");
      toast.success("Scheduled message deleted");
      if (conversation?.id) void fetchScheduledMessages(conversation.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    }
  };

  const cancelEditMessage = useCallback(() => {
    setEditingMessage(null);
    setBody("");
    setBodyJson(null);
  }, []);

  const startEditMessage = useCallback((message: ChatMessage) => {
    setReplyTo(null);
    setPendingFiles([]);
    setEditingMessage(message);
    setBody(message.body);
    const doc = message.bodyJson as RichMessageDoc | null | undefined;
    setBodyJson(doc && hasRichFormatting(doc) ? doc : null);
  }, []);

  const handleSend = async (opts?: { files?: File[] }) => {
    if (!conversation || readOnly || !userId || !session?.user?.name) return;
    const text = body.trim();
    const files = opts?.files ?? [];

    if (editingMessage) {
      if (!text) return;
      try {
        await handleEdit(editingMessage.id, text, bodyJson);
        cancelEditMessage();
      } catch {
        // keep composer in edit mode
      }
      return;
    }

    if (!text && files.length === 0) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    const parentId = replyTo?.id ?? null;
    const optimisticBody =
      text || attachmentPlaceholderBody(files.length, files.map((f) => f.name));
    const optimisticBodyJson = bodyJson && hasRichFormatting(bodyJson) ? bodyJson : null;
    const optimisticAttachments =
      files.length > 0 ? buildOptimisticAttachments(tempId, files) : undefined;

    pendingSendsRef.current.set(tempId, {
      body: text,
      bodyJson: optimisticBodyJson,
      parentId,
      files,
    });
    stickToBottomRef.current = true;
    setNewMessagesBelow(0);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        clientTempId: tempId,
        body: optimisticBody,
        bodyJson: optimisticBodyJson,
        createdAt: new Date().toISOString(),
        user: { id: userId, name: session.user.name ?? "You", image: session.user.image ?? null },
        sendStatus: "sending" as const,
        attachments: optimisticAttachments,
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
    setBodyJson(null);
    setReplyTo(null);
    setPendingFiles([]);
    if (conversation.id) sendTypingIndicator(conversation.id, false);

    onMessageSent?.(conversation.id, {
      id: tempId,
      body: optimisticBody,
      createdAt: new Date().toISOString(),
      user: { id: userId, name: session.user.name ?? "You" },
    });

    try {
      const res = await sendMessageRequest(
        conversation.id,
        text,
        parentId,
        files,
        optimisticBodyJson
      );
      const data = await res.json();

      if (res.ok) {
        pendingSendsRef.current.delete(tempId);
        setMessages((prev) => {
          const old = prev.find((m) => m.clientTempId === tempId);
          scheduleRevokeOptimisticAttachments(old?.attachments);
          return withReceipts(
            replaceSentMessage(prev, tempId, data.message as ChatMessage)
          );
        });
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

  const handleEdit = async (
    messageId: string,
    newBody: string,
    newBodyJson?: RichMessageDoc | null
  ) => {
    if (!conversation || readOnly) return;
    const res = await fetch(
      `/api/conversations/${conversation.id}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: newBody,
          bodyJson: newBodyJson && hasRichFormatting(newBodyJson) ? newBodyJson : null,
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      updateMessageInState(data.message);
      toast.success("Message updated");
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(data?.error ?? "Could not edit message");
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

  const mentionMembers = useMemo(() => {
    if (!conversation) return [];

    const byId = new Map<
      string,
      { id: string; name: string; image?: string | null; email?: string }
    >();

    for (const p of conversation.participants) {
      byId.set(p.id, {
        id: p.id,
        name: p.name,
        image: p.image ?? null,
        email: p.email,
      });
    }

    if (conversation.type === "WORKSPACE" && conversation.workspaceId) {
      const ws = workspaces.find((w) => w.id === conversation.workspaceId);
      for (const m of ws?.members ?? []) {
        if (!byId.has(m.user.id)) {
          byId.set(m.user.id, {
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
          });
        }
      }
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [conversation, workspaces]);

  const showMentions = Boolean(userId && mentionMembers.some((m) => m.id !== userId));
  const allowTagAll =
    conversation?.type === "GROUP" || conversation?.type === "WORKSPACE";

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

  const isPersonal = conversation.type === "PERSONAL";
  const isDirect = conversation.type === "DIRECT";
  const isDmStyle = isDirect || isPersonal;
  const directPeer = isDirect
    ? conversation.participants.find((p) => p.id !== userId)
    : null;

  const typingNames = [...typingUserIds]
    .map((id) => conversation.participants.find((p) => p.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const isTyping = typingNames.length > 0;

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

  const composerBar = (
    <div
      className={cn(
        "w-full min-w-0 max-w-full border-t border-[var(--border)] bg-[var(--chat-thread-bg)] px-1.5 pt-2 sm:px-2 md:px-4 md:pt-3",
        keyboardOpen ? "pb-2.5" : "pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-4",
        isMobile
          ? "fixed inset-x-0 bottom-0 z-[45] shadow-[0_-8px_24px_rgba(0,0,0,0.18)]"
          : "z-30 shrink-0"
      )}
      style={
        isMobile && keyboardOpen
          ? {
              bottom: Math.max(
                0,
                layoutHeight - visualViewport.height - visualViewport.offsetTop
              ),
            }
          : undefined
      }
    >
      {scheduledMessages.length > 0 && (
        <div className="mb-1.5 space-y-1">
          {scheduledMessages.map((item) => (
            <ScheduledMessageCard
              key={item.id}
              item={item}
              compact
              onEdit={(scheduled) => {
                setEditingScheduled(scheduled);
                setScheduleDialogOpen(true);
              }}
              onDelete={(scheduled) => void handleDeleteScheduled(scheduled)}
            />
          ))}
        </div>
      )}
      <ChatComposer
        body={body}
        bodyJson={bodyJson}
        onBodyChange={({ body: nextBody, bodyJson: nextJson }) => {
          setBody(nextBody);
          setBodyJson(nextJson);
        }}
        onSend={handleSend}
        onSchedule={readOnly ? undefined : handleScheduleOpen}
        onTyping={handleTyping}
        readOnly={readOnly}
        members={mentionMembers}
        showMentions={showMentions}
        allowTagAll={allowTagAll}
        currentUserId={userId}
        conversationId={conversation.id}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editingMessage={editingMessage}
        onCancelEdit={cancelEditMessage}
        onOpenMom={readOnly ? undefined : () => setMomModalOpen(true)}
        onSendGif={readOnly || editingMessage ? undefined : handleSendGif}
        pendingFiles={pendingFiles}
        onAddFiles={addPendingFiles}
        onRemoveFile={(file) =>
          setPendingFiles((prev) => prev.filter((f) => chatFileKey(f) !== chatFileKey(file)))
        }
      />
    </div>
  );

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
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
    <div
      className={cn(
        "grid min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden chat-thread-bg",
        isMobile ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)_auto]"
      )}
    >
      <div className="min-h-0 shrink-0">
      <div className="surface-panel relative z-20 flex w-full shrink-0 items-center gap-1.5 rounded-none border-b border-[var(--border)] px-2 py-2 sm:gap-2 sm:px-3 md:px-4 md:py-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] md:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2 pr-10 sm:pr-12">
          {isDirect && directPeer ? (
            <PresenceAvatar
              name={directPeer.name}
              image={directPeer.image}
              userId={directPeer.id}
              size="md"
            />
          ) : isPersonal ? (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 sm:h-10 sm:w-10">
              <Bookmark className="h-4 w-4 text-[var(--accent)] sm:h-5 sm:w-5" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-[var(--foreground)]">
              {conversation.name}
            </h2>
            <p
              className={cn(
                "truncate text-xs",
                isTyping
                  ? "font-medium text-[var(--accent)]"
                  : isDirect && directPeer && isUserOnline(directPeer.id)
                    ? "font-medium text-[var(--status-online)]"
                    : "text-[var(--muted)]"
              )}
            >
              {subtitle}
            </p>
          </div>
        </div>
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 sm:right-3 md:right-4">
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
        <div className="shrink-0 border-b border-[var(--card-border)] bg-amber-500/5 px-4 py-2">
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
      </div>

      <div
        className={cn(
          "relative min-h-0 overflow-hidden",
          isThreadDragging && "cursor-copy"
        )}
        {...threadDragHandlers}
      >
      {isThreadDragging && <ChatFileDropOverlay label="Drop to attach here" />}
      <div
        ref={scrollContainerRef}
        className={cn(
          "h-full min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-3 sm:px-4 md:px-5 md:py-4",
          isMobile && "max-md:pb-28"
        )}
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
          <div className="flex w-full min-w-0 max-w-full items-center justify-center px-2 py-6 sm:px-6 sm:py-10">
            <div className="box-border flex w-full max-w-sm min-w-0 flex-col items-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card)]/50 px-3 py-6 text-center sm:px-8 sm:py-10">
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
          <div className="min-w-0 max-w-full space-y-1 pb-2">
            {messages.map((msg, index) => {
              const prev = messages[index - 1];
              const next = messages[index + 1];
              const showDateDivider =
                !prev || toDateKey(prev.createdAt) !== toDateKey(msg.createdAt);
              const sameUserAsPrev =
                prev &&
                !prev.systemKind &&
                !msg.systemKind &&
                prev.user.id === msg.user.id &&
                toDateKey(prev.createdAt) === toDateKey(msg.createdAt);
              const sameUserAsNext =
                next &&
                !next.systemKind &&
                !msg.systemKind &&
                next.user.id === msg.user.id &&
                toDateKey(next.createdAt) === toDateKey(msg.createdAt);

              const compactSystemActivity = Boolean(prev?.systemKind && msg.systemKind);

              return (
                <div key={msg.id}>
                  {showDateDivider && (
                    <div className="mb-3 mt-1 flex items-center justify-center gap-3">
                      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
                      <span className="surface-panel rounded-full px-3 py-1 text-[10px] font-medium text-[var(--muted)]">
                        {formatChatDateLabel(msg.createdAt)}
                      </span>
                      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
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
                      isFirstInGroup={!sameUserAsPrev}
                      isLastInGroup={!sameUserAsNext}
                      compactSystemActivity={compactSystemActivity}
                      onJumpToMessage={(id, createdAt) => void navigateToMessage({ id, createdAt })}
                      onRetrySend={(tempId) => void handleRetrySend(tempId)}
                      onReply={(msg) => {
                        cancelEditMessage();
                        setReplyTo(msg);
                      }}
                      onForward={readOnly ? undefined : setForwardMessage}
                      onReact={handleReact}
                      onPin={handlePin}
                      onStartEdit={readOnly ? undefined : startEditMessage}
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
          className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] hover:bg-[var(--surface-hover)]"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          {newMessagesBelow === 1 ? "New message" : `${newMessagesBelow} new messages`}
        </button>
      )}
      </div>

      {!isMobile && composerBar}
    </div>

      {isMobile && menuMounted ? createPortal(composerBar, document.body) : null}

      {conversation && userId && (
        <ScheduleMessageDialog
          isOpen={scheduleDialogOpen}
          onClose={() => {
            setScheduleDialogOpen(false);
            setEditingScheduled(null);
          }}
          conversationId={conversation.id}
          parentId={replyTo?.id ?? null}
          initialBody={body}
          pendingFiles={editingScheduled ? [] : pendingFiles}
          editing={editingScheduled}
          onScheduled={handleScheduled}
        />
      )}

      {conversation && userId && (
        <MomBuilderModal
          conversation={conversation}
          workspaceId={selectedWorkspaceId ?? conversation.workspaceId ?? null}
          currentUserId={userId}
          isOpen={momModalOpen}
          onClose={() => setMomModalOpen(false)}
          onCreated={() => {
            void fetchMessages(conversation.id, { silent: true });
          }}
        />
      )}

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
          currentUserRole={conversation.currentUserRole}
          onClose={() => setGroupInfoOpen(false)}
          onUpdated={() => onConversationUpdated?.()}
        />
      )}
    </div>
  );
}
