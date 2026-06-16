import { ConversationType } from "@prisma/client";

export type MessageAudienceKind = "direct" | "group" | "team" | "personal";

export interface MessageAudienceRecipient {
  id: string;
  name: string;
}

export interface MessageAudience {
  kind: MessageAudienceKind;
  title: string;
  recipients: MessageAudienceRecipient[];
  sentToLabel: string;
}

type ConversationForAudience = {
  type: ConversationType;
  name: string | null;
  workspace?: { name: string } | null;
  participants: { user: { id: string; name: string } }[];
};

export function getMessageAudience(
  conversation: ConversationForAudience,
  senderId: string
): MessageAudience {
  const recipients = conversation.participants
    .map((p) => p.user)
    .filter((u) => u.id !== senderId);

  switch (conversation.type) {
    case ConversationType.WORKSPACE: {
      const team = conversation.workspace?.name?.trim() || "Team";
      return {
        kind: "team",
        title: team,
        recipients,
        sentToLabel: team,
      };
    }
    case ConversationType.GROUP: {
      const groupName = conversation.name?.trim() || "Group";
      return {
        kind: "group",
        title: groupName,
        recipients,
        sentToLabel: groupName,
      };
    }
    case ConversationType.PERSONAL:
      return {
        kind: "personal",
        title: "Personal notes",
        recipients: [],
        sentToLabel: "Personal notes",
      };
    case ConversationType.DIRECT:
    default: {
      const names = recipients.map((r) => r.name);
      return {
        kind: "direct",
        title: names[0] ?? "Direct message",
        recipients,
        sentToLabel: names.length > 0 ? names.join(", ") : "Direct message",
      };
    }
  }
}

export const messageAudienceKindLabel: Record<MessageAudienceKind, string> = {
  direct: "Person",
  group: "Group",
  team: "Team",
  personal: "Personal",
};

type MessageWithAudienceSource = {
  id: string;
  body: string;
  createdAt: Date;
  userId: string;
  user: { id: string; name: string };
  conversation: ConversationForAudience;
};

export function serializeLinkedMessage(message: MessageWithAudienceSource) {
  const audience = getMessageAudience(message.conversation, message.userId);
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    sender: { id: message.user.id, name: message.user.name },
    audience: {
      kind: audience.kind,
      title: audience.title,
      recipients: audience.recipients,
    },
    sentToLabel: audience.sentToLabel,
  };
}

export type SerializedLinkedMessage = ReturnType<typeof serializeLinkedMessage>;
