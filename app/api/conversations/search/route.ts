import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { listRecentMessagesGlobal, searchMessagesGlobal } from "@/lib/messages";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const recent = searchParams.get("recent") === "true";

    if (q.length < 2) {
      if (recent) {
        const results = await listRecentMessagesGlobal(user.id);
        return NextResponse.json({ results });
      }
      return NextResponse.json({ results: [] });
    }

    const results = await searchMessagesGlobal(user.id, q);
    return NextResponse.json({ results });
  } catch (error) {
    return handleApiError(error);
  }
}
