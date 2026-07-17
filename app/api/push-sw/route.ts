import { getFirebaseWebConfig } from "@/lib/firebase-config";

/**
 * Dynamically served service worker with Firebase config embedded so
 * messaging initializes synchronously (required for getToken + background push).
 *
 * Background OS alerts come from the FCM `notification` payload (auto-displayed).
 * This file wires messaging + notification click handling.
 */
export async function GET() {
  const config = getFirebaseWebConfig();
  if (!config) {
    return new Response("// Firebase web config missing\n", {
      status: 503,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Service-Worker-Allowed": "/",
        "Cache-Control": "no-store",
      },
    });
  }

  const configJson = JSON.stringify(config);

  const script = `/* TaskFlow FCM service worker (generated) */
importScripts(
  "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js"
);

firebase.initializeApp(${configJson});
firebase.messaging();

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const data = event.notification.data || {};
  const isReply = event.action === "reply";
  const relativeUrl = isReply
    ? data.conversationId
      ? "/dashboard/messages?c=" + data.conversationId
      : "/dashboard/messages"
    : data.url ||
      (data.conversationId
        ? "/dashboard/messages?c=" +
          data.conversationId +
          (data.messageId ? "#msg-" + data.messageId : "")
        : "/dashboard/messages");
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    (async function () {
      const windowClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const sameOriginClients = windowClients.filter(function (client) {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch (e) {
          return false;
        }
      });

      for (let i = 0; i < sameOriginClients.length; i++) {
        const client = sameOriginClients[i];
        if (typeof client.navigate === "function") {
          try {
            const next = await client.navigate(targetUrl);
            if (next) {
              await next.focus();
              return;
            }
          } catch (e) {}
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
`;

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
