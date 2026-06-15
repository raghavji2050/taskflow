self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function shouldSuppressPush(data) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  if (data.conversationId) {
    const marker = `c=${data.conversationId}`;
    return clients.some(
      (client) => client.visibilityState === "visible" && client.url.includes(marker)
    );
  }

  return clients.some((client) => client.visibilityState === "visible");
}

self.addEventListener("push", (event) => {
  let data = { title: "TaskFlow", body: "You have a notification", url: "/dashboard" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // use defaults
  }

  event.waitUntil(
    (async () => {
      if (await shouldSuppressPush(data)) return;

      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: data.conversationId ? `chat-${data.conversationId}` : "taskflow",
        renotify: true,
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
