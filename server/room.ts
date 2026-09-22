import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { WebSocket } from "ws";

export type ChatMessage = {
  type: "chat" | "join" | "leave";
  nickname: string;
  text: string;
  at: number;
};

export const DEFAULT_ROOM = "lobby";
const HISTORY_LIMIT = 100;

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

type RoomState = {
  history: ChatMessage[];
  clients: Set<WebSocket>;
};

export class RoomStore {
  private rooms = new Map<string, RoomState>();
  private dataDir: string;
  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private roomFile(name: string): string {
    return join(this.dataDir, `${name}.json`);
  }

  private loadPersistedChat(name: string): ChatMessage[] {
    try {
      const file = this.roomFile(name);
      if (!existsSync(file)) return [];
      const parsed = JSON.parse(readFileSync(file, "utf-8"));
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((m) => m?.type === "chat" && typeof m?.nickname === "string" && typeof m?.text === "string")
        .slice(-HISTORY_LIMIT);
    } catch {
      return [];
    }
  }

  private saveChat(name: string, history: ChatMessage[]): void {
    try {
      mkdirSync(this.dataDir, { recursive: true });
      const chats = history.filter((m) => m.type === "chat").slice(-HISTORY_LIMIT);
      writeFileSync(this.roomFile(name), JSON.stringify(chats, null, 2));
    } catch {
      // persistence is best-effort; chat still works in memory
    }
  }

  private state(name: string): RoomState {
    let room = this.rooms.get(name);
    if (!room) {
      room = { history: this.loadPersistedChat(name), clients: new Set() };
      this.rooms.set(name, room);
    }
    return room;
  }

  join(name: string, ws: WebSocket): ChatMessage[] {
    const room = this.state(name);
    room.clients.add(ws);
    return [...room.history];
  }

  moveClient(from: string, to: string, ws: WebSocket): ChatMessage[] {
    this.state(from).clients.delete(ws);
    return this.join(to, ws);
  }

  leave(name: string, ws: WebSocket): void {
    this.state(name).clients.delete(ws);
  }

  say(name: string, msg: ChatMessage): { message: ChatMessage; targets: WebSocket[] } {
    const room = this.state(name);
    room.history.push(msg);
    if (room.history.length > HISTORY_LIMIT) room.history.splice(0, room.history.length - HISTORY_LIMIT);
    if (msg.type === "chat") this.saveChat(name, room.history);
    return { message: msg, targets: [...room.clients] };
  }

  history(name: string): ChatMessage[] {
    return [...this.state(name).history];
  }

  terminateAll(): void {
    for (const room of this.rooms.values()) {
      for (const ws of room.clients) {
        try {
          ws.terminate();
        } catch {
          // ignore
        }
      }
      room.clients.clear();
    }
  }

  clearAll(): void {
    this.rooms.clear();
  }

  clearRoom(name: string): void {
    this.state(name).history.length = 0;
    try {
      rmSync(this.roomFile(name), { force: true });
    } catch {
      // ignore
    }
  }

  clearAllHistory(): void {
    for (const [name, room] of this.rooms) {
      room.history.length = 0;
      try {
        rmSync(this.roomFile(name), { force: true });
      } catch {
        // ignore
      }
    }
  }
}
