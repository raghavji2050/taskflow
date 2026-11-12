import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { AttachmentError } from "@/lib/task-attachments-data";

export function attachmentErrorResponse(error: unknown) {
  if (error instanceof AttachmentError) return NextResponse.json({ error: error.message }, { status: error.status });
  return handleApiError(error);
}
