import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { startServer, clearHistoryForTest, getHistory } from "../server/index.ts";
import { wsUrl, waitFor, openSocket } from "./helpers.ts";

describe("T4: history replay + leave", () => {
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

  it("new member receives recent history in order", async () => {
    clearHistoryForTest();
    const alice = await openSocket(wsUrl(baseUrl));
    const joinedP = waitFor(alice, (d) => d.type === "joined");
    alice.send(JSON.stringify({ type: "join", nickname: "alice" }));
    await joinedP;
    alice.send(JSON.stringify({ type: "chat", text: "hello-1" }));
    alice.send(JSON.stringify({ type: "chat", text: "hello-2" }));
    await waitFor(alice, (d) => d.type === "chat" && d.text === "hello-2");

    const bob = new WebSocket(wsUrl(baseUrl));
    const historyP = waitFor(bob, (d) => d.type === "history");
    await new Promise((r) => bob.once("open", r));
    const history = await historyP;
    const texts = history.messages.map((m: any) => m.text);
    assert.ok(texts.includes("hello-1"));
    assert.ok(texts.includes("hello-2"));
    assert.ok(history.messages.length <= 100);
    const idx1 = texts.indexOf("hello-1");
    const idx2 = texts.indexOf("hello-2");
    assert.ok(idx1 < idx2, "history order should be preserved");

    alice.close();
    bob.close();
  });

  it("member leaving broadcasts a leave message to others", async () => {
    clearHistoryForTest();
    const alice = await openSocket(wsUrl(baseUrl));
    const aJoined = waitFor(alice, (d) => d.type === "joined");
    alice.send(JSON.stringify({ type: "join", nickname: "alice" }));
    await aJoined;
    const bob = await openSocket(wsUrl(baseUrl));
    const bJoined = waitFor(bob, (d) => d.type === "joined");
    bob.send(JSON.stringify({ type: "join", nickname: "bob" }));
    await bJoined;
    await waitFor(alice, (d) => d.type === "join" && d.nickname === "bob");

    const leaveP = waitFor(alice, (d) => d.type === "leave" && d.nickname === "bob");
    bob.close();
    const leave = await leaveP;
    assert.match(leave.text, /bob/);
    assert.ok(getHistory().some((m) => m.type === "leave" && m.nickname === "bob"));

    alice.close();
  });

  it("closing before join does not broadcast leave", async () => {
    clearHistoryForTest();
    const alice = await openSocket(wsUrl(baseUrl));
    const aJoined = waitFor(alice, (d) => d.type === "joined");
    alice.send(JSON.stringify({ type: "join", nickname: "alice" }));
    await aJoined;
    const before = getHistory().length;
    const ghost = await openSocket(wsUrl(baseUrl));
    ghost.close();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(getHistory().length, before);
    alice.close();
  });
});
