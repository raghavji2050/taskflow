import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { fetchLinkPreview } from "@/lib/link-preview";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!rateLimit(`link-preview:${user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const urlParam = new URL(request.url).searchParams.get("url")?.trim();
    if (!urlParam) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    const preview = await fetchLinkPreview(urlParam);
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Invalid URL") {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message === "Could not fetch") {
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
    }
    return handleApiError(error);
  }
}
