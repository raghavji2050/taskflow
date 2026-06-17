import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { getToken } from "next-auth/jwt";
import { realtimeHub, setConversationTyping } from "./lib/realtime";
import { getUserWorkspaceIds } from "./lib/workspace";
import { getConversationParticipantIds } from "./lib/chat-access";
import { prisma } from "./lib/prisma";
import { isPusherConfigured } from "./lib/pusher-server";

const dev = process.env.NODE_ENV !== "production";
// Windows sets HOSTNAME to the machine name — use HOST for the bind URL instead.
const hostname = process.env.HOST ?? "localhost";
const port = parseInt(process.env.PORT ?? "3000", 10);
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

const app = next({ dev, hostname, port });

app.prepare().then(() => {
  const handle = app.getRequestHandler();
  const upgradeHandler = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    handle(req, res);
  });

  const useWebSocketRealtime = !isPusherConfigured();
  const wss = useWebSocketRealtime ? new WebSocketServer({ noServer: true }) : null;

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "");

    if (useWebSocketRealtime && pathname === "/api/ws" && wss) {
      void (async () => {
        try {
          const token = await getToken({ req: req as never, secret: authSecret });
          const userId = (token?.id as string | undefined) ?? token?.sub;
          if (!userId) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
          }

          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, userId);
          });
        } catch {
          socket.destroy();
        }
      })();
      return;
    }

    void upgradeHandler(req, socket, head);
  });

  if (wss) {
    wss.on("connection", (ws: WebSocket, userId: string) => {
    void (async () => {
      const connectionId = crypto.randomUUID();
      const workspaceIds = await getUserWorkspaceIds(userId);

      const send = (data: object) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(data));
        }
      };

      realtimeHub.subscribe(connectionId, { userId, workspaceIds, send });
      send({ type: "connected", userId });

      const heartbeat = setInterval(() => {
        send({ type: "heartbeat", at: new Date().toISOString() });
      }, 25_000);

      const cleanup = async () => {
        clearInterval(heartbeat);
        realtimeHub.unsubscribe(connectionId);
        try {
          await prisma.user.update({
            where: { id: userId },
            data: { lastSeenAt: new Date() },
          });
        } catch {
          // ignore
        }
      };

      ws.on("message", (raw) => {
        void (async () => {
          try {
            const msg = JSON.parse(String(raw)) as {
              type?: string;
              conversationId?: string;
            };
            if (
              !msg.conversationId ||
              (msg.type !== "typing:start" && msg.type !== "typing:stop")
            ) {
              return;
            }
            const participantIds = await getConversationParticipantIds(msg.conversationId);
            if (!participantIds.includes(userId)) return;
            setConversationTyping(
              userId,
              msg.conversationId,
              msg.type === "typing:start",
              participantIds
            );
          } catch {
            // ignore malformed client messages
          }
        })();
      });

      ws.on("close", () => void cleanup());
      ws.on("error", () => void cleanup());
    })();
    });
  }

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    if (isPusherConfigured()) {
      console.log("> Realtime: Pusher");
    } else {
      console.log(`> Realtime: WebSocket fallback ws://${hostname}:${port}/api/ws`);
    }
  });
});
