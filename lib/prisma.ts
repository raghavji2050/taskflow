import { PrismaClient, Prisma } from "@prisma/client";

/**
 * One extra attempt after a dropped connection. A longer chain (and any retry
 * of a timeout that already blocked) turns a single slow query into a multi-second stall.
 */
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 200;
/** Seconds. Caps the old 300s default so a new handshake cannot park a request. */
const CONNECT_TIMEOUT_SECONDS = 10;
const POOL_TIMEOUT_SECONDS = 10;
const CONNECTION_LIMIT = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_CODES = new Set(["P1001", "P1017"]);

/**
 * Retry dropped connections only. Operation timeouts (P1008), connect timeouts
 * (P1002), and pool timeouts (P2024) have already waited — retrying them stacks
 * that wait onto an ordinary request.
 */
export function isRetryablePrismaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_CODES.has(error.code);
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /can'?t reach database|connection (reset|refused|lost)|server has gone away|econnreset|econnrefused|socket hang up/i.test(
    message
  );
}

export async function withPrismaRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES || !isRetryablePrismaError(error)) {
        throw error;
      }
      console.warn(
        `[prisma] connection error — retry ${attempt + 1}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`,
        error instanceof Error ? error.message : error
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

function upsertQueryParam(
  url: string,
  key: string,
  value: string,
  mode: "set-if-missing" | "cap"
): string {
  const pattern = new RegExp(`([?&])${key}=([^&]*)`, "i");
  const match = url.match(pattern);
  if (!match) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}${key}=${value}`;
  }
  if (mode === "set-if-missing") return url;
  const current = Number(match[2]);
  if (Number.isFinite(current) && current <= Number(value)) return url;
  return url.replace(pattern, `$1${key}=${value}`);
}

/**
 * Short connect/pool timeouts and a small pool. Explicit connection_limit is kept.
 * A connect_timeout above 10s (including the old 300s example) is capped.
 */
export function databaseUrlWithPoolDefaults(url: string): string {
  let next = upsertQueryParam(url, "connect_timeout", String(CONNECT_TIMEOUT_SECONDS), "cap");
  next = upsertQueryParam(next, "connection_limit", String(CONNECTION_LIMIT), "set-if-missing");
  next = upsertQueryParam(next, "pool_timeout", String(POOL_TIMEOUT_SECONDS), "cap");
  return next;
}

function databaseUrlWithTimeout(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  return databaseUrlWithPoolDefaults(url);
}

function createPrismaClient(): PrismaClient {
  const datasourceUrl = databaseUrlWithTimeout();
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

  // Use $use (not $extends) so the client stays typed as PrismaClient and
  // $transaction callbacks remain compatible with Prisma.TransactionClient.
  client.$use(async (params, next) => withPrismaRetry(() => next(params)));

  return client;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function clientHasCurrentModels(client: PrismaClient): boolean {
  return "document" in client && "documentAttachment" in client && "scheduledMessage" in client;
}

function getPrisma(): PrismaClient {
  if (process.env.NEXT_RUNTIME === "edge") {
    throw new Error(
      "Prisma Client cannot run in the Edge Runtime. Use Node.js route handlers instead."
    );
  }

  const existing = globalForPrisma.prisma;
  if (existing && clientHasCurrentModels(existing)) {
    return existing;
  }

  const client = createPrismaClient();
  // Cache in every environment. The exported client is a proxy, so without this
  // assignment production builds a new pool on every property access.
  globalForPrisma.prisma = client;
  if (existing) {
    void existing.$disconnect().catch(() => {});
  }
  return client;
}

/**
 * Lazy proxy so importing this module in Edge-safe graphs does not construct
 * PrismaClient until a property is actually accessed (Node routes only).
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
