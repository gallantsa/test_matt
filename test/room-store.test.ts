import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RoomStore, InMemoryStore, type ChatMessage } from "../server/room.ts";

function chat(nickname: string, text: string): ChatMessage {
  return { type: "chat", nickname, text, at: Date.now() };
}

describe("RoomStore over InMemoryStore (no disk, no sockets)", () => {
  it("caps history at 100 per room", () => {
    const store = new RoomStore(new InMemoryStore());
    for (let i = 0; i < 150; i++) {
      store.say("lab", chat("a", `msg-${i}`));
    }
    const history = store.history("lab");
    assert.equal(history.length, 100);
    assert.equal(history[0].text, "msg-50");
  });

  it("rooms are isolated", () => {
    const store = new RoomStore(new InMemoryStore());
    store.say("a", chat("x", "hello-a"));
    store.say("b", chat("y", "hello-b"));
    assert.deepEqual(
      store.history("a").map((m) => m.text),
      ["hello-a"],
    );
    assert.deepEqual(
      store.history("b").map((m) => m.text),
      ["hello-b"],
    );
  });

  it("persisted chats reload on a fresh store sharing one adapter", () => {
    const adapter = new InMemoryStore();
    const first = new RoomStore(adapter);
    first.say("lab", chat("a", "survives"));
    const second = new RoomStore(adapter);
    assert.deepEqual(
      second.history("lab").map((m) => m.text),
      ["survives"],
    );
  });
});
