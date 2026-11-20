// The camera panel: button, device choice, preview with an overlay of the
// body points. Loaded through lazy() only when /api/config gives a YOLO
// address — an app without a camera never fetches this code.
// The camera starts only from the button: the browser grants it on a gesture.
//
// YOLO is optional even here: when the service is down the panel keeps the
// bare preview and says so; the conversation does not depend on it.
//
// Deviations become short corrections by the avatar (correction-loop.js):
// only during a running session, in a pause of the conversation, never
// during a break, the end window or an avatar handover.
//
// Stage 05: the workout says which scenario watches the exercise now
// (workout.camera from src/coach/camera-scenarios.js). During a set the panel
// counts reps from that scenario's angle (rep-counter.js) and sends each new
// count to the server; a bare "gotowe" takes it as the result of the set.
import { useEffect, useRef, useState } from "react";
import { sendCamera, sendCue, sendReps } from "../../../public/api.js";
import { log } from "../../../public/ui/log.js";
import { createCamera, describeCameraError, listCameras } from "../../../public/camera/camera.js";
import { createCorrectionLoop } from "../../../public/camera/correction-loop.js";
import { createRepCounter } from "../../../public/camera/rep-counter.js";
import { clearSkeleton, drawSkeleton } from "../../../public/camera/skeleton.js";
import { createYoloPoseStream, yoloPoseWsUrl } from "../../../public/camera/yolo-stream.js";
import { CAMERA_TEXTS } from "./texts.js";

// The neutral scenario of yolo-backend, for when no exercise is on camera.
const DEFAULT_SCENARIO = "standing";

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

// session: from useSession(); the corrections go into its conversation.
// workout: the "workout" event of the coach ({ plan, progress, camera }) or null.
// showAngles: the measured angle, its lowest and highest in the set and the
// thresholds — for tuning a scenario on the camera test page.
export default function CameraPanel({ config, session, workout = null, showAngles = false, texts = {} }) {
  const t = { ...CAMERA_TEXTS, ...texts };
  const latest = useRef({ t, session, showAngles });
  latest.current = { t, session, showAngles };
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
  // Whether YOLO answers: only then does the coach ask where to put the camera.
  const [analysing, setAnalysing] = useState(false);
  const [reps, setReps] = useState(null);
  // { value, min, max } of the rep angle in this set (showAngles only).
  const [angle, setAngle] = useState(null);

  const target = workout?.camera || null;
  const scenario = target?.scenario || DEFAULT_SCENARIO;
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;
  const progress = workout?.progress;
  // One counter per set of an exercise on camera; a new set starts from zero.
  const setKey = target && progress?.phase === "set" ? `${scenario}:${progress.exerciseIndex}:${progress.setIndex}` : null;
  const counterRef = useRef(null);
  // Scenarios already reported as unknown to the YOLO service, so the log says it once.
  const staleRef = useRef(new Set());

  const loopRef = useRef(null);
  if (!loopRef.current) {
    loopRef.current = createCorrectionLoop({
      floor: session.floor,
      canSpeak: () => {
        const current = latest.current.session;
        return current.running && !current.hold && !current.reconnecting && !current.finishing;
      },
      onCue: (cue) => {
        const sessionId = latest.current.session.sessionId();
        if (!sessionId) return;
        sendCue(sessionId, cue)
          .then(({ spoken, reason }) => log(spoken ? `Kamera: korekta „${cue.deviation}” powiedziana.` : `Kamera: korekta „${cue.deviation}” pominięta (${reason}).`))
          .catch((error) => log(`Kamera: korekta nie doszła (${error.message}).`));
      },
      log,
    });
  }

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
    setAnalysing(false);
    loopRef.current.reset();
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

  // The exercise changed; a connection made later takes scenarioRef by itself.
  useEffect(() => {
    if (!yoloRef.current) return;
    yoloRef.current.setScenario(scenario);
    loopRef.current.setScenario(scenario);
  }, [scenario]);

  useEffect(() => {
    counterRef.current = setKey
      ? { scenario, rule: target.rep.rule, exerciseIndex: progress.exerciseIndex, setIndex: progress.setIndex, counter: createRepCounter(target.rep) }
      : null;
    setReps(setKey ? 0 : null);
    setAngle(null);
  }, [setKey]);

  // The coach hears when the analysis starts or stops, also for a session started after the camera.
  useEffect(() => {
    if (session.running && session.sessionId()) sendCamera(session.sessionId(), analysing);
  }, [analysing, session.running]);

  function trackAngle(analysis, current) {
    const measured = analysis.measurements?.find((item) => item.id === current.rule);
    if (!measured?.visible || typeof measured.value !== "number") {
      setAngle((old) => (old ? { ...old, value: null } : old));
      return;
    }
    const value = measured.value;
    setAngle((old) => ({ value, min: Math.min(old?.min ?? value, value), max: Math.max(old?.max ?? value, value) }));
  }

  function countReps(analysis) {
    const current = counterRef.current;
    if (!current || analysis.scenario !== current.scenario) return;
    if (latest.current.showAngles) trackAngle(analysis, current);
    const unknown = current.counter.unknownGates(analysis);
    if (unknown.length && !staleRef.current.has(current.scenario)) {
      staleRef.current.add(current.scenario);
      log(latest.current.t.staleYolo(current.scenario, unknown));
    }
    if (!current.counter.handle(analysis)) return;
    const count = current.counter.count;
    setReps(count);
    const sessionId = latest.current.session.sessionId();
    if (sessionId) sendReps(sessionId, { count, exerciseIndex: current.exerciseIndex, setIndex: current.setIndex });
  }

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
          loopRef.current.handleAnalysis(analysis);
          countReps(analysis);
        },
        onTelemetry: (stats) => {
          const line = describeTelemetry(stats);
          if (line) log(line);
        },
        onError: (error) => {
          log(`YOLO: ${error.message}`);
          // Only the final give-up after the reconnect attempts means the analysis is gone.
          if (epoch === epochRef.current && /wznowienie nieudane/.test(error.message)) {
            setAnalysing(false);
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
      stream.setScenario(scenarioRef.current);
      loopRef.current.setScenario(scenarioRef.current);
      setAnalysing(true);
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
      {analysing && target && (
        <p className="camera-reps" aria-live="polite">
          {`${t.view(target.view)}${reps === null ? "" : ` · ${t.reps(reps)}`}`}
        </p>
      )}
      {showAngles && analysing && target && (
        <p className="camera-angles">
          {t.angles({ name: target.angle || target.rep.rule, ...angle, low: target.rep.low, high: target.rep.high })}
        </p>
      )}
    </section>
  );
}
