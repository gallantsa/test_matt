import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { startServer, clearHistoryForTest } from "../server/index.ts";

function wsUrl(httpUrl) {
  return httpUrl.replace(/^http/, "ws");
}

function waitFor(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener("message", onMessage);
      reject(new Error("timed out waiting for message"));
    }, timeoutMs);
    function onMessage(raw) {
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

describe("T2: join with nickname (WebSocket boundary)", () => {
  let baseUrl = "";
  let close = async () => {};

  before(async () => {
    const started = await startServer(0);
    baseUrl = started.url;
    close = started.close;
    clearHistoryForTest();
  });

  after(async () => {
    await close();
  });

  it("joining with a nickname broadcasts a join system message to self and others", async () => {
    const alice = new WebSocket(wsUrl(baseUrl));
    await new Promise((r) => alice.once("open", r));
    const aliceJoined = waitFor(alice, (d) => d.type === "joined");
    const aliceSeesJoin = waitFor(alice, (d) => d.type === "join");
    alice.send(JSON.stringify({ type: "join", nickname: "alice" }));
    const joined = await aliceJoined;
    assert.equal(joined.nickname, "alice");
    const seen = await aliceSeesJoin;
    assert.equal(seen.nickname, "alice");

    const bob = new WebSocket(wsUrl(baseUrl));
    await new Promise((r) => bob.once("open", r));
    const bobSeesAliceJoin = waitFor(bob, (d) => d.type === "join" && d.nickname === "bob");
    const aliceSeesBobJoin = waitFor(alice, (d) => d.type === "join" && d.nickname === "bob");
    bob.send(JSON.stringify({ type: "join", nickname: "bob" }));
    await bobSeesAliceJoin;
    const bobJoinOnAlice = await aliceSeesBobJoin;
    assert.match(bobJoinOnAlice.text, /bob/);

    alice.close();
    bob.close();
  });

  it("empty nickname is assigned a guest-xxxx name", async () => {
    const ws = new WebSocket(wsUrl(baseUrl));
    await new Promise((r) => ws.once("open", r));
    const joinedP = waitFor(ws, (d) => d.type === "joined");
    ws.send(JSON.stringify({ type: "join", nickname: "   " }));
    const joined = await joinedP;
    assert.match(joined.nickname, /^guest-[0-9a-f]{4}$/);
    ws.close();
  });
});
