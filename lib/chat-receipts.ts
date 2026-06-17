export type MessageReceiptStatus = "sent" | "delivered" | "read";

export interface ParticipantReceipt {
  userId: string;
  lastReadAt: string | null;
  lastReceivedAt: string | null;
}

function maxIsoTimestamp(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/** Merge receipt fields monotonically so out-of-order events never regress status. */
export function mergeParticipantReceipt(
  existing: ParticipantReceipt | undefined,
  incoming: {
    userId: string;
    lastReadAt?: string | null;
    lastReceivedAt?: string | null;
  }
): ParticipantReceipt {
  return {
    userId: incoming.userId,
    lastReadAt: maxIsoTimestamp(incoming.lastReadAt, existing?.lastReadAt),
    lastReceivedAt: maxIsoTimestamp(incoming.lastReceivedAt, existing?.lastReceivedAt),
  };
}

export function computeMessageReceiptStatus(
  messageCreatedAt: string,
  senderId: string,
  currentUserId: string,
  recipients: ParticipantReceipt[]
): MessageReceiptStatus | null {
  if (senderId !== currentUserId) return null;

  const others = recipients.filter((p) => p.userId !== currentUserId);
  if (others.length === 0) return "sent";

  const msgTime = new Date(messageCreatedAt).getTime();

  const allRead = others.every(
    (p) => p.lastReadAt && new Date(p.lastReadAt).getTime() >= msgTime
  );
  if (allRead) return "read";

  const allDelivered = others.every(
    (p) => p.lastReceivedAt && new Date(p.lastReceivedAt).getTime() >= msgTime
  );
  if (allDelivered) return "delivered";

  return "sent";
}

export function attachReceiptStatuses<T extends { id: string; createdAt: string; user: { id: string } }>(
  messages: T[],
  currentUserId: string,
  recipients: ParticipantReceipt[]
): (T & { receiptStatus?: MessageReceiptStatus })[] {
  return messages.map((message) => {
    const status = computeMessageReceiptStatus(
      message.createdAt,
      message.user.id,
      currentUserId,
      recipients
    );
    return status ? { ...message, receiptStatus: status } : message;
  });
}
