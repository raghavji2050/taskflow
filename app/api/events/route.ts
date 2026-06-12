import { auth } from "@/lib/auth";
import { getUserWorkspaceIds } from "@/lib/workspace";
import { realtimeHub } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const workspaceIds = await getUserWorkspaceIds(userId);
  const connectionId = crypto.randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          realtimeHub.unsubscribe(connectionId);
        }
      };

      realtimeHub.subscribe(connectionId, {
        userId,
        workspaceIds,
        send,
      });

      send({ type: "connected", userId });

      const heartbeat = setInterval(() => {
        send({ type: "heartbeat", at: new Date().toISOString() });
      }, 25000);

      const cleanup = () => {
        clearInterval(heartbeat);
        realtimeHub.unsubscribe(connectionId);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
