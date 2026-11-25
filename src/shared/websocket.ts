import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { SyncProgressEvent } from "../modules/sync/sync.interface.js";

let wss: WebSocketServer | null = null;

export function attachWebSocket(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket: WebSocket) => {
    socket.send(JSON.stringify({ type: "connected" }));
  });

  return wss;
}

export function broadcast(event: SyncProgressEvent | { type: string; [key: string]: unknown }): void {
  if (!wss) return;
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}
