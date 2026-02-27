import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

interface TranscriptSegment {
  callId: string;
  clientId: string;
  speaker: "caller" | "agent";
  text: string;
  emotion: string;
  confidence: number;
  timestamp: number;
  turnIndex: number;
  sentenceEmotions?: Array<{ text: string; emotion: string; confidence: number }>;
}

const callSubscribers = new Map<string, Set<WebSocket>>();

let wss: WebSocketServer;

export function setupWebSocket(httpServer: Server) {
  wss = new WebSocketServer({ server: httpServer, path: "/ws/transcript" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const callId = url.searchParams.get("callId");
    const clientId = url.searchParams.get("clientId");

    if (!callId && !clientId) {
      ws.close(1008, "callId or clientId required");
      return;
    }

    const key = callId || `client:${clientId}`;

    if (!callSubscribers.has(key)) {
      callSubscribers.set(key, new Set());
    }
    callSubscribers.get(key)!.add(ws);

    if (clientId && !callId) {
      if (!callSubscribers.has(`client:${clientId}`)) {
        callSubscribers.set(`client:${clientId}`, new Set());
      }
      callSubscribers.get(`client:${clientId}`)!.add(ws);
    }

    ws.on("close", () => {
      for (const [k, subs] of callSubscribers.entries()) {
        subs.delete(ws);
        if (subs.size === 0) callSubscribers.delete(k);
      }
    });

    ws.send(JSON.stringify({ type: "connected", callId, clientId }));
  });

  return wss;
}

export function broadcastTranscriptSegment(segment: TranscriptSegment) {
  const message = JSON.stringify({ type: "transcript", data: segment });

  const callSubs = callSubscribers.get(segment.callId);
  if (callSubs) {
    for (const ws of callSubs) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    }
  }

  const clientSubs = callSubscribers.get(`client:${segment.clientId}`);
  if (clientSubs) {
    for (const ws of clientSubs) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    }
  }
}

export function broadcastCallEvent(callId: string, clientId: string, event: string, data?: any) {
  const message = JSON.stringify({ type: event, callId, clientId, data });

  for (const key of [callId, `client:${clientId}`]) {
    const subs = callSubscribers.get(key);
    if (subs) {
      for (const ws of subs) {
        if (ws.readyState === WebSocket.OPEN) ws.send(message);
      }
    }
  }
}
