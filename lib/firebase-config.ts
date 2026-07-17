export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
};

export function getFirebaseWebConfig(): FirebaseWebConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !messagingSenderId || !appId) {
    return null;
  }

  return { apiKey, authDomain, projectId, messagingSenderId, appId };
}

export function getFirebaseWebVapidKey(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() || null;
}

/** True when browser FCM client env is present (does not require Admin credentials). */
export function isFirebaseWebConfigured(): boolean {
  return !!(getFirebaseWebConfig() && getFirebaseWebVapidKey());
}
