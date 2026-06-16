import { isPusherClientConfigured, sendPusherTyping } from "@/lib/pusher-client";

let ws: WebSocket | null = null;

export function setRealtimeWebSocket(socket: WebSocket | null) {
  ws = socket;
}

export function sendRealtimePayload(payload: object) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function sendTypingIndicator(conversationId: string, typing: boolean) {
  if (isPusherClientConfigured()) {
    sendPusherTyping(conversationId, typing);
    return;
  }
  sendRealtimePayload({
    type: typing ? "typing:start" : "typing:stop",
    conversationId,
  });
}
