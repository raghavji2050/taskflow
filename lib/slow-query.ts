import { logger } from "@/lib/logger";

const DEFAULT_SLOW_QUERY_MS = 500;

export function slowQueryThresholdMs(): number {
  const raw = Number(process.env.SLOW_QUERY_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SLOW_QUERY_MS;
}

/** Logs a warn line when a Prisma operation exceeds the threshold. Returns true when logged. */
export function reportQueryDuration(
  model: string | undefined,
  action: string,
  durationMs: number,
  thresholdMs: number = slowQueryThresholdMs()
): boolean {
  if (durationMs < thresholdMs) return false;
  logger.warn("slow prisma query", {
    model: model ?? "raw",
    action,
    durationMs: Math.round(durationMs),
    thresholdMs,
  });
  return true;
}
