import { NextResponse } from "next/server";
import { getEnabledOAuthProviders } from "@/lib/oauth";

/** OAuth availability for UI — do not use /api/auth/providers (reserved by NextAuth). */
export async function GET() {
  const providers = getEnabledOAuthProviders();
  return NextResponse.json({
    google: providers.includes("google"),
    github: providers.includes("github"),
    providers,
  });
}
