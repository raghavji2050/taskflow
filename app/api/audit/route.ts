import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { AuditAccessError, listAuditLog } from "@/lib/audit";
import { auditCsv } from "@/lib/audit-labels";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const sp = new URL(request.url).searchParams;
    const csv = sp.get("format") === "csv";
    const result = await listAuditLog(user.id, {
      workspaceId: sp.get("workspaceId"),
      category: sp.get("category"),
      actorId: sp.get("actorId"),
      before: sp.get("before"),
      limit: csv ? 500 : Number(sp.get("limit") ?? 50) || 50,
    });
    if (csv) {
      const body = auditCsv(result.entries.map((e) => ({ createdAt: e.createdAt, actor: e.actor ? `${e.actor.name} <${e.actor.email}>` : null, action: e.action, targetType: e.targetType, targetLabel: e.targetLabel, details: e.details, ip: e.ip })));
      return new Response(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="taskflow-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuditAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return handleApiError(error);
  }
}
