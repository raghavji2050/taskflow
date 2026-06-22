export type ScheduledMessageStatus = "PENDING" | "SENT" | "CANCELLED";

export interface ScheduledMessageAttachmentClient {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface ScheduledMessageClient {
  id: string;
  body: string;
  userId: string;
  conversationId: string;
  parentId: string | null;
  scheduledFor: string;
  timezone: string;
  status: ScheduledMessageStatus;
  sentAt: string | null;
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: ScheduledMessageAttachmentClient[];
  conversationTitle?: string;
  conversationType?: string;
}

export interface QuickSchedulePreset {
  id: string;
  label: string;
  scheduledFor: Date;
}
