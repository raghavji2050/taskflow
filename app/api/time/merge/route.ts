import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timeMergeSchema } from "@/lib/validations";
import { mergeTimeEntries } from "@/lib/time-tracking";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = timeMergeSchema.parse(await request.json());
    const entry = await mergeTimeEntries(user.id, data.entryIds);
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handleApiError(error);
  }
}
