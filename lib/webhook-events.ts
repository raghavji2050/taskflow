/** Client-safe list of webhook event names. */
export const WEBHOOK_EVENTS = ["task.created", "task.updated", "task.completed", "task.deleted"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | "ping";
