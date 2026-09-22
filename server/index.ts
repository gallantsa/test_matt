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

const history: ChatMessage[] = [];
const clients = new Set<WebSocket>();

export function assignNickname(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name) return name;
  return `guest-${Math.random().toString(16).slice(2, 6).padEnd(4, "0")}`;
}

export function getHistory(): ChatMessage[] {
  return [...history];
}

export function clearHistoryForTest(): void {
  history.length = 0;
}

function broadcast(msg: ChatMessage): void {
  history.push(msg);
  if (history.length > 100) history.splice(0, history.length - 100);
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
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

  wss.on("connection", (ws: WebSocket) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "history", messages: getHistory() }));
    let nickname: string | null = null;
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(String(raw));
        if (data?.type === "join" && nickname === null) {
          nickname = assignNickname(data.nickname);
          ws.send(JSON.stringify({ type: "joined", nickname }));
          broadcast({
            type: "join",
            nickname,
            text: `${nickname} 加入了聊天室`,
            at: Date.now(),
          });
        }
      } catch {
        // ignore malformed payloads
      }
    });
    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://127.0.0.1:${actualPort}`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        wss.close(() => httpServer.close((err) => (err ? reject(err) : resolve()))),
      ),
  };
}

const isMain = process.argv[1] !== undefined && import.meta.filename === process.argv[1];
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const { url } = await startServer(port);
  console.log(`chat room listening on ${url}`);
}
