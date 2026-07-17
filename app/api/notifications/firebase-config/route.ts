import { NextResponse } from "next/server";
import { getFirebaseWebConfig, isFirebaseWebConfigured } from "@/lib/firebase-config";

/** Public Firebase web config for the service worker (safe to expose). */
export async function GET() {
  const config = getFirebaseWebConfig();
  return NextResponse.json({
    configured: isFirebaseWebConfigured(),
    ...(config ?? {}),
  });
}
