/**
 * Minimal structured logger: one JSON line per event so Vercel log search
 * and drains can filter by level, requestId, route, or durationMs.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown>;

function minLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw in LEVEL_ORDER) return raw as LogLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

export function formatLogLine(level: LogLevel, message: string, fields: LogFields = {}): string {
  const entry: LogFields = { level, msg: message, time: new Date().toISOString() };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    entry[key] = key === "error" || key === "err" ? serializeError(value) : value;
  }
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({ level, msg: message, time: entry.time, note: "unserializable fields" });
  }
}

export function log(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;
  const line = formatLogLine(level, message, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => log("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => log("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => log("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => log("error", msg, fields),
  child(base: LogFields) {
    return {
      debug: (msg: string, fields?: LogFields) => log("debug", msg, { ...base, ...fields }),
      info: (msg: string, fields?: LogFields) => log("info", msg, { ...base, ...fields }),
      warn: (msg: string, fields?: LogFields) => log("warn", msg, { ...base, ...fields }),
      error: (msg: string, fields?: LogFields) => log("error", msg, { ...base, ...fields }),
    };
  },
};
