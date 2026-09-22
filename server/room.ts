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

export type StoreAdapter = {
  load(name: string): ChatMessage[];
  save(name: string, chats: ChatMessage[]): void;
  clear(name: string): void;
};

export class JsonFileStore implements StoreAdapter {
  private dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }

  private file(name: string): string {
    return join(this.dir, `${name}.json`);
  }

  load(name: string): ChatMessage[] {
    try {
      const file = this.file(name);
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

  save(name: string, chats: ChatMessage[]): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(this.file(name), JSON.stringify(chats, null, 2));
    } catch {
      // persistence is best-effort; chat still works in memory
    }
  }

  clear(name: string): void {
    try {
      rmSync(this.file(name), { force: true });
    } catch {
      // ignore
    }
  }
}

export class InMemoryStore implements StoreAdapter {
  private data = new Map<string, ChatMessage[]>();

  load(name: string): ChatMessage[] {
    return [...(this.data.get(name) ?? [])];
  }

  save(name: string, chats: ChatMessage[]): void {
    this.data.set(name, [...chats]);
  }

  clear(name: string): void {
    this.data.delete(name);
  }
}

export class RoomStore {
  private rooms = new Map<string, RoomState>();
  private store: StoreAdapter;
  constructor(store: StoreAdapter) {
    this.store = store;
  }

  private state(name: string): RoomState {
    let room = this.rooms.get(name);
    if (!room) {
      room = { history: this.store.load(name), clients: new Set() };
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
    if (msg.type === "chat") {
      this.store.save(
        name,
        room.history.filter((m) => m.type === "chat").slice(-HISTORY_LIMIT),
      );
    }
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
    this.store.clear(name);
  }

  clearAllHistory(): void {
    for (const name of this.rooms.keys()) {
      this.rooms.get(name)!.history.length = 0;
      this.store.clear(name);
    }
  }
}
