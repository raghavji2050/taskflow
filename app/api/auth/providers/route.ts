import { NextResponse } from "next/server";
import { getEnabledOAuthProviders } from "@/lib/oauth";

export async function GET() {
  const providers = getEnabledOAuthProviders();
  return NextResponse.json({
    google: providers.includes("google"),
    github: providers.includes("github"),
    providers,
  });
}
