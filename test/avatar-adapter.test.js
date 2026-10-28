const test = require("node:test");
const assert = require("node:assert/strict");
const { createLiveAvatarLite } = require("../src/adapters/avatar/liveavatar-lite");

async function withProvider(run, { stopStatus = 200, brokenStart = false, brokenSocket = false } = {}) {
  const previous = global.fetch;
  const requests = [];
  const sockets = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/token")) return Response.json({ data: { session_token: "secret", session_id: "provider-id" } });
    if (url.endsWith("/start")) return Response.json({ data: { session_id: "provider-id", max_session_duration: 120,
      ws_url: "wss://provider.invalid", livekit_url: "wss://room.invalid", livekit_client_token: brokenStart ? null : "room-secret" } });
    return new Response(null, { status: stopStatus });
  };
  class Socket {
    constructor() {
      sockets.push(this);
      queueMicrotask(() => brokenSocket ? this.onclose?.() : this.onmessage?.({ data: JSON.stringify({ type: "session.state_updated", state: "connected" }) }));
    }
    send() {}
    close() { this.closed = true; }
  }
  const adapter = createLiveAvatarLite({ apiKey: "key", sessionLimitS: 90, WebSocketImpl: Socket });
  try { await run({ adapter, requests, sockets }); }
  finally { global.fetch = previous; }
}

test("adapter exposes the shortened provider expiry and shares concurrent stops", async () => {
  await withProvider(async ({ adapter, requests, sockets }) => {
    const before = Date.now();
    const handle = await adapter.start();
    assert.equal(handle.durationMs, 90000);
    assert.ok(handle.expiresAt >= before + 90000 && handle.expiresAt <= Date.now() + 90000);
    await Promise.all([handle.stop(), handle.stop()]);
    assert.equal(requests.filter((r) => r.url.endsWith("/stop")).length, 1);
    assert.equal(sockets[0].closed, true);
    assert.deepEqual(JSON.parse(requests.at(-1).options.body), { session_id: "provider-id" });
  });
});

test("an HTTP stop failure is surfaced and can be retried", async () => {
  await withProvider(async ({ adapter, requests }) => {
    const handle = await adapter.start();
    await assert.rejects(handle.stop(), /zamknięcie sesji nieudane/);
    await assert.rejects(handle.stop(), /zamknięcie sesji nieudane/);
    assert.equal(requests.filter((r) => r.url.endsWith("/stop")).length, 2);
  }, { stopStatus: 503 });
});

test("invalid room credentials clean up the allocated provider session", async () => {
  await withProvider(async ({ adapter, requests }) => {
    await assert.rejects(adapter.start(), /nie zwrócił połączenia/);
    assert.equal(requests.filter((r) => r.url.endsWith("/stop")).length, 1);
  }, { brokenStart: true });
});

test("a socket closed before ready fails promptly and releases the provider session", async () => {
  await withProvider(async ({ adapter, requests, sockets }) => {
    await assert.rejects(adapter.start(), /przed gotowością/);
    assert.equal(requests.filter((r) => r.url.endsWith("/stop")).length, 1);
    assert.equal(sockets[0].closed, true);
  }, { brokenSocket: true });
});
