"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";
import {
  getFirebaseWebConfig,
  getFirebaseWebVapidKey,
  isFirebaseWebConfigured,
} from "@/lib/firebase-config";

export { isFirebaseWebConfigured, getFirebaseWebVapidKey };

let app: FirebaseApp | null = null;
let messagingPromise: Promise<Messaging | null> | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  const config = getFirebaseWebConfig();
  if (!config) return null;

  if (!app) {
    app = getApps()[0] ?? initializeApp(config);
  }
  return app;
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!getFirebaseApp()) return null;

  if (!messagingPromise) {
    messagingPromise = (async () => {
      if (!(await isSupported())) return null;
      const firebaseApp = getFirebaseApp();
      if (!firebaseApp) return null;
      return getMessaging(firebaseApp);
    })();
  }

  return messagingPromise;
}
