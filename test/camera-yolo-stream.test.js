// The YOLO stream client (public/camera/yolo-stream.js, from yoga-startup)
// against a fake WebSocket: the address from /api/config, the scenario sent
// after "ready", frames only once a scenario is set, results by frame_id,
// and a refused connection rejecting so the panel keeps the bare preview.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../public/camera/yolo-stream.js");

function installBrowser() {
  const sockets = [];
  const frames = [];
  class FakeWebSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen(); }
    receive(data) { this.onmessage({ data: JSON.stringify(data) }); }
  }
  globalThis.WebSocket = FakeWebSocket;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => `data:image/jpeg;base64,${"A".repeat(40)}` }),
  };
  globalThis.requestAnimationFrame = (callback) => frames.push(callback);
  const runFrame = (now) => frames.splice(0).forEach((callback) => callback(now));
  return { sockets, runFrame };
}

const video = { videoWidth: 1280, videoHeight: 720 };

test("YOLO: adres względny idzie za stroną (https → wss), pełny przechodzi bez zmian", async () => {
  const { yoloPoseWsUrl } = await load();
  assert.equal(yoloPoseWsUrl("/yolo/ws/analyze", new URL("https://coach.example/app/")), "wss://coach.example/yolo/ws/analyze");
  assert.equal(yoloPoseWsUrl("/yolo/ws/analyze", new URL("http://127.0.0.1:3001/app/")), "ws://127.0.0.1:3001/yolo/ws/analyze");
  assert.equal(yoloPoseWsUrl("ws://localhost:8000/ws/analyze", new URL("https://coach.example/")), "ws://localhost:8000/ws/analyze");
  assert.equal(yoloPoseWsUrl(undefined, new URL("http://x/")), "");
});

test("YOLO: scenariusz po ready, klatki dopiero ze scenariuszem, wynik po frame_id", async () => {
  const { createYoloPoseStream } = await load();
  const { sockets, runFrame } = installBrowser();
  const analyses = [];
  const starting = createYoloPoseStream(video, { url: "ws://yolo/ws/analyze", onAnalysis: (data) => analyses.push(data) });
  sockets[0].open();
  const stream = await starting;

  sockets[0].receive({ type: "ready", model: "yolov8n-pose.pt", scenarios: ["standing"] });
  runFrame(1000);
  assert.deepEqual(sockets[0].sent, [], "bez scenariusza nic nie idzie do YOLO");

  stream.setScenario("standing");
  assert.deepEqual(sockets[0].sent, [{ type: "set_scenario", scenario: "standing" }]);

  runFrame(2000);
  const frame = sockets[0].sent[1];
  assert.equal(frame.type, "frame");
  assert.equal(frame.scenario, "standing");
  assert.equal(frame.image_base64, "A".repeat(40));

  sockets[0].receive({ type: "analysis", frame_id: frame.frame_id + 1, detected: true });
  sockets[0].receive({ type: "analysis", frame_id: frame.frame_id, detected: true, deviations: [] });
  assert.equal(analyses.length, 1, "wynik dla nieznanej klatki jest pomijany");

  stream.stop();
  assert.equal(sockets[0].readyState, 3);
});

test("YOLO: serwis nie odpowiada — start odrzucony, panel zostaje przy podglądzie", async () => {
  const { createYoloPoseStream } = await load();
  const { sockets } = installBrowser();
  const starting = createYoloPoseStream(video, { url: "ws://yolo/ws/analyze", onAnalysis() {} });
  sockets[0].onerror();
  await assert.rejects(starting, /Nie udało się połączyć/);
});
