"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Bookmark, ChevronDown, Hash, LogOut, MessageCircle, MessageSquarePlus, MoreHorizontal, Search, Trash2, Users } from "lucide-react";
import { PresenceAvatar } from "@/components/chat/PresenceAvatar";
import { useRealtime } from "@/components/RealtimeProvider";
import { formatConversationListTime } from "@/lib/chat-dates";
import { cn } from "@/lib/utils";
import type { ChatConversation } from "@/components/chat/ChatThread";

export interface ConversationListItem extends ChatConversation {
  lastMessage?: {
    id: string;
    body: string;
    createdAt: string;
    user: { id: string; name: string };
  } | null;
  unreadCount: number;
  canPost: boolean;
  archivedAt?: string | null;
  updatedAt?: string;
}

interface ConversationListProps {
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  onNewDm?: () => void;
  onNewGroup?: () => void;
  onSearch?: () => void;
  onDelete?: (conversationId: string, type: string) => void | Promise<void>;
}

type SectionKey = "personal" | "team" | "groups" | "direct";

const SECTION_STORAGE_KEY = "taskflow:chat-sections";

const defaultCollapsed: Record<SectionKey, boolean> = {
  personal: false,
  team: false,
  groups: false,
  direct: false,
};

function loadCollapsedSections(): Record<SectionKey, boolean> {
  if (typeof window === "undefined") return defaultCollapsed;
  try {
    const raw = localStorage.getItem(SECTION_STORAGE_KEY);
    if (!raw) return defaultCollapsed;
    return { ...defaultCollapsed, ...JSON.parse(raw) };
  } catch {
    return defaultCollapsed;
  }
}

function sectionKeyForType(type: ConversationListItem["type"]): SectionKey {
  if (type === "PERSONAL") return "personal";
  if (type === "WORKSPACE") return "team";
  if (type === "GROUP") return "groups";
  return "direct";
}

function formatLastMessagePreview(
  lastMessage: NonNullable<ConversationListItem["lastMessage"]>,
  currentUserId?: string,
  convType?: string
) {
  const isOwn = lastMessage.user.id === currentUserId;
  if (convType === "DIRECT") {
    return isOwn ? `You: ${lastMessage.body}` : lastMessage.body;
  }
  if (convType === "PERSONAL") {
    return lastMessage.body;
  }
  return isOwn ? `You: ${lastMessage.body}` : `${lastMessage.user.name}: ${lastMessage.body}`;
}

