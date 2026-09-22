import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";

export type ChatMessage = {
  type: "chat" | "join" | "leave";
  nickname: string;
  text: string;
  at: number;
};

export const DEFAULT_ROOM = "lobby";

export type RoomState = {
  name: string;
  history: ChatMessage[];
  clients: Set<WebSocket>;
};

const rooms = new Map<string, RoomState>();

export function getOrCreateRoom(name: string = DEFAULT_ROOM): RoomState {
  let room = rooms.get(name);
  if (!room) {
    room = { name, history: [], clients: new Set() };
    rooms.set(name, room);
  }
  return room;
}

export function getRoom(name: string = DEFAULT_ROOM): RoomState {
  return getOrCreateRoom(name);
}

export function clearAllRoomsForTest(): void {
  rooms.clear();
}

export function sanitizeRoomName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return DEFAULT_ROOM;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) return DEFAULT_ROOM;
  return name;
}
export function assignNickname(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name) return name;
  return `guest-${Math.random().toString(16).slice(2, 6).padEnd(4, "0")}`;
}

export function getHistory(roomName: string = DEFAULT_ROOM): ChatMessage[] {
  return [...getOrCreateRoom(roomName).history];
}

export function clearHistoryForTest(roomName?: string): void {
  if (roomName === undefined) {
    for (const room of rooms.values()) room.history.length = 0;
    return;
  }
  getOrCreateRoom(roomName).history.length = 0;
}

function broadcast(msg: ChatMessage, roomName: string = DEFAULT_ROOM): void {
  const room = getOrCreateRoom(roomName);
  room.history.push(msg);
  if (room.history.length > 100) room.history.splice(0, room.history.length - 100);
  const payload = JSON.stringify(msg);
  for (const ws of room.clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");

export async function startServer(port = 3000): Promise<{ url: string; close: () => Promise<void> }> {
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
    let room = getOrCreateRoom(roomName);
    room.clients.add(ws);
    ws.send(JSON.stringify({ type: "history", room: roomName, messages: getHistory(roomName) }));
    let nickname: string | null = null;
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(String(raw));
        if (data?.type === "join" && nickname === null) {
          const requested = sanitizeRoomName(data.room ?? roomName);
          if (requested !== roomName) {
            room.clients.delete(ws);
            roomName = requested;
            room = getOrCreateRoom(roomName);
            room.clients.add(ws);
            ws.send(JSON.stringify({ type: "history", room: roomName, messages: getHistory(roomName) }));
          }
          nickname = assignNickname(data.nickname);
          ws.send(JSON.stringify({ type: "joined", nickname, room: roomName }));
          broadcast(
            {
              type: "join",
              nickname,
              text: `${nickname} 加入了 #${roomName}`,
              at: Date.now(),
            },
            roomName,
          );
        } else if (data?.type === "chat" && nickname !== null) {
          const text = typeof data.text === "string" ? data.text.trim() : "";
          if (!text) return;
          broadcast({ type: "chat", nickname, text, at: Date.now() }, roomName);
        }
      } catch {
        // ignore malformed payloads
      }
    });
    ws.on("close", () => {
      room.clients.delete(ws);
      if (nickname !== null) {
        broadcast(
          {
            type: "leave",
            nickname,
            text: `${nickname} 离开了 #${roomName}`,
            at: Date.now(),
          },
          roomName,
        );
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
        for (const r of rooms.values()) {
          for (const ws of r.clients) {
            try {
              ws.terminate();
            } catch {
              // ignore
            }
          }
          r.clients.clear();
        }
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
