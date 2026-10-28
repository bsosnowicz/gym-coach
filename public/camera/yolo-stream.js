// From yoga-startup (public/posture/yolo-stream.js); only yoloPoseWsUrl() changed.
//
// Klient streamingu do oddzielnego YOLO Pose backendu.
//
// Backend nie dostaje MediaStream bezpośrednio: przeglądarka co kilka klatek
// robi mały JPEG z <video> i wysyła go przez WebSocket. Taki kontrakt działa
// z osobnym serwerem/GPU bez WebRTC po naszej stronie i daje kontrolę nad FPS,
// rozdzielczością oraz backpressure.

const DEFAULT_FPS = 6;
const DEFAULT_MAX_WIDTH = 640;
const JPEG_QUALITY = 0.72;
const TELEMETRY_INTERVAL_MS = 5000;
const FRAME_RESPONSE_TIMEOUT_MS = 2000;
const RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_ATTEMPTS = 5;
const STABLE_CONNECTION_MS = 10000;

function imageDataUrlToBase64(dataUrl) {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function scaledSize(videoEl, maxWidth) {
  const sourceWidth = videoEl.videoWidth || 640;
  const sourceHeight = videoEl.videoHeight || 480;
  const width = Math.min(maxWidth, sourceWidth);
  const height = Math.round((sourceHeight / sourceWidth) * width);
  return { width, height };
}

// configured: YOLO_POSE_WS_URL from /api/config (this repo has no build-time
// VITE_* address and no localStorage override, unlike yoga-startup).
//
// A relative path ("/yolo/ws/analyze") means YOLO on the same host as the page,
// behind the same proxy: one build works under any domain. The scheme follows
// the page (https → wss), since a page over HTTPS may not open a plain ws://.
// Full addresses (ws://…, wss://…) pass through unchanged.
export function yoloPoseWsUrl(configured, location = window.location) {
  if (!configured || !configured.startsWith("/")) return configured || "";
  const url = new URL(configured, location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export async function createYoloPoseStream(videoEl, {
  url,
  fps = DEFAULT_FPS,
  maxWidth = DEFAULT_MAX_WIDTH,
  onAnalysis,
  onTelemetry = () => {},
  onStatus = () => {},
  onError = () => {},
} = {}) {
  if (!url) throw new Error("Brak URL WebSocket YOLO backendu.");

  const captureCanvas = document.createElement("canvas");
  const ctx = captureCanvas.getContext("2d", { alpha: false });
  const frameIntervalMs = 1000 / fps;

  let ws = null;
  let pendingSocket = null;
  let stopped = false;
  let activeScenario = null;
  let frameId = 0;
  let lastSentAt = -Infinity;
  let inFlight = false;
  let ready = false;
  let supportedScenarios = null;
  let pendingFrame = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let stableTimer = null;
  let telemetryWindowStartedAt = performance.now();
  let sentInWindow = 0;
  let receivedInWindow = 0;
  let droppedInWindow = 0;
  let latencyTotalMs = 0;
  let lastScore = null;
  let lastDeviationCount = 0;

  function handleMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (_) {
      return;
    }
    if (data.type === "ready") {
      ready = true;
      supportedScenarios = new Set(Array.isArray(data.scenarios) ? data.scenarios : []);
      onStatus(data);
      onTelemetry({
        type: "connected",
        url,
        scenario: data.scenario || null,
        model: data.model,
        scenarios: [...supportedScenarios],
        targetFps: fps,
        maxWidth,
      });
      // Reconnect: nowe gniazdo nie zna scenariusza, na którym stanęliśmy —
      // bez tego po odzyskaniu połączenia backend milczał, bo czekał na
      // set_scenario, którego nikt by już nie wysłał (zwykłe setTarget()
      // leci tylko przy zmianie ćwiczenia, nie przy reconnect w środku).
      if (activeScenario) sendScenario(activeScenario);
      return;
    }
    if (data.type === "analysis") {
      if (pendingFrame?.id !== data.frame_id) return;
      const latencyMs = performance.now() - pendingFrame.sentAt;
      inFlight = false;
      pendingFrame = null;
      receivedInWindow++;
      latencyTotalMs += latencyMs;
      lastScore = typeof data.score === "number" ? data.score : null;
      lastDeviationCount = Array.isArray(data.deviations) ? data.deviations.length : 0;
      onAnalysis(data);
      return;
    }
    if (data.type === "scenario_set") {
      activeScenario = data.scenario || null;
      return;
    }
    if (data.type === "error") {
      inFlight = false;
      pendingFrame = null;
      onError(new Error(data.error || "YOLO backend zwrócił błąd."));
    }
  }

  // Jedno gniazdo, jedna próba połączenia — wołane raz na starcie (przez
  // await niżej, więc niepowodzenie odrzuca całą fabrykę i panel zostaje
  // przy samym podglądzie) i ponownie z scheduleReconnect() po nieoczekiwanym
  // zamknięciu (wtedy niepowodzenie NIE ma dokąd się rozwiązać — fabryka już
  // dawno zwróciła swój obiekt — więc samo planuje kolejną próbę).
  function openSocket() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      // stop() woła ws?.close(), ale ws PRZYPISUJEMY dopiero w onopen niżej —
      // gdyby stop() padł w oknie MIĘDZY new WebSocket() a jego otwarciem
      // (np. reconnect w trakcie kończenia sesji), socket zostałby otwarty
      // i nigdy zamknięty: tick() go nie obsłuży (stopped już true), ale samo
      // połączenie z backendem wisiałoby, aż przeglądarka je kiedyś sprzątnie.
      // pendingSocket to jedyne miejsce, które o nim wie w tej chwili.
      pendingSocket = socket;
      let settled = false;
      socket.onopen = () => {
        if (stopped) {
          try { socket.close(); } catch (_) {}
          return;
        }
        settled = true;
        ws = socket;
        pendingSocket = null;
        ready = false;
        // Zerowanie licznika DOPIERO gdy połączenie przeżyje
        // STABLE_CONNECTION_MS bez padania — patrz komentarz przy stałej.
        clearTimeout(stableTimer);
        stableTimer = setTimeout(() => { reconnectAttempts = 0; }, STABLE_CONNECTION_MS);
        socket.onmessage = handleMessage;
        socket.onerror = () => onError(new Error("Połączenie z YOLO backendem zgłosiło błąd."));
        socket.onclose = () => {
          ready = false;
          inFlight = false;
          pendingFrame = null;
          clearTimeout(stableTimer);
          stableTimer = null;
          if (!stopped) scheduleReconnect();
        };
        resolve();
      };
      socket.onerror = () => {
        if (settled) return; // błąd PO otwarciu obsłuży już handler ustawiony w onopen
        settled = true;
        reject(new Error("Nie udało się połączyć z YOLO backendem."));
      };
    });
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      onError(new Error(`YOLO backend: połączenie zamknięte, wznowienie nieudane po ${MAX_RECONNECT_ATTEMPTS} próbach.`));
      return;
    }
    reconnectAttempts += 1;
    onTelemetry({ type: "reconnecting", attempt: reconnectAttempts, maxAttempts: MAX_RECONNECT_ATTEMPTS });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (stopped) return;
      openSocket().catch(() => scheduleReconnect());
    }, RECONNECT_DELAY_MS);
  }

  await openSocket();

  function sendScenario(scenario) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const nextScenario = scenario || null;
    activeScenario = nextScenario;
    if (!ready) {
      onTelemetry({ type: "scenario_pending", scenario: activeScenario });
      return;
    }
    if (nextScenario && supportedScenarios && !supportedScenarios.has(nextScenario)) {
      activeScenario = null;
      onTelemetry({
        type: "unsupported_scenario",
        scenario: nextScenario,
        scenarios: [...supportedScenarios],
      });
      return;
    }
    ws.send(JSON.stringify({ type: "set_scenario", scenario: activeScenario }));
    onTelemetry({ type: "scenario", scenario: activeScenario });
  }

  function flushTelemetry(now) {
    if (now - telemetryWindowStartedAt < TELEMETRY_INTERVAL_MS) return;
    const elapsedS = (now - telemetryWindowStartedAt) / 1000;
    onTelemetry({
      type: "stats",
      targetFps: fps,
      sentFps: sentInWindow / elapsedS,
      receivedFps: receivedInWindow / elapsedS,
      avgLatencyMs: receivedInWindow > 0 ? latencyTotalMs / receivedInWindow : null,
      dropped: droppedInWindow,
      inFlight,
      scenario: activeScenario,
      lastScore,
      lastDeviationCount,
    });
    telemetryWindowStartedAt = now;
    sentInWindow = 0;
    receivedInWindow = 0;
    droppedInWindow = 0;
    latencyTotalMs = 0;
  }

  function sendFrame(now) {
    if (!ready || !activeScenario || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (now - lastSentAt < frameIntervalMs) return;
    if (!videoEl.videoWidth || !videoEl.videoHeight) return;
    if (inFlight) {
      // pendingFrame.sentAt, nie lastSentAt: to drugie odświeża się na
      // każdym tym guardzie (linia niżej), więc mierzyłoby zawsze "przed
      // chwilą" i zegarek nigdy by nie wybił.
      if (pendingFrame && now - pendingFrame.sentAt >= FRAME_RESPONSE_TIMEOUT_MS) {
        inFlight = false;
        pendingFrame = null;
      } else {
        droppedInWindow++;
        lastSentAt = now;
        return;
      }
    }

    const { width, height } = scaledSize(videoEl, maxWidth);
    captureCanvas.width = width;
    captureCanvas.height = height;
    ctx.drawImage(videoEl, 0, 0, width, height);

    inFlight = true;
    lastSentAt = now;
    const id = ++frameId;
    pendingFrame = { id, sentAt: now };
    sentInWindow++;
    ws.send(JSON.stringify({
      type: "frame",
      frame_id: id,
      scenario: activeScenario,
      image_base64: imageDataUrlToBase64(captureCanvas.toDataURL("image/jpeg", JPEG_QUALITY)),
    }));
  }

  function tick(now) {
    if (stopped) return;
    flushTelemetry(now);
    sendFrame(now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    setScenario: sendScenario,
    stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      clearTimeout(stableTimer);
      stableTimer = null;
      onTelemetry({ type: "closed", scenario: activeScenario });
      try { ws?.close(); } catch (_) {}
      // Gniazdo w trakcie łączenia (reconnect, jeszcze bez onopen) — samo
      // onopen wyżej też sprawdza `stopped` i się zamknie, ale to zamyka je
      // NATYCHMIAST zamiast czekać, aż połączenie się dowiąże.
      try { pendingSocket?.close(); } catch (_) {}
    },
  };
}
