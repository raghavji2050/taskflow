import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { InviteLinkError } from "@/lib/invite-links";

export function inviteLinkErrorResponse(error: unknown) {
  if (error instanceof InviteLinkError) return NextResponse.json({ error: error.message }, { status: error.status });
  return handleApiError(error);
}
