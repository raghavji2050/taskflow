import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { GoalError } from "@/lib/goals-data";
import { ProjectError } from "@/lib/project-sections";

export function goalErrorResponse(error: unknown) {
  if (error instanceof GoalError || error instanceof ProjectError) {
    return NextResponse.json({ error: error.message }, { status: (error as { status?: number }).status ?? 400 });
  }
  return handleApiError(error);
}

const status = z.enum(["ON_TRACK", "AT_RISK", "OFF_TRACK", "ACHIEVED"]);
export const goalInputSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  ownerId: z.string().max(191).nullable().optional(),
  parentId: z.string().max(191).nullable().optional(),
  dueDate: z.string().max(40).nullable().optional(),
  startDate: z.string().max(40).nullable().optional(),
  statusOverride: status.nullable().optional(),
  manualProgress: z.number().int().min(0).max(100).nullable().optional(),
  closed: z.boolean().optional(),
});
