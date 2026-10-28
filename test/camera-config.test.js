// The optional camera module, server side: /api/config hands the YOLO address
// to the page, and only then do the headers let the page open the camera and
// reach the YOLO service.

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.YOLO_POSE_WS_URL = "ws://localhost:8000/ws/analyze";
const { server } = require("../server");

async function get(path) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return { res, body: await res.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Kamera: /api/config podaje adres YOLO, nagłówki wpuszczają kamerę i serwis YOLO", async () => {
  const { res, body } = await get("/api/config");

  assert.deepEqual(body, { camera: { yoloUrl: "ws://localhost:8000/ws/analyze" } });
  assert.match(res.headers.get("permissions-policy"), /camera=\(self\)/);
  assert.match(res.headers.get("permissions-policy"), /microphone=\(self\)/);
  assert.match(res.headers.get("content-security-policy"), /connect-src 'self' https: wss: ws:\/\/localhost:8000(;|$)/);
});

test("Kamera: bez YOLO_POSE_WS_URL kamera zostaje zablokowana", async () => {
  const { SECURITY_HEADERS } = require("../src/http/http-security");
  assert.match(SECURITY_HEADERS["Permissions-Policy"], /camera=\(\)/);
  assert.doesNotMatch(SECURITY_HEADERS["Content-Security-Policy"], /ws:\/\//);
});

test("Kamera: adres względny (ten sam host) nie dopisuje nic do connect-src", () => {
  const { applySecurityHeaders, enableCamera } = require("../src/http/http-security");
  enableCamera("/yolo/ws/analyze");
  const headers = {};
  applySecurityHeaders({ setHeader: (name, value) => { headers[name] = value; } });
  assert.match(headers["Content-Security-Policy"], /connect-src 'self' https: wss:(;|$)/);
  assert.match(headers["Permissions-Policy"], /camera=\(self\)/);
});
