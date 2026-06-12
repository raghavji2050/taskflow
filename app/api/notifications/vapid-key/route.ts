import { NextResponse } from "next/server";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";

export async function GET() {
  const publicKey = getVapidPublicKey();
  return NextResponse.json({
    publicKey,
    configured: isPushConfigured(),
  });
}
