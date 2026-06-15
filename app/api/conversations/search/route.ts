import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { searchMessagesGlobal } from "@/lib/messages";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchMessagesGlobal(user.id, q);
    return NextResponse.json({ results });
  } catch (error) {
    return handleApiError(error);
  }
}
