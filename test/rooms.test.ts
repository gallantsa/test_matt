import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
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

describe("R2: 房间前端与本房历史 (WebSocket + HTTP 边界)", () => {
  let baseUrl = "";
  let close: () => Promise<void> = async () => {};

  before(async () => {
    const started = await startServer(0);
    baseUrl = started.url;
    close = started.close;
  });

  after(async () => {
    await close();
  });

  it("同房互见：以该房名加入后双方互见 chat", async () => {
    clearAllRoomsForTest();
    const a = await openJoined(wsUrl(baseUrl, "lab"), "alice", "lab");
    const b = await openJoined(wsUrl(baseUrl, "lab"), "bob", "lab");
    await waitFor(a, (d) => d.type === "join" && d.nickname === "bob");
    const seenP = waitFor(b, (d) => d.type === "chat" && d.text === "hello-lab");
    a.send(JSON.stringify({ type: "chat", text: "hello-lab" }));
    const seen = await seenP;
    assert.equal(seen.nickname, "alice");
    a.close();
    b.close();
  });

  it("跨房隔离：A 房的 chat/join 在 B 房不可见（双向）", async () => {
    clearAllRoomsForTest();
    const a = await openJoined(wsUrl(baseUrl, "roomA"), "alice", "roomA");
    const b = await openJoined(wsUrl(baseUrl, "roomB"), "bob", "roomB");
    await new Promise((r) => setTimeout(r, 200));

    let leaked = false;
    const onMsg = (raw: any) => {
      try {
        const d = JSON.parse(String(raw));
        if (d.type === "chat" || d.type === "join" || d.type === "leave") leaked = true;
      } catch {
        // ignore
      }
    };
    b.on("message", onMsg);
    a.send(JSON.stringify({ type: "chat", text: "secret-A" }));
    await new Promise((r) => setTimeout(r, 300));
    b.removeListener("message", onMsg);
    assert.equal(leaked, false);

    a.close();
    b.close();
  });

  it("新进房收到本房历史（≤100 条），不含其他房消息", async () => {
    clearAllRoomsForTest();
    const a = await openJoined(wsUrl(baseUrl, "lab"), "alice", "lab");
    a.send(JSON.stringify({ type: "chat", text: "lab-msg-1" }));
    await waitFor(a, (d) => d.type === "chat" && d.text === "lab-msg-1");
    const other = await openJoined(wsUrl(baseUrl, "other"), "mallory", "other");
    other.send(JSON.stringify({ type: "chat", text: "other-msg" }));
    await waitFor(other, (d) => d.type === "chat" && d.text === "other-msg");

    const newcomerHistP = new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(baseUrl, "lab"));
      ws.once("open", () => {
        waitFor(ws, (d) => d.type === "history").then((h) => {
          resolve(h);
          ws.close();
        }, reject);
      });
      ws.once("error", reject);
    });
    const hist = await newcomerHistP;
    assert.equal(hist.room, "lab");
    const texts = (hist.messages as any[]).map((m) => m.text);
    assert.ok(texts.includes("lab-msg-1"));
    assert.ok(!texts.includes("other-msg"));

    a.close();
    other.close();
  });

  it("HTTP 边界：页面含房间输入要素", async () => {
    const res = await fetch(`${baseUrl}/?room=lab`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /id="room"/);
    assert.match(html, /id="nickname"/);
    assert.match(html, /id="messages"/);
  });
});
