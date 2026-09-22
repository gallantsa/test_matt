import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { startServer, clearHistoryForTest } from "../server/index.ts";
import { wsUrl, waitFor, openJoined } from "./helpers.ts";

describe("T5: chat broadcast boundary", () => {
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

  it("A sends chat, B receives it with nickname/text/at", async () => {
    clearHistoryForTest();
    const alice = await openJoined(wsUrl(baseUrl), "alice");
    const bob = await openJoined(wsUrl(baseUrl), "bob");
    await waitFor(alice, (d) => d.type === "join" && d.nickname === "bob");

    const seenP = waitFor(bob, (d) => d.type === "chat" && d.text === "hello-bob");
    alice.send(JSON.stringify({ type: "chat", text: "hello-bob" }));
    const seen = await seenP;
    assert.equal(seen.nickname, "alice");
    assert.equal(seen.text, "hello-bob");
    assert.equal(typeof seen.at, "number");

    alice.close();
    bob.close();
  });

  it("blank chat text is ignored and not broadcast", async () => {
    clearHistoryForTest();
    const alice = await openJoined(wsUrl(baseUrl), "alice");
    const bob = await openJoined(wsUrl(baseUrl), "bob");
    await waitFor(alice, (d) => d.type === "join" && d.nickname === "bob");

    let gotChat = false;
    const onMsg = (raw: any) => {
      try {
        if (JSON.parse(String(raw)).type === "chat") gotChat = true;
      } catch {
        // ignore
      }
    };
    bob.on("message", onMsg);
    alice.send(JSON.stringify({ type: "chat", text: "   " }));
    await new Promise((r) => setTimeout(r, 300));
    bob.removeListener("message", onMsg);
    assert.equal(gotChat, false);

    alice.close();
    bob.close();
  });

  it("malformed JSON does not kill the connection", async () => {
    clearHistoryForTest();
    const alice = await openJoined(wsUrl(baseUrl), "alice");
    alice.send("{{{not-json");
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(alice.readyState, WebSocket.OPEN);
    const seenP = waitFor(alice, (d) => d.type === "chat" && d.text === "still-alive");
    alice.send(JSON.stringify({ type: "chat", text: "still-alive" }));
    await seenP;
    alice.close();
  });
});
