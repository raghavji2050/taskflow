import webpush from "web-push";

export function getVapidPublicKey(): string | null {
  return (
    process.env.VAPID_PUBLIC_KEY ??
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
    null
  );
}

export function isPushConfigured(): boolean {
  return !!(getVapidPublicKey() && process.env.VAPID_PRIVATE_KEY);
}

export function configureWebPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@taskflow.app",
    publicKey,
    privateKey
  );
  return true;
}

export async function sendPushToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url?: string }
) {
  if (!configureWebPush()) {
    throw new Error("Push notifications are not configured on the server");
  }

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload)
  );
}