function ConversationRow({
  conv,
  selectedId,
  onSelect,
  currentUserId,
  onDelete,
}: {
  conv: ConversationListItem;
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserId?: string;
  onDelete?: (conversationId: string, type: string) => void | Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const { countOnline } = useRealtime();
  const isPersonal = conv.type === "PERSONAL";
  const isDirect = conv.type === "DIRECT";
  const peer = isDirect
    ? conv.participants.find((p) => p.id !== currentUserId)
    : null;
  const onlineCount = countOnline(
    conv.participants.map((p) => p.id),
    currentUserId
  );
  const lastActivityAt = conv.lastMessage?.createdAt;
  const listTime = lastActivityAt ? formatConversationListTime(lastActivityAt) : null;

  useLayoutEffect(() => {
    if (!menuOpen || !menuButtonRef.current) return;
    const rect = menuButtonRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - 176),
    });
  }, [menuOpen]);

  const canRemove =
    !isPersonal &&
    conv.type !== "WORKSPACE" &&
    (conv.type === "DIRECT" || conv.type === "GROUP") &&
    Boolean(onDelete);
  const showMenu = canRemove;

  return (
    <div
      className={cn(
        "group relative flex items-stretch rounded-lg",
        selectedId === conv.id
          ? "bg-[var(--accent)]/10"
          : "hover:bg-[var(--surface-hover)]"
      )}
    >
    <button
      type="button"
      onClick={() => onSelect(conv.id)}
      className={cn(
        "flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2 text-left transition-colors",
        selectedId === conv.id
          ? "text-[var(--accent)]"
          : "text-[var(--foreground)]"
      )}
    >
      {isDirect && peer ? (
        <PresenceAvatar
          name={peer.name}
          image={peer.image}
          userId={peer.id}
          size="sm"
        />
      ) : isPersonal ? (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10">
          <Bookmark className="h-4 w-4 text-[var(--accent)]" />
        </div>
      ) : (
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)]">
          {conv.type === "WORKSPACE" ? (
            <Hash className="h-4 w-4 text-[var(--muted)]" />
          ) : (
            <Users className="h-4 w-4 text-[var(--muted)]" />
          )}
          {onlineCount > 0 && (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[var(--card)] bg-emerald-500 px-0.5 text-[9px] font-bold text-white"
              title={`${onlineCount} online`}
            >
              {onlineCount > 9 ? "9+" : onlineCount}
            </span>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{conv.name}</span>
          {listTime && (
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">
              {listTime}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          {conv.lastMessage ? (
            <p className="min-w-0 truncate text-xs text-[var(--muted)]">
              {formatLastMessagePreview(conv.lastMessage, currentUserId, conv.type)}
            </p>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
        </div>
      </div>
    </button>

    {showMenu && (
      <>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className={cn(
            "mr-1 flex h-8 w-8 shrink-0 self-center items-center justify-center rounded-md text-[var(--muted)] transition-opacity hover:bg-[var(--card)] hover:text-[var(--foreground)]",
            menuOpen ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
          )}
          aria-label="Conversation options"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-[200]"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <div
              className="fixed z-[201] min-w-[11rem] rounded-lg border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {canRemove && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void onDelete(conv.id, conv.type);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-500 hover:bg-red-500/10"
                >
                  {conv.type === "DIRECT" ? (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete conversation
                    </>
                  ) : (
                    <>
                      <LogOut className="h-3.5 w-3.5" />
                      Leave group
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </>
    )}
    </div>
  );
}

function Section({
  sectionKey,
  title,
  icon: Icon,
  items,
  selectedId,
  onSelect,
  currentUserId,
  onDelete,
  collapsed,
  onToggle,
}: {
  sectionKey: SectionKey;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserId?: string;
  onDelete?: (conversationId: string, type: string) => void | Promise<void>;
  collapsed: boolean;
  onToggle: (key: SectionKey) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="mb-1 flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
        aria-expanded={!collapsed}
      >
        <ChevronDown
          className={cn("h-3 w-3 shrink-0 transition-transform", collapsed && "-rotate-90")}
        />
        <Icon className="h-3 w-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
      {!collapsed && (
        <ul className="space-y-0.5">
          {items.map((conv) => (
            <li key={conv.id}>
              <ConversationRow
                conv={conv}
                selectedId={selectedId}
                onSelect={onSelect}
                currentUserId={currentUserId}
                onDelete={onDelete}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  loading,
  onNewDm,
  onNewGroup,
  onSearch,
  onDelete,
}: ConversationListProps) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const personal = conversations.filter((c) => c.type === "PERSONAL");
  const workspace = conversations.filter((c) => c.type === "WORKSPACE");
  const groups = conversations.filter((c) => c.type === "GROUP");
  const direct = conversations.filter((c) => c.type === "DIRECT");
  const [collapsedSections, setCollapsedSections] = useState(defaultCollapsed);

  useEffect(() => {
    setCollapsedSections(loadCollapsedSections());
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const selected = conversations.find((c) => c.id === selectedId);
    if (!selected) return;
    const key = sectionKeyForType(selected.type);
    setCollapsedSections((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev, [key]: false };
      localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [selectedId, conversations]);

  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--card)] md:border-r md:border-[var(--card-border)]">
      <div className="shrink-0 border-b border-[var(--card-border)] px-4 py-3 md:px-5 md:py-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Messages</h2>
          <div className="flex items-center gap-1">
            {onSearch && (
              <button
                type="button"
                onClick={onSearch}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] md:hidden"
                aria-label="Search messages"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
            {(onNewGroup || onNewDm) && (
              <div className="flex items-center gap-0.5 md:hidden">
                {onNewGroup && (
                  <button
                    type="button"
                    onClick={onNewGroup}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                    aria-label="New group"
                  >
                    <Users className="h-4 w-4" />
                  </button>
                )}
                {onNewDm && (
                  <button
                    type="button"
                    onClick={onNewDm}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--accent)] hover:bg-[var(--accent)]/10"
                    aria-label="New message"
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 md:px-3">
        {loading && (
          <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">Loading…</p>
        )}
        {!loading && conversations.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">
            No conversations yet. Start a new chat!
          </p>
        )}
        <Section sectionKey="personal" title="Personal" icon={Bookmark} items={personal} selectedId={selectedId} onSelect={onSelect} currentUserId={currentUserId} onDelete={onDelete} collapsed={collapsedSections.personal} onToggle={toggleSection} />
        <Section sectionKey="team" title="Team" icon={Hash} items={workspace} selectedId={selectedId} onSelect={onSelect} currentUserId={currentUserId} onDelete={onDelete} collapsed={collapsedSections.team} onToggle={toggleSection} />
        <Section sectionKey="groups" title="Groups" icon={Users} items={groups} selectedId={selectedId} onSelect={onSelect} currentUserId={currentUserId} onDelete={onDelete} collapsed={collapsedSections.groups} onToggle={toggleSection} />
        <Section sectionKey="direct" title="Direct" icon={MessageCircle} items={direct} selectedId={selectedId} onSelect={onSelect} currentUserId={currentUserId} onDelete={onDelete} collapsed={collapsedSections.direct} onToggle={toggleSection} />
      </div>
    </div>
  );
}
