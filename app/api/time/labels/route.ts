import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timeLabelCreateSchema } from "@/lib/validations";
import { createTimeEntryLabel, listTimeEntryLabels } from "@/lib/time-tracking-prefs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const labels = await listTimeEntryLabels(user.id);
    return NextResponse.json({ labels });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = timeLabelCreateSchema.parse(await request.json());
    const label = await createTimeEntryLabel(user.id, data.name, data.color);
    return NextResponse.json({ label }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
