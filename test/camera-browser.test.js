// Browser parts of the optional camera module (public/camera/), without a
// camera: the device list, the error messages and the skeleton geometry.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = (name) => import(`../public/camera/${name}.js`);

test("Kamera: lista zawiera tylko kamery, bez nazw przed zgodą dostaje numery", async () => {
  const { listCameras } = await load("camera");
  const mediaDevices = {
    enumerateDevices: async () => [
      { kind: "audioinput", deviceId: "mic", label: "Mikrofon" },
      { kind: "videoinput", deviceId: "a", label: "" },
      { kind: "videoinput", deviceId: "b", label: "Kamera USB" },
    ],
  };
  assert.deepEqual(await listCameras(mediaDevices), [
    { id: "a", label: "Kamera 1" },
    { id: "b", label: "Kamera USB" },
  ]);
});

test("Kamera: wybrane urządzenie idzie do getUserMedia, stop() zatrzymuje ścieżki", async () => {
  const { createCamera } = await load("camera");
  const requests = [];
  const stopped = [];
  const stream = { getTracks: () => [{ stop: () => stopped.push("video") }] };
  const video = { srcObject: null, videoWidth: 640, videoHeight: 480, play: async () => {} };
  const camera = createCamera(video, { mediaDevices: { getUserMedia: async (constraints) => { requests.push(constraints); return stream; } } });

  assert.deepEqual(await camera.start("b"), { width: 640, height: 480 });
  assert.deepEqual(requests, [{ video: { deviceId: { exact: "b" } } }]);
  assert.equal(video.srcObject, stream);
  assert.ok(camera.isRunning());

  camera.stop();
  assert.deepEqual(stopped, ["video"]);
  assert.equal(video.srcObject, null);
  assert.ok(!camera.isRunning());
});

test("Kamera: błędy przeglądarki mają zrozumiały opis", async () => {
  const { describeCameraError } = await load("camera");
  assert.match(describeCameraError({ name: "NotAllowedError" }), /zgody/);
  assert.match(describeCameraError({ name: "NotReadableError" }), /zajęta/);
  assert.equal(describeCameraError({ name: "Other", message: "x" }), "x");
});

test("Szkielet: rysuje tylko pewne punkty i odcinki między nimi, w pikselach klatki", async () => {
  const { skeletonGeometry } = await load("skeleton");
  const { lines, points } = skeletonGeometry([
    { name: "left_shoulder", x: 0.4, y: 0.25, confidence: 0.9 },
    { name: "right_shoulder", x: 0.6, y: 0.25, confidence: 0.9 },
    { name: "left_hip", x: 0.4, y: 0.5, confidence: 0.1 },
  ], { width: 640, height: 480 });

  assert.equal(points.length, 2);
  assert.deepEqual(lines, [[{ x: 256, y: 120 }, { x: 384, y: 120 }]]);
});
