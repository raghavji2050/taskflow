self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** @type {Map<string, { visible: boolean, at: number }>} */
const visibilityByUser = new Map();

const VISIBILITY_TTL_MS = 10_000;

self.addEventListener("message", (event) => {
  if (event.data?.type !== "taskflow:visibility") return;
  const userId = event.data.userId;
  if (!userId) return;
  if (!event.data.visible) {
    visibilityByUser.delete(userId);
    return;
  }
  visibilityByUser.set(userId, {
    visible: true,
    at: Date.now(),
  });
});

function isUserForeground(userId) {
  if (!userId) return false;
  const state = visibilityByUser.get(userId);
  if (!state) return false;
  return state.visible && Date.now() - state.at < VISIBILITY_TTL_MS;
}

async function shouldSuppressPush(userId) {
  if (userId && isUserForeground(userId)) return true;

  if (!userId) {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    return clients.some((client) => client.visibilityState === "visible");
  }

  return false;
}

self.addEventListener("push", (event) => {
  let data = { title: "TaskFlow", body: "New message", url: "/dashboard" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // use defaults
  }

  const body = (data.body && String(data.body).trim()) || "New message";

  event.waitUntil(
    (async () => {
      if (await shouldSuppressPush(data.userId)) return;

      await self.registration.showNotification(data.title || "TaskFlow", {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: data.conversationId ? `chat-${data.conversationId}` : "taskflow",
        renotify: true,
        requireInteraction: false,
        silent: false,
        data: {
          url: data.url ?? "/dashboard",
          conversationId: data.conversationId,
          messageId: data.messageId,
        },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";
  const absolute = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === absolute && "focus" in client) return client.focus();
      }
      for (const client of clients) {
        if (client.url.includes("/dashboard") && "navigate" in client) {
          return client.navigate(absolute).then((c) => c?.focus());
        }
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(absolute);
    })
  );
});
