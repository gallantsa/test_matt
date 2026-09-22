import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import {
  RoomStore,
  JsonFileStore,
  sanitizeRoomName,
  assignNickname,
  DEFAULT_ROOM,
  type ChatMessage,
} from "./room.ts";

export type { ChatMessage };
export { DEFAULT_ROOM, sanitizeRoomName, assignNickname };

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function currentDataDir(): string {
  return process.env.DATA_DIR ?? join(projectRoot, "data");
}

const stores = new Map<string, RoomStore>();

function storeFor(dir?: string): RoomStore {
  const key = dir ?? currentDataDir();
  let store = stores.get(key);
  if (!store) {
    store = new RoomStore(new JsonFileStore(key));
    stores.set(key, store);
  }
  return store;
}

export function getHistory(roomName: string = DEFAULT_ROOM): ChatMessage[] {
  return storeFor().history(roomName);
}

export function clearAllRoomsForTest(): void {
  for (const store of stores.values()) store.clearAll();
}

export function clearHistoryForTest(roomName?: string): void {
  if (roomName === undefined) {
    for (const store of stores.values()) store.clearAllHistory();
    return;
  }
  storeFor().clearRoom(roomName);
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");

export async function startServer(port = 3000): Promise<{ url: string; close: () => Promise<void> }> {
  const store = storeFor();
  const httpServer: Server = createServer(async (req, res) => {
    const pathname = normalize(new URL(req.url ?? "/", "http://x").pathname);
    const filePath = join(root, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket, req) => {
    let roomName = DEFAULT_ROOM;
    try {
      const q = new URL(req?.url ?? "/", "http://x").searchParams.get("room");
      if (q) roomName = sanitizeRoomName(q);
    } catch {
      // keep default
    }
    send(ws, { type: "history", room: roomName, messages: store.join(roomName, ws) });
    let nickname: string | null = null;
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(String(raw));
        if (data?.type === "join" && nickname === null) {
          const requested = sanitizeRoomName(data.room ?? roomName);
          if (requested !== roomName) {
            const previous = roomName;
            roomName = requested;
            send(ws, { type: "history", room: roomName, messages: store.moveClient(previous, roomName, ws) });
          }
          nickname = assignNickname(data.nickname);
          send(ws, { type: "joined", nickname, room: roomName });
          const { message, targets } = store.say(roomName, {
            type: "join",
            nickname,
            text: `${nickname} 加入了 #${roomName}`,
            at: Date.now(),
          });
          for (const target of targets) send(target, message);
        } else if (data?.type === "chat" && nickname !== null) {
          const text = typeof data.text === "string" ? data.text.trim() : "";
          if (!text) return;
          const { message, targets } = store.say(roomName, { type: "chat", nickname, text, at: Date.now() });
          for (const target of targets) send(target, message);
        }
      } catch {
        // ignore malformed payloads
      }
    });
    ws.on("close", () => {
      store.leave(roomName, ws);
      if (nickname !== null) {
        const { message, targets } = store.say(roomName, {
          type: "leave",
          nickname,
          text: `${nickname} 离开了 #${roomName}`,
          at: Date.now(),
        });
        for (const target of targets) send(target, message);
      }
    });
  });

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://127.0.0.1:${actualPort}`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        store.terminateAll();
        wss.close(() => httpServer.close((err) => (err ? reject(err) : resolve())));
      }),
  };
}

const isMain = process.argv[1] !== undefined && import.meta.filename === process.argv[1];
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const { url } = await startServer(port);
  console.log(`chat room listening on ${url}`);
}
