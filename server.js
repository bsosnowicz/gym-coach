// Entry point: loads .env, wires adapters into the engine, serves the page.
//
// There are no accounts. identify() is the single place to plug authentication
// in; until then the server is meant for local use only (see HOST below).

const http = require("http");
const path = require("path");
const fs = require("fs");

// Before any module that reads process.env.
const { loadEnvFile, requireEnv, envNumber } = require("./src/config");
loadEnvFile();

const {
  HttpError,
  applySecurityHeaders,
  enableCamera,
  createFixedWindowRateLimiter,
  readJsonBody,
  readRawBody,
  sendError,
  sendJson,
} = require("./src/http/http-security");
const { browserReport } = require("./src/http/browser-report");
const engine = require("./src/engine");
const { providerFailure } = require("./src/engine/provider-failure");
const { createLlm } = require("./src/adapters/llm/chat-completions");
const { llmConfig } = require("./src/adapters/llm/providers");
const { createElevenLabsTts } = require("./src/adapters/tts/elevenlabs");
const { createGroqWhisperStt } = require("./src/adapters/stt/groq-whisper");
const { createLiveAvatarLite } = require("./src/adapters/avatar/liveavatar-lite");
const { createCoach, holdPainDuringBreak } = require("./src/coach");
const { createCueSpeaker } = require("./src/coach/cues");
const { createInjuryStore } = require("./src/coach/injury-store");
const { createWorkoutLog } = require("./src/coach/workout-log");
const { diffUsage, usageLine } = require("./src/usage");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = envNumber("PORT", 3001);
const MAX_AUDIO_BODY_BYTES = 10 * 1024 * 1024;
// Model calls started by the coach may finish after the close.
const USAGE_LOG_DELAY_MS = 10000;
// A proxy (nginx) drops a stream silent for 60 s; the stream is quiet during
// a break or the end window, and events sent while the browser reconnects are lost.
const SSE_HEARTBEAT_MS = 20000;
// Optional camera module: empty = no camera, the app is the conversation alone.
// The browser connects to YOLO itself; this server only passes the address on.
const YOLO_POSE_WS_URL = (process.env.YOLO_POSE_WS_URL || "").trim();
if (YOLO_POSE_WS_URL) enableCamera(YOLO_POSE_WS_URL);

// Injuries kept between sessions (Supabase); null without SUPABASE_* — the session
// still adapts to what the user says, it is just not remembered.
const supabaseConfig = {
  url: process.env.SUPABASE_URL,
  // SUPABASE_SECRET_KEY is the current name (sb_secret_…), as in yoga-startup;
  // SUPABASE_SERVICE_ROLE_KEY takes the older service_role JWT.
  serviceKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  userId: process.env.GYM_COACH_USER_ID || "local",
};
const injuries = createInjuryStore(supabaseConfig);
const workoutLog = createWorkoutLog(supabaseConfig);
// Said once at start: without it a missing key looked exactly like a working database.
console.log(injuries
  ? `Supabase: zapis włączony (${new URL(supabaseConfig.url).host}, użytkownik „${supabaseConfig.userId}”).`
  : `Supabase: wyłączony — brak ${supabaseConfig.url ? "SUPABASE_SECRET_KEY" : "SUPABASE_URL"} w .env; kontuzje i dziennik nie są zapisywane.`);

// Break and end of the session (voice and buttons) wrap the app's coach;
// texts can be passed here to fit the app ("trening", "lekcja").
const coach = holdPainDuringBreak(engine.withSessionControl(createCoach({ voiceId: process.env.ELEVENLABS_VOICE_ID, injuries, workoutLog }), {
  texts: {
    pause: "Dobrze, robimy przerwę w treningu. Powiedz, kiedy chcesz kontynuować.",
    farewell: "Dzięki za wspólną rozmowę o treningu. Do zobaczenia!",
  },
}));

