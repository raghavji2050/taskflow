export type MessageReceiptStatus = "sent" | "delivered" | "read";

export interface ParticipantReceipt {
  userId: string;
  lastReadAt: string | null;
  lastReceivedAt: string | null;
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
