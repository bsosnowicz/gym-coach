// The camera panel: button, device choice, preview with an overlay of the
// body points. Loaded through lazy() only when /api/config gives a YOLO
// address — an app without a camera never fetches this code.
// The camera starts only from the button: the browser grants it on a gesture.
//
// YOLO is optional even here: when the service is down the panel keeps the
// bare preview and says so; the conversation does not depend on it.
import { useEffect, useRef, useState } from "react";
import { log } from "../../../public/ui/log.js";
import { createCamera, describeCameraError, listCameras } from "../../../public/camera/camera.js";
import { clearSkeleton, drawSkeleton } from "../../../public/camera/skeleton.js";
import { createYoloPoseStream, yoloPoseWsUrl } from "../../../public/camera/yolo-stream.js";
import { CAMERA_TEXTS } from "./texts.js";

// The neutral scenario of yolo-backend; exercises come with stages 05–06.
const SCENARIO = "standing";

function describeTelemetry(stats) {
  if (stats.type === "connected") return `YOLO: połączono (${stats.model}, ${stats.targetFps} FPS, max ${stats.maxWidth}px).`;
  if (stats.type === "reconnecting") return `YOLO: ponowne łączenie ${stats.attempt}/${stats.maxAttempts}…`;
  if (stats.type === "unsupported_scenario") return `YOLO: serwis nie zna scenariusza „${stats.scenario}” (ma: ${stats.scenarios.join(", ")}).`;
  if (stats.type === "stats") {
    const latency = stats.avgLatencyMs === null ? "?" : `${Math.round(stats.avgLatencyMs)} ms`;
    return `YOLO: wysyłka ${stats.sentFps.toFixed(1)} FPS, odbiór ${stats.receivedFps.toFixed(1)} FPS, opóźnienie ${latency}, pominięte ${stats.dropped}.`;
  }
  return null;
}

// What the status line says about one analysed frame.
function describeAnalysis(analysis, t) {
  if (!analysis.detected) return t.noPerson;
  const deviation = analysis.deviations?.[0];
  return deviation ? t.deviation(deviation.label || deviation.id) : t.postureOk;
}

// onAnalysis(analysis): every result from YOLO, for the correction loop.
export default function CameraPanel({ config, texts = {}, onAnalysis = () => {} }) {
  const t = { ...CAMERA_TEXTS, ...texts };
  const latest = useRef({ t, onAnalysis });
  latest.current = { t, onAnalysis };
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const yoloRef = useRef(null);
  // Bumped on every start and stop: a slow YOLO connection from an earlier
  // start must not attach itself to a camera that was switched off since.
  const epochRef = useRef(0);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  // "off" | "starting" | "on"
  const [state, setState] = useState("off");
  const [message, setMessage] = useState(t.off);

  async function refreshDevices() {
    try {
      setDevices(await listCameras());
    } catch (error) {
      log(`Kamera: lista urządzeń niedostępna (${error.message}).`);
    }
  }

  function stopYolo() {
    yoloRef.current?.stop();
    yoloRef.current = null;
    if (canvasRef.current) clearSkeleton(canvasRef.current.getContext("2d"));
  }

  useEffect(() => {
    cameraRef.current = createCamera(videoRef.current);
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      epochRef.current += 1;
      stopYolo();
      cameraRef.current.stop();
    };
  }, []);

  async function connectYolo(epoch) {
    const ctx = canvasRef.current.getContext("2d");
    setMessage(t.connecting);
    try {
      const stream = await createYoloPoseStream(videoRef.current, {
        url: yoloPoseWsUrl(config.yoloUrl),
        onAnalysis: (analysis) => {
          if (epoch !== epochRef.current) return;
          if (analysis.detected) drawSkeleton(ctx, analysis.person?.keypoints, { issue: analysis.deviations?.length > 0 });
          else clearSkeleton(ctx);
          setMessage(describeAnalysis(analysis, latest.current.t));
          latest.current.onAnalysis(analysis);
        },
        onTelemetry: (stats) => {
          const line = describeTelemetry(stats);
          if (line) log(line);
        },
        onError: (error) => {
          log(`YOLO: ${error.message}`);
          // Only the final give-up after the reconnect attempts means the analysis is gone.
          if (epoch === epochRef.current && /wznowienie nieudane/.test(error.message)) {
            clearSkeleton(ctx);
            setMessage(latest.current.t.yoloLost);
          }
        },
      });
      if (epoch !== epochRef.current) {
        stream.stop();
        return;
      }
      yoloRef.current = stream;
      stream.setScenario(SCENARIO);
      setMessage(t.analysing);
    } catch (error) {
      if (epoch !== epochRef.current) return;
      log(`YOLO niedostępny (${error.message}) — sam podgląd kamery.`);
      setMessage(t.yoloUnavailable);
    }
  }

  async function enable(id = deviceId) {
    const epoch = ++epochRef.current;
    stopYolo();
    setState("starting");
    setMessage(t.starting);
    try {
      log("Kamera: proszę o dostęp…");
      const { width, height } = await cameraRef.current.start(id);
      if (epoch !== epochRef.current) return;
      // The native frame size: YOLO points are normalised to it.
      canvasRef.current.width = width;
      canvasRef.current.height = height;
      await refreshDevices();
      setState("on");
      log(`Kamera: włączona (${width}×${height}).`);
      connectYolo(epoch);
    } catch (error) {
      if (epoch !== epochRef.current) return;
      cameraRef.current.stop();
      setState("off");
      setMessage(t.failed(describeCameraError(error)));
      log(`Kamera: błąd (${error.name || "?"}): ${describeCameraError(error)}`);
    }
  }

  function disable() {
    epochRef.current += 1;
    stopYolo();
    cameraRef.current.stop();
    setState("off");
    setMessage(t.off);
    log("Kamera: wyłączona.");
  }

  function chooseDevice(id) {
    setDeviceId(id);
    if (state === "on") enable(id);
  }

  return (
    <section className="camera" aria-label={t.title}>
      <div className="camera-view" hidden={state === "off"}>
        <video ref={videoRef} muted playsInline />
        <canvas ref={canvasRef} />
      </div>
      <div className="camera-controls">
        <button
          type="button"
          className="btn"
          aria-pressed={state === "on"}
          disabled={state === "starting"}
          onClick={state === "on" ? disable : () => enable()}
        >
          {state === "on" ? t.disable : t.enable}
        </button>
        <label className="camera-device">
          <span>{t.deviceLabel}</span>
          <select value={deviceId} onChange={(event) => chooseDevice(event.target.value)} disabled={state === "starting"}>
            <option value="">{t.defaultDevice}</option>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
          </select>
        </label>
      </div>
      <p className="hint camera-status" role="status">{message}</p>
    </section>
  );
}
