/* Legacy static SW — browsers should use /api/push-sw (FCM with embedded config).
 * Kept so old registrations can soft-redirect on activate. */
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
