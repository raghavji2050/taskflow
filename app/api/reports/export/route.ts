import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { buildExport } from "@/lib/report-export";
import { rateLimit } from "@/lib/rate-limit";

const query = z.object({
  type: z.enum(["tasks", "time"]).default("tasks"),
  format: z.enum(["csv", "pdf"]).default("csv"),
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  range: z.enum(["today", "week", "month", "all"]).default("all"),
  tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
});

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!rateLimit(`export:${user.id}`, 30, 10 * 60_000)) return NextResponse.json({ error: "Too many exports, try again in a few minutes" }, { status: 429 });
    const sp = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = query.safeParse(sp);
    if (!parsed.success) return NextResponse.json({ error: "Invalid export options" }, { status: 400 });
    const q = parsed.data;
    const out = await buildExport(user.id, q.type, q.format, { workspaceId: q.workspaceId, projectId: q.projectId, range: q.range, tzOffsetMinutes: q.tzOffset });
    return new NextResponse(out.body as BodyInit, {
      headers: {
        "Content-Type": out.contentType,
        "Content-Disposition": `attachment; filename="${out.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Export-Rows": String(out.rows),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
