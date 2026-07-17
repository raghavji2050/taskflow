/* TaskFlow service worker — FCM background push + notification click handling */

importScripts(
  "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js"
);

let messagingReady = null;

function ensureFirebaseMessaging() {
  if (messagingReady) return messagingReady;

  messagingReady = (async () => {
    const res = await fetch("/api/notifications/firebase-config");
    if (!res.ok) throw new Error("Firebase config unavailable");
    const config = await res.json();
    if (!config?.apiKey || !config?.projectId) {
      throw new Error("Firebase not configured");
    }

    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      });
    }

    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const data = payload.data || {};
      const title = data.title || payload.notification?.title || "TaskFlow";
      const body =
        (data.body && String(data.body).trim()) ||
        payload.notification?.body ||
        "New message";
      const isTest = data.test === "true" || data.test === true;
      const icon = (data.icon && String(data.icon)) || "/icon-192.png";
      const canReply = !isTest && Boolean(data.conversationId);

      return self.registration.showNotification(title, {
        body,
        icon,
        badge: "/badge-96.png",
        tag: isTest
          ? "taskflow-test"
          : data.conversationId
            ? `chat-${data.conversationId}`
            : "taskflow",
        renotify: true,
        requireInteraction: false,
        silent: false,
        actions: canReply ? [{ action: "reply", title: "Reply" }] : [],
        data: {
          url: data.url || "/dashboard",
          conversationId: data.conversationId,
          messageId: data.messageId,
        },
      });
    });

    return messaging;
  })().catch((error) => {
    messagingReady = null;
    console.warn("[sw] Firebase messaging init failed:", error);
    throw error;
  });

  return messagingReady;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      try {
        await ensureFirebaseMessaging();
      } catch {
        // Config may be missing during local setup; getToken will fail until configured.
      }
    })()
  );
});

// Client can push config after register so messaging is ready before the first FCM message.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "taskflow:firebase-config") return;
  event.waitUntil(ensureFirebaseMessaging().catch(() => {}));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};

  // Web push can't do inline text reply, so "Reply" opens the conversation at
  // the composer (no #msg jump) so the user can type straight away.
  const isReply = event.action === "reply";
  const relativeUrl = isReply
    ? data.conversationId
      ? `/dashboard/messages?c=${data.conversationId}`
      : "/dashboard/messages"
    : data.url ??
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
