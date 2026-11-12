import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { globalSearch } from "@/lib/global-search-data";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "6");
    const result = await globalSearch(user.id, searchParams.get("q") ?? "", { limit: Number.isFinite(limit) ? limit : 6 });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
