export function countOnlineMembers(
  participantIds: string[],
  isUserOnline: (userId: string) => boolean,
  excludeUserId?: string
) {
  return participantIds.filter(
    (id) => id !== excludeUserId && isUserOnline(id)
  ).length;
}

export function formatLastSeen(lastSeenAt: string | Date | null | undefined): string | null {
  if (!lastSeenAt) return null;
  const date = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "last seen just now";
  if (diffMs < 60 * 60_000) {
    const mins = Math.floor(diffMs / 60_000);
    return `last seen ${mins}m ago`;
  }
  if (diffMs < 24 * 60 * 60_000) {
    const hrs = Math.floor(diffMs / (60 * 60_000));
    return `last seen ${hrs}h ago`;
  }
  return `last seen ${date.toLocaleDateString()}`;
}

export function formatPresenceSubtitle(options: {
  type: string;
  participantIds: string[];
  isUserOnline: (userId: string) => boolean;
  currentUserId?: string;
  peerEmail?: string;
  peerLastSeen?: string | null;
  typingNames?: string[];
}) {
  const { type, participantIds, isUserOnline, currentUserId, peerEmail, peerLastSeen, typingNames } =
    options;

  if (typingNames && typingNames.length > 0) {
    if (typingNames.length === 1) return `${typingNames[0]} is typing…`;
    return `${typingNames.length} people are typing…`;
  }

  const others = participantIds.filter((id) => id !== currentUserId);
  const onlineCount = countOnlineMembers(participantIds, isUserOnline, currentUserId);

  if (type === "DIRECT") {
    const peerId = others[0];
    if (peerId && isUserOnline(peerId)) return "Online";
    const lastSeen = formatLastSeen(peerLastSeen);
    if (lastSeen) return lastSeen;
    return peerEmail ?? "";
  }

  if (type === "PERSONAL") {
    return "Only you can see these messages";
  }

  const memberLabel = `${participantIds.length} member${participantIds.length === 1 ? "" : "s"}`;
  if (type === "WORKSPACE") {
    return `Team channel · ${memberLabel} · ${onlineCount} online`;
  }

  return `${memberLabel} · ${onlineCount} online`;
}
