import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

function getPrivateKey(): string | null {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return null;
  // Vercel / .env often store newlines as \n
  return raw.replace(/\\n/g, "\n");
}

export function isFirebaseAdminConfigured(): boolean {
  return !!(
    (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    getPrivateKey()
  );
}

export function getFirebaseAdminApp(): App | null {
  if (!isFirebaseAdminConfigured()) return null;

  const existing = getApps()[0];
  if (existing) return existing;

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = getPrivateKey()!;

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

export function getFirebaseMessaging(): Messaging | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getMessaging(app);
}
