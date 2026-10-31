import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrCreateRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_TIMEOUT_MS = 3000;

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const started = performance.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("db health timeout")), DB_TIMEOUT_MS)),
    ]);
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    logger.error("health check database failed", { error, latencyMs });
    return { ok: false, latencyMs };
  }
}

/** Public liveness + DB readiness probe for uptime monitors. Exposes no user data. */
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request.headers);
  const db = await checkDatabase();
  const status = db.ok ? "ok" : "degraded";
  const body = {
    status,
    db,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    region: process.env.VERCEL_REGION ?? null,
    time: new Date().toISOString(),
    requestId,
  };
  return NextResponse.json(body, {
    status: db.ok ? 200 : 503,
    headers: { "cache-control": "no-store", [REQUEST_ID_HEADER]: requestId },
  });
}
