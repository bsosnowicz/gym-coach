// Browser reports (POST /api/session/report): only listed actions, only flat, short details.

const test = require("node:test");
const assert = require("node:assert/strict");

const { browserReport } = require("../src/http/browser-report");

test("raport z listy przechodzi z płaskimi szczegółami", () => {
  assert.deepEqual(
    browserReport({ action: "mic_blocked", details: { reason: "permission", permission: "prompt", audioState: "running" } }),
    { action: "mic_blocked", details: { reason: "permission", permission: "prompt", audioState: "running" } },
  );
  assert.deepEqual(browserReport({ action: "mic_unblocked" }), { action: "mic_unblocked", details: {} });
  assert.deepEqual(
    browserReport({ action: "turn_latency", details: { path: "llm", sttMs: 800, queuedMs: null, audibleMs: 2380, hedged: false } }),
    { action: "turn_latency", details: { path: "llm", sttMs: 800, queuedMs: null, audibleMs: 2380, hedged: false } },
  );
});

test("nieznany rodzaj raportu to błąd 400", () => {
  for (const action of [undefined, "", "session.ended", "__proto__"]) {
    assert.throws(() => browserReport({ action }), (error) => error.statusCode === 400);
  }
});

test("szczegóły: bez zagnieżdżeń, nieskończoności i dziwnych kluczy, napisy przycięte", () => {
  const { details } = browserReport({
    action: "mic_unblocked",
    details: {
      waitedMs: 4210,
      ok: true,
      empty: null,
      nested: { a: 1 },
      list: [1, 2],
      infinite: Infinity,
      "bad key": "x",
      long: "x".repeat(500),
    },
  });
  assert.deepEqual(Object.keys(details), ["waitedMs", "ok", "empty", "long"]);
  assert.equal(details.long.length, 200);
  assert.deepEqual(browserReport({ action: "mic_blocked", details: [1, 2] }).details, {});
});
