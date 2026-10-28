// Panel kamery: przycisk, wybór urządzenia, podgląd z nakładką na punkty
// sylwetki. Ładowany przez lazy() tylko wtedy, gdy /api/config podaje adres
// YOLO — aplikacja bez kamery nie pobiera tego kodu wcale.
// Kamera rusza wyłącznie z przycisku: zgoda przeglądarki przychodzi na gest.
import { useEffect, useRef, useState } from "react";
import { log } from "../../../public/ui/log.js";
import { createCamera, describeCameraError, listCameras } from "../../../public/camera/camera.js";
import { clearSkeleton } from "../../../public/camera/skeleton.js";
import { CAMERA_TEXTS } from "./texts.js";

export default function CameraPanel({ config, texts = {} }) {
  const t = { ...CAMERA_TEXTS, ...texts };
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
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

  useEffect(() => {
    cameraRef.current = createCamera(videoRef.current);
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      cameraRef.current.stop();
    };
  }, []);

  async function enable(id = deviceId) {
    setState("starting");
    setMessage(t.starting);
    try {
      log("Kamera: proszę o dostęp…");
      const { width, height } = await cameraRef.current.start(id);
      // Natywna rozdzielczość klatki: punkty z YOLO są znormalizowane do niej.
      canvasRef.current.width = width;
      canvasRef.current.height = height;
      await refreshDevices();
      setState("on");
      setMessage(t.on);
      log(`Kamera: włączona (${width}×${height}).`);
    } catch (error) {
      cameraRef.current.stop();
      setState("off");
      setMessage(t.failed(describeCameraError(error)));
      log(`Kamera: błąd (${error.name || "?"}): ${describeCameraError(error)}`);
    }
  }

  function disable() {
    cameraRef.current.stop();
    clearSkeleton(canvasRef.current.getContext("2d"));
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
