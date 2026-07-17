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

/** Prefer a longer connect timeout for hosted DBs (Railway cold starts). */
function databaseUrlWithTimeout(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (/[?&]connect_timeout=/i.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connect_timeout=300`;
}

function createPrismaClient() {
  const datasourceUrl = databaseUrlWithTimeout();
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

  return base.$extends({
    query: {
      $allOperations({ args, query }) {
        return withPrismaRetry(() => query(args));
      },
    },
  });
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: AppPrismaClient | undefined;
};

function getPrisma(): AppPrismaClient {
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
export const prisma: AppPrismaClient = new Proxy({} as AppPrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
