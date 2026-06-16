const notifiedKey = "taskflow:last-notified";

function readNotifiedMap(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(notifiedKey);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeNotifiedMap(map: Record<string, number>) {
  sessionStorage.setItem(notifiedKey, JSON.stringify(map));
}

export function showBrowserNotification(
  title: string,
  options?: {
    body?: string;
    url?: string;
    conversationId?: string;
    messageId?: string;
    tag?: string;
  }
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!document.hidden) return;

  const notification = new Notification(title, {
    body: options?.body,
    icon: "/icon.svg",
    tag: options?.tag ?? options?.conversationId ?? "taskflow",
    data: {
      url: options?.url ?? "/dashboard",
      conversationId: options?.conversationId,
      messageId: options?.messageId,
    },
  });

  notification.onclick = () => {
    window.focus();
    if (options?.url) window.location.href = options.url;
    notification.close();
  };
}

export function shouldNotifyConversation(conversationId: string, minIntervalMs = 30_000) {
  const map = readNotifiedMap();
  const last = map[conversationId] ?? 0;
  if (Date.now() - last < minIntervalMs) return false;
  map[conversationId] = Date.now();
  writeNotifiedMap(map);
  return true;
}