// Built on first use, so the server starts (and says what is missing) even
// with an incomplete .env.
let adapters = null;
function getAdapters() {
  if (adapters) return adapters;
  requireEnv("GEMINI_API_KEY");
  requireEnv("ELEVENLABS_VOICE_ID");
  adapters = {
    llm: createLlm({
      primary: llmConfig("gemini"),
      // Exists only when GROQ_API_KEY is set.
      fallback: llmConfig("groq"),
      hedgeDelayMs: envNumber("LLM_HEDGE_DELAY_MS", 2500),
    }),
    tts: createElevenLabsTts({
      apiKey: requireEnv("ELEVENLABS_API_KEY"),
      modelId: process.env.ELEVENLABS_MODEL_ID || undefined,
    }),
    stt: createGroqWhisperStt({
      apiKey: requireEnv("GROQ_API_KEY"),
      model: process.env.GROQ_STT_MODEL || undefined,
      timeoutMs: envNumber("STT_TIMEOUT_MS", 15000),
    }),
    avatar: createLiveAvatarLite({
      apiKey: requireEnv("LIVEAVATAR_API_KEY"),
      avatarId: process.env.LIVEAVATAR_AVATAR_ID || null,
      // Sandbox unless explicitly switched off.
      sandbox: process.env.LIVEAVATAR_SANDBOX !== "false",
      videoQuality: process.env.LIVEAVATAR_VIDEO_QUALITY || "medium",
      sessionLimitS: envNumber("LIVEAVATAR_SESSION_LIMIT_S", 0),
    }),
  };
  return adapters;
}

// Counters of the paid services since the process started (see src/usage.js).
function usageSnapshot() {
  const { llm, tts, stt } = getAdapters();
  return { llm: llm.usage(), tts: tts.usage(), stt: stt.usage() };
}

function identify(_req) {
  return { id: "local" };
}

const sessionStartRateLimit = createFixedWindowRateLimiter({ limit: 10, windowMs: 60000 });
const sttRateLimit = createFixedWindowRateLimiter({ limit: 60, windowMs: 60000 });
const turnRateLimit = createFixedWindowRateLimiter({ limit: 60, windowMs: 60000 });
const reportRateLimit = createFixedWindowRateLimiter({ limit: 120, windowMs: 60000 });
const cueRateLimit = createFixedWindowRateLimiter({ limit: 30, windowMs: 60000 });
const cues = createCueSpeaker({ speakText: engine.speakText, record: engine.record });

function requireShortText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new HttpError(`Pole "${label}" jest wymagane (maks. ${maxLength} znaków).`, 400);
  }
  return value.trim();
}

function ownedSession(sessionId, user) {
  const session = engine.getSession(requireShortText(sessionId, "sessionId", 256));
  if (!session || session.userId !== user.id) throw new HttpError("Nieznana sesja.", 404);
  return session;
}

// No event stream for CLIENT_GONE_AFTER_MS: the browser is gone (src/engine/session-watchdog.js).
function closeAbandonedSession(session) {
  console.warn(`Sesja ${session.id}: przeglądarka nie słucha od ${engine.CLIENT_GONE_AFTER_MS / 60000} min — zamykam sesję.`);
  engine.record(session, "session.client_gone", {});
  return engine.endSession(session);
}

