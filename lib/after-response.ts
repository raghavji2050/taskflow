import { after } from "next/server";

/**
 * Run work after the HTTP response without dropping it on serverless.
 * Uses Next.js `after()` (Vercel waitUntil). Outside a request (cron/scripts),
 * runs the task inline so it still completes.
 */
export async function afterResponse(task: () => Promise<unknown>): Promise<void> {
  try {
    after(async () => {
      try {
        await task();
      } catch (error) {
        console.warn("[afterResponse] task failed:", error);
      }
    });
  } catch {
    try {
      await task();
    } catch (error) {
      console.warn("[afterResponse] task failed:", error);
    }
  }
}
