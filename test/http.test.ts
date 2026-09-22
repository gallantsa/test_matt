import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../server/index.ts";

describe("T1: static page skeleton (HTTP boundary)", () => {
  let baseUrl = "";
  let close = async () => {};

  before(async () => {
    const started = await startServer(0);
    baseUrl = started.url;
    close = started.close;
  });

  after(async () => {
    await close();
  });

  it("GET / returns 200 with nickname box, message list and input", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /id="nickname"/);
    assert.match(html, /id="messages"/);
    assert.match(html, /id="input"/);
  });

  it("page has basic styling and no obvious placeholder errors", async () => {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    assert.match(html, /<style>/);
  });
});