const ROUTES = {
  // What the page needs before a session; camera: null keeps the camera module unloaded.
  "GET /api/config": async (_req, res) => {
    sendJson(res, 200, { camera: YOLO_POSE_WS_URL ? { yoloUrl: YOLO_POSE_WS_URL } : null });
  },

  "POST /api/session/start": async (_req, res, user) => {
    sessionStartRateLimit(user.id);
    const usageAtStart = usageSnapshot();
    const { llm, tts, avatar } = getAdapters();
    const session = await engine.startConversation({
      userId: user.id,
      llm,
      tts,
      avatar,
      coach,
      // Read before the greeting, so the plan and the first question already know them.
      setup: await (async () => {
        const [active, history] = await Promise.all([injuries?.active() ?? [], workoutLog?.recent() ?? []]);
        return { injuries: active, history };
      })(),
      options: {
        firstTokenTimeoutMs: envNumber("LLM_FIRST_TOKEN_TIMEOUT_MS", 8000),
        turnTimeoutMs: envNumber("TURN_TIMEOUT_MS", 31100),
      },
    });
    session.usageAtStart = usageAtStart;
    // Counts from the start: a browser that got the token and vanished before
    // opening the event stream must not leave the session running.
    engine.clientDetached(session, closeAbandonedSession);
    sendJson(res, 200, { sessionId: session.id, ...session.avatar.client });
  },

  // Server-Sent Events: pipeline progress and transcripts for the browser.
  "GET /api/session/events": async (req, res, user, url) => {
    const session = ownedSession(url.searchParams.get("sessionId"), user);
    applySecurityHeaders(res);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");
    session.sseClients.add(res);
    engine.clientAttached(session);
    if (session.providerFailurePayload) res.write(`data: ${JSON.stringify(session.providerFailurePayload)}\n\n`);
    const handover = session.handover.snapshot();
    if (handover) res.write(`data: ${JSON.stringify(handover)}\n\n`);
    // The app's own state (the workout) for a page that joins or rejoins the stream.
    const domain = session.coach.workoutEvent?.(session);
    if (domain) res.write(`data: ${JSON.stringify(domain)}\n\n`);
    const heartbeat = setInterval(() => {
      if (res.writableEnded || res.destroyed) return clearInterval(heartbeat);
      res.write(": ping\n\n");
    }, SSE_HEARTBEAT_MS);
    req.on("close", () => {
      clearInterval(heartbeat);
      session.sseClients.delete(res);
      engine.clientDetached(session, closeAbandonedSession);
    });
  },

  "POST /api/stt": async (req, res, user) => {
    sttRateLimit(user.id);
    const session = ownedSession(req.headers["x-session-id"], user);
    const speech = session.coach.speech(session);
    const audio = await readRawBody(req, MAX_AUDIO_BODY_BYTES);
    const { text } = await getAdapters().stt.transcribe({
      audio,
      contentType: req.headers["content-type"] || "audio/webm",
      language: speech.sttLanguage,
      candidates: speech.sttCandidates,
      expected: speech.sttExpected,
      hallucinations: speech.sttHallucinations,
    });
    sendJson(res, 200, { text });
  },

  "POST /api/session/turn": async (req, res, user) => {
    turnRateLimit(user.id);
    const body = await readJsonBody(req);
    const session = ownedSession(body.sessionId, user);
    const text = requireShortText(body.text, "text", 4000);
    // The reply travels over SSE and the avatar, not over this response.
    sendJson(res, 202, { ok: true });
    engine.runTurn(session, text);
  },

  "POST /api/session/interrupt": async (req, res, user) => {
    const body = await readJsonBody(req);
    sendJson(res, 200, engine.interruptTurn(ownedSession(body.sessionId, user)));
  },

  "POST /api/session/resume": async (req, res, user) => {
    const body = await readJsonBody(req);
    sendJson(res, 200, engine.resumeTurn(ownedSession(body.sessionId, user)));
  },

  // The Pause button: the same break as after "zróbmy przerwę", confirmed at once.
  "POST /api/session/pause": async (req, res, user) => {
    const body = await readJsonBody(req);
    const session = ownedSession(body.sessionId, user);
    if (!session.handover.active) await engine.stopSpeaking(session);
    sendJson(res, 200, { ok: true, paused: coach.requestPause(session, { source: "button", confirmNow: true }) });
  },

  // The Stop button: the avatar goes quiet and the page asks whether to end, as after "kończymy".
  "POST /api/session/ask-end": async (req, res, user) => {
    const body = await readJsonBody(req);
    const session = ownedSession(body.sessionId, user);
    coach.requestEnd(session, { source: "button" });
    if (!session.handover.active) await engine.stopSpeaking(session);
    sendJson(res, 200, { ok: true });
  },

  // Back from a break or from the end window; the session knows which.
  "POST /api/session/continue": async (req, res, user) => {
    const body = await readJsonBody(req);
    sendJson(res, 200, { ok: true, resumed: coach.continueSession(ownedSession(body.sessionId, user), { source: "button" }) });
  },

  // The end is confirmed. Answers once the goodbye is said: closing the session
  // (/api/session/end) stops the avatar, which would cut it off.
  "POST /api/session/finish": async (req, res, user) => {
    const body = await readJsonBody(req);
    const session = ownedSession(body.sessionId, user);
    if (session.handover.active) await engine.endSession(session);
    else await coach.farewell(session, { source: "button" });
    sendJson(res, 200, { ok: true });
  },

  // A posture correction the page saw on the camera; the text is the scenario's own (src/coach/cues.js).
  "POST /api/session/cue": async (req, res, user) => {
    cueRateLimit(user.id);
    const body = await readJsonBody(req);
    const session = ownedSession(body.sessionId, user);
    const result = await cues.speak(session, {
      scenario: requireShortText(body.scenario, "scenario", 64),
      deviation: requireShortText(body.deviation, "deviation", 64),
    });
    sendJson(res, 200, result);
  },

  "POST /api/session/handover-ready": async (req, res, user) => {
    const body = await readJsonBody(req);
    const session = ownedSession(body.sessionId, user);
    sendJson(res, 200, { ok: session.handover.ready(body.handoverId) });
  },

  // What only the browser knows (e.g. a hanging microphone) goes to the session recorder.
  "POST /api/session/report": async (req, res, user) => {
    reportRateLimit(user.id);
    const body = await readJsonBody(req);
    const session = ownedSession(body.sessionId, user);
    const { action, details } = browserReport(body);
    engine.record(session, `browser.${action}`, details);
    sendJson(res, 200, { ok: true });
  },

  "POST /api/session/end": async (req, res, user) => {
    const body = await readJsonBody(req);
    const session = ownedSession(body.sessionId, user);
    await engine.endSession(session);
    sendJson(res, 200, { ok: true });
    const minutes = (Date.now() - Date.parse(session.startedAt)) / 60000;
    setTimeout(() => {
      console.log(`Sesja ${session.id}: zużycie — ${usageLine(diffUsage(session.usageAtStart, usageSnapshot()), minutes)}`);
    }, USAGE_LOG_DELAY_MS);
  },
};

