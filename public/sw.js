self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** @type {Map<string, { visible: boolean, at: number }>} */
const visibilityByUser = new Map();

const VISIBILITY_TTL_MS = 7_000;

self.addEventListener("message", (event) => {
  if (event.data?.type !== "taskflow:visibility") return;
  const userId = event.data.userId;
  if (!userId) return;
  visibilityByUser.set(userId, {
    visible: Boolean(event.data.visible),
    at: Date.now(),
  });
});

function isUserForeground(userId) {
  if (!userId) return false;
  const state = visibilityByUser.get(userId);
  if (!state) return false;
  if (Date.now() - state.at >= VISIBILITY_TTL_MS) return false;
  return state.visible;
}

async function shouldSuppressPush(userId) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  // No open app windows — always show push (tab was closed).
  if (clients.length === 0) return false;

  return Boolean(userId && isUserForeground(userId));
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
      const isTest = Boolean(data.test);
      if (!isTest && (await shouldSuppressPush(data.userId))) return;

      await self.registration.showNotification(data.title || "TaskFlow", {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: isTest ? "taskflow-test" : data.conversationId ? `chat-${data.conversationId}` : "taskflow",
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
  const data = event.notification.data ?? {};
  const relativeUrl =
    data.url ??
    (data.conversationId
      ? `/dashboard/messages?c=${data.conversationId}${
          data.messageId ? `#msg-${data.messageId}` : ""
        }`
      : "/dashboard/messages");
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const sameOriginClients = windowClients.filter((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      for (const client of sameOriginClients) {
        if (typeof client.navigate === "function") {
          try {
            const next = await client.navigate(targetUrl);
            if (next) {
              await next.focus();
              return;
            }
          } catch {
            // fall through to postMessage / openWindow
          }
        }
      }

      if (sameOriginClients.length > 0) {
        const client = sameOriginClients[0];
        await client.focus();
        client.postMessage({
          type: "taskflow:notification-open",
          url: relativeUrl,
          conversationId: data.conversationId,
          messageId: data.messageId,
        });
        return;
      }

      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});
