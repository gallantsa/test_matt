import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { startServer, clearHistoryForTest } from "../server/index.ts";

function wsUrl(httpUrl: string) {
  return httpUrl.replace(/^http/, "ws");
}

function waitFor(ws: WebSocket, predicate: (d: any) => boolean, timeoutMs = 5000): Promise<any> {
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

describe("regression: history capped at 100", () => {
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

  it("new connection receives at most 100 history messages after 150 chats", async () => {
    clearHistoryForTest();
    const sender = new WebSocket(wsUrl(baseUrl));
    await new Promise((r) => sender.once("open", r));
    const joinedP = waitFor(sender, (d) => d.type === "joined");
    sender.send(JSON.stringify({ type: "join", nickname: "spammer" }));
    await joinedP;
    for (let i = 0; i < 150; i++) {
      sender.send(JSON.stringify({ type: "chat", text: `msg-${i}` }));
    }
    await waitFor(sender, (d) => d.type === "chat" && d.text === "msg-149");

    const newcomer = new WebSocket(wsUrl(baseUrl));
    const historyP = waitFor(newcomer, (d) => d.type === "history");
    await new Promise((r) => newcomer.once("open", r));
    const history = await historyP;
    assert.ok(
      history.messages.length <= 100,
      `expected <= 100 history messages, got ${history.messages.length}`
    );

    sender.close();
    newcomer.close();
  });
});