const PUBLIC_ROOT = path.join(__dirname, "public");
// The page is the React app, built by `npm run build:web` into public/app.
const APP_ENTRY = path.join(PUBLIC_ROOT, "app", "index.html");
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

function serveStatic(pathname, res) {
  const servedPath = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const filePath = path.resolve(PUBLIC_ROOT, `.${servedPath}`);
  applySecurityHeaders(res);
  if (!filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "text/plain; charset=utf-8" });
    res.end(content);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  const route = ROUTES[`${req.method} ${url.pathname}`];
  if (!route) {
    // The browser keeps the #fragment of an old link across the redirect.
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(302, { Location: "/app/" });
      return res.end();
    }
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) return serveStatic(url.pathname, res);
    return sendJson(res, 404, { error: "Nie znaleziono." });
  }
  try {
    await route(req, res, identify(req), url);
  } catch (error) {
    console.error(`${req.method} ${url.pathname}: ${error.message}`);
    if (res.headersSent) return res.destroy();
    // A missing key or an unreachable provider is a 503 with a safe message, not a stack trace.
    const exposed = error.statusCode ? error : providerFailure("avatar", error);
    sendError(res, exposed);
  }
}

const server = http.createServer(handleRequest);

// Docker sends SIGTERM and kills the process 10 s later; Ctrl+C is SIGINT.
// A second signal falls back to Node's default and exits at once.
const SHUTDOWN_BUDGET_MS = 8000;

async function shutdownGracefully(signal) {
  console.log(`${signal}: zatrzymuję serwer, zamykam sesje awatara…`);
  const closed = await engine.closeAllSessions({ signal, budgetMs: SHUTDOWN_BUDGET_MS });
  console.log(`Zamknięte sesje: ${closed}.`);
  process.exit(0);
}

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Gym Coach: http://${HOST}:${PORT}`);
    if (!fs.existsSync(APP_ENTRY)) console.warn("Brak zbudowanej strony (public/app): uruchom npm run build:web.");
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      shutdownGracefully(signal).catch((error) => {
        console.error(`Zatrzymanie serwera: ${error.message}`);
        process.exit(1);
      });
    });
  }
}

module.exports = { server };
