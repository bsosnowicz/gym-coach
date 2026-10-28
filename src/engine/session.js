// A live conversation: transport handles, history and the turn lock. Domain
// state lives in session.coachState, which the engine never reads.

const { createMemoryRecorder } = require("./recorder");
const { createMarkerStripper } = require("./markers");
const { createAvatarHandover } = require("./avatar-handover");

// A window, not the whole conversation: the system prompt carries everything
// durable. Long enough that the coach does not re-ask what was said two exchanges ago.
const HISTORY_MAX_MESSAGES = 12;

const DEFAULT_OPTIONS = {
  // How long to wait for the FIRST token (and between tokens) before giving the turn up.
  firstTokenTimeoutMs: 8000,
  turnTimeoutMs: 31100,
  speakEndTimeoutMs: 20000,
  // How long a paused reply waits to learn whether the sound was speech.
  holdTimeoutMs: 8000,
};

const sessions = new Map();

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function emit(session, payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of session.sseClients) {
    try { res.write(line); } catch (_) { session.sseClients.delete(res); }
  }
}

// Recording must never break a turn.
function record(session, type, payload = {}) {
  try {
    session.recorder.record(session, type, payload);
  } catch (error) {
    console.warn(`Sesja ${session.id}: rejestrator odrzucił zdarzenie ${type} — ${error.message}`);
  }
}

function trimHistory(session) {
  const excess = session.history.length - HISTORY_MAX_MESSAGES;
  if (excess > 0) session.history.splice(0, excess);
}

// Reopens the TTS connection when it dropped or when the coach now wants a
// different voice or language (e.g. after a direction change).
async function ensureTts(session) {
  const speech = session.coach.speech(session);
  const current = session.ttsConnection;
  if (current?.isOpen() && current.key === session.tts.keyFor(speech)) return current;
  current?.close();
  session.ttsConnection = await session.tts.open(speech);
  return session.ttsConnection;
}

// One live session per user. The UI runs a single session, but nothing else
// guarantees the browser calls "end"; a forgotten session keeps a paid avatar
// alive and blocks the provider's one-session limit.
async function endSessionsOf(userId) {
  for (const session of [...sessions.values()].filter((item) => item.userId === userId)) {
    console.warn(`Sesja ${session.id}: zamykam poprzednią sesję tego użytkownika przed startem nowej.`);
    await endSession(session).catch((error) => console.warn(`Sesja ${session.id}: nie udało się domknąć — ${error.message}`));
  }
}

async function startSession({ userId, llm, tts, avatar, coach, recorder = createMemoryRecorder(), setup = {}, options = {} }) {
  await endSessionsOf(userId);

  const session = {
    id: null,
    userId,
    llm,
    tts,
    coach,
    recorder,
    options: { ...DEFAULT_OPTIONS, ...options },
    markers: createMarkerStripper(coach.markers),
    coachState: coach.createState(setup),
    history: [],
    sseClients: new Set(),
    avatar: null,
    avatarSpeaking: false,
    directSpeechInFlight: 0,
    ttsConnection: null,
    turnInFlight: false,
    activeTurn: null,
    activeTurnAbort: null,
    // Set by the running turn once it has audio to pause; see interruptTurn.
    activeTurnHold: null,
    activeTurnResume: null,
    turnHeld: false,
    // When the avatar began its current stretch of speech (performance.now()).
    speakStartedAt: null,
    // Until the greeting has been spoken, user turns are rejected and barge-in is ignored.
    greetingDone: false,
    closed: false,
    onSpeakEnded: null,
    turnStartedAt: performance.now(),
    // Kept so a client that connects to the event stream late still learns about a failure.
    providerFailurePayload: null,
    lastSpokenText: null,
    speechEpoch: 0,
    greetingTimer: null,
    startedAt: new Date().toISOString(),
  };

  const sinceTurnStart = () => Math.round(performance.now() - session.turnStartedAt);
  let avatarGeneration = 0;
  const openAvatar = () => {
    const generation = ++avatarGeneration;
    return avatar.start({
      onSpeakStarted: () => {
        if (session.closed || generation !== avatarGeneration) return;
        session.avatarSpeaking = true;
        session.speakStartedAt = performance.now();
        emit(session, { stage: "avatar_speak_started", ms: sinceTurnStart() });
      },
      onSpeakEnded: () => {
        if (session.closed || generation !== avatarGeneration) return;
        session.avatarSpeaking = false;
        emit(session, { stage: "avatar_speak_ended", ms: sinceTurnStart() });
        // An "ended" with no "started" before it belongs to speech cut off by an earlier pause.
        if (session.speakStartedAt === null) return;
        const done = session.onSpeakEnded;
        session.onSpeakEnded = null;
        done?.();
      },
    });
  };
  const [avatarResult, ttsResult] = await Promise.allSettled([
    openAvatar(),
    tts.open(coach.speech(session)),
  ]);
  if (avatarResult.status === "rejected" || ttsResult.status === "rejected") {
    if (avatarResult.status === "fulfilled") await avatarResult.value.stop().catch(() => {});
    if (ttsResult.status === "fulfilled") ttsResult.value.close();
    throw avatarResult.reason || ttsResult.reason;
  }

  session.avatar = avatarResult.value;
  session.ttsConnection = ttsResult.value;
  session.id = session.avatar.sessionId;
  sessions.set(session.id, session);
  session.handover = createAvatarHandover(session, {
    openAvatar, stopSpeaking: (...args) => require("./turn").stopSpeaking(...args), emit, record, endSession,
  });
  session.handover.arm();
  record(session, "session.started", { setup });
  return session;
}

async function endSession(session) {
  if (!session || session.closed) return;
  // Read by anything that may wake up after the close (a turn waiting on the LLM stream).
  session.closed = true;
  const handover = session.handover?.cancel();
  session.speechEpoch += 1;
  session.onSpeakEnded?.();
  session.onSpeakEnded = null;
  session.activeTurnAbort?.();
  clearTimeout(session.greetingTimer);
  clearTimeout(session.clientGoneTimer);
  sessions.delete(session.id);
  for (const res of session.sseClients) { try { res.end(); } catch (_) {} }
  session.ttsConnection?.close();
  record(session, "session.ended", {});
  // Not awaited: the summary is a model call and must not delay releasing the avatar.
  Promise.resolve()
    .then(() => session.coach.onSessionEnd?.(session))
    .catch((error) => console.warn(`Sesja ${session.id}: coach.onSessionEnd — ${error.message}`));
  try { session.recorder.finish?.(session); } catch (_) {}
  try { await session.avatar.stop(); } finally { await handover; }
}

// The server is stopping: without this the provider keeps every avatar session
// running (and paid) until its own timeout. avatar.stop() is a network call, so
// the wait is capped before the platform's SIGKILL.
async function closeAllSessions({ signal, budgetMs }) {
  const open = [...sessions.values()];
  for (const session of open) record(session, "session.server_stop", { signal });
  let timer;
  const budget = new Promise((resolve) => { timer = setTimeout(resolve, budgetMs); });
  await Promise.race([
    Promise.allSettled(open.map((session) => endSession(session))),
    budget,
  ]);
  clearTimeout(timer);
  return open.length;
}

module.exports = {
  closeAllSessions,
  HISTORY_MAX_MESSAGES,
  emit,
  endSession,
  ensureTts,
  getSession,
  record,
  startSession,
  trimHistory,
};
