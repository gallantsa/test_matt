import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import WebSocket from "ws";
import { startServer, clearAllRoomsForTest } from "../server/index.ts";

function wsUrl(httpUrl: string, room?: string) {
  const base = httpUrl.replace(/^http/, "ws");
  return room ? `${base}?room=${encodeURIComponent(room)}` : base;
}

function waitFor(ws: WebSocket, predicate: (d: any) => boolean, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener("message", onMessage);
      reject(new Error("timed out waiting for message"));
    }, timeoutMs);
    function onMessage(raw: any) {
      try {
        const data = JSON.parse(String(raw));
        if (predicate(data)) {
          clearTimeout(timer);
          ws.removeListener("message", onMessage);
          resolve(data);
        }
      } catch {
        // ignore
      }
    }
    ws.on("message", onMessage);
  });
}

function openJoined(url: string, nickname: string, room?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => {
      const joinedP = waitFor(ws, (d) => d.type === "joined");
      ws.send(JSON.stringify({ type: "join", nickname, ...(room ? { room } : {}) }));
      joinedP.then(() => resolve(ws), reject);
    });
    ws.once("error", reject);
  });
}

describe("R3: 持久化——JSON 落盘 + 重启恢复 (WebSocket 协议边界)", () => {
  let dataDir = "";

  before(() => {
    dataDir = mkdtempSync(join(tmpdir(), "chat-r3-"));
    process.env.DATA_DIR = dataDir;
  });

  after(() => {
    delete process.env.DATA_DIR;
  });

  it("发消息后 JSON 落盘；重启后本房历史仍在且顺序正确；join/leave 不恢复；无消息房视同新房", async () => {
    clearAllRoomsForTest();
    const s1 = await startServer(0);
    const a = await openJoined(wsUrl(s1.url, "lab"), "alice", "lab");
    a.send(JSON.stringify({ type: "chat", text: "msg-1" }));
    await waitFor(a, (d) => d.type === "chat" && d.text === "msg-1");
    a.send(JSON.stringify({ type: "chat", text: "msg-2" }));
    await waitFor(a, (d) => d.type === "chat" && d.text === "msg-2");
    a.close();

    const file = join(dataDir, "lab.json");
    assert.equal(existsSync(file), true);
    const persisted = JSON.parse(readFileSync(file, "utf-8"));
    assert.deepEqual(
      persisted.map((m: any) => m.text),
      ["msg-1", "msg-2"],
    );
    assert.ok(persisted.every((m: any) => m.type === "chat"));

    await s1.close();
    clearAllRoomsForTest();

    const s2 = await startServer(0);
    const histP = new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(s2.url, "lab"));
      ws.once("open", () => {
        waitFor(ws, (d) => d.type === "history").then((h) => {
          resolve(h);
          ws.close();
        }, reject);
      });
      ws.once("error", reject);
    });
    const hist = await histP;
    assert.equal(hist.room, "lab");
    assert.deepEqual(
      (hist.messages as any[]).map((m) => m.text),
      ["msg-1", "msg-2"],
    );
    assert.ok((hist.messages as any[]).every((m) => m.type === "chat"));

    const emptyHistP = new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(s2.url, "never-talked"));
      ws.once("open", () => {
        waitFor(ws, (d) => d.type === "history").then((h) => {
          resolve(h);
          ws.close();
        }, reject);
      });
      ws.once("error", reject);
    });
    const emptyHist = await emptyHistP;
    assert.deepEqual(emptyHist.messages, []);

    await s2.close();
    clearAllRoomsForTest();
  });
});
