import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError, jsonError } from "@/lib/api";
import { searchGifs } from "@/lib/giphy";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);

    if (!q) {
      return NextResponse.json({ gifs: [], offset: 0, total: 0 });
    }

    const result = await searchGifs(q, offset);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Giphy is not configured") {
      return jsonError(error.message, 503);
    }
    if (
      error instanceof Error &&
      (error.message === "Too many requests" ||
        error.message.startsWith("Too many requests.") ||
        error.message.startsWith("Giphy rate limit"))
    ) {
      return jsonError(error.message, 429);
    }
    return handleApiError(error);
  }
}
