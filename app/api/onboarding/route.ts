import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getOnboardingState, updateOnboarding } from "@/lib/onboarding";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await getOnboardingState(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({ dismissed: z.boolean().optional(), useCase: z.enum(["personal", "team"]).nullable().optional() });

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return NextResponse.json(await updateOnboarding(user.id, parsed.data));
  } catch (error) {
    return handleApiError(error);
  }
}
