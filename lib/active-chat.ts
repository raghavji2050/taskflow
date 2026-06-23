import { clearChatNotificationCount } from "@/lib/chat-push-notification";

let activeConversationId: string | null = null;

export function setActiveConversationId(id: string | null) {
  activeConversationId = id;
  if (id) clearChatNotificationCount(id);
}

export function getActiveConversationId() {
  return activeConversationId;
}
