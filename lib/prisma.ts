import { PrismaClient, Prisma } from "@prisma/client";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Transient connection failures common on Railway free (sleep / cold start / dropped TCP). */
function isRetryablePrismaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(error.code);
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
  return /can'?t reach database|connection (timed out|reset|refused|lost)|server has gone away|econnreset|etimedout|econnrefused|socket hang up|too many connections/i.test(
    message
  );
}

async function withPrismaRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES || !isRetryablePrismaError(error)) {
        throw error;
      }
      const delay = BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `[prisma] connection error — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`,
        error instanceof Error ? error.message : error
      );
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Prefer a longer connect timeout and a small pool for hosted DBs. */
function databaseUrlWithTimeout(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;

  const params: string[] = [];
  if (!/[?&]connect_timeout=/i.test(url)) params.push("connect_timeout=300");
  // Default Prisma pool is ~num_cpus*2+1; that exhausts small VPS max_connections.
  if (!/[?&]connection_limit=/i.test(url)) params.push("connection_limit=5");
  if (!/[?&]pool_timeout=/i.test(url)) params.push("pool_timeout=20");
  if (params.length === 0) return url;

  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${params.join("&")}`;
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

function getPrisma(): PrismaClient {
  if (process.env.NEXT_RUNTIME === "edge") {
    throw new Error(
      "Prisma Client cannot run in the Edge Runtime. Use Node.js route handlers instead."
    );
  }

  const existing = globalForPrisma.prisma;
  if (
    existing &&
    "document" in existing &&
    "documentAttachment" in existing &&
    "scheduledMessage" in existing
  ) {
    return existing;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
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
