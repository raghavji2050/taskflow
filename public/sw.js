/* Legacy static SW — browsers should use /firebase-messaging-sw.js (FCM).
 * Kept so old registrations can soft-unregister on activate. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      try {
        await self.registration.unregister();
      } catch {
        // ignore
      }
    })()
  );
});
