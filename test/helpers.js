const { startSession } = require("../src/engine/session");

const sseStream = (...texts) => new Response(
  texts.map((text) => `data: {"choices":[{"delta":{"content":${JSON.stringify(text)}}}]}\n\n`).join("") + "data: [DONE]\n\n",
  { status: 200, headers: { "Content-Type": "text/event-stream" } }
);

function fakeLlm(...deltas) {
  return {
    async streamChat() {
      return {
        deltas: (async function* generate() { for (const delta of deltas) yield delta; })(),
        attempt: 1,
        startedAt: performance.now(),
        model: "fake-model",
        provider: "fake",
      };
    },
  };
}

// audio: true answers every utterance with one PCM chunk; false stays silent and fails.
function fakeTts({ fail = null } = {}) {
  const sent = [];
  return {
    sent,
    keyFor: ({ voiceId, languageCode = null }) => `${voiceId}|${languageCode || ""}`,
    async open(speech) {
      return {
        key: this.keyFor(speech),
        isOpen: () => true,
        close() {},
        startUtterance({ onAudio }) {
          let settle;
          const finished = new Promise((resolve, reject) => { settle = { resolve, reject }; });
          finished.catch(() => {});
          if (fail) queueMicrotask(() => settle.reject(fail));
          return {
            finished,
            sendText: (text) => sent.push(text),
            end() {
              if (fail) return;
              queueMicrotask(() => { onAudio(Buffer.alloc(48000)); settle.resolve(); });
            },
            cancel() {},
          };
        },
      };
    },
    async synthesize() {
      return Buffer.alloc(48000);
    },
  };
}

function fakeAvatar() {
  const commands = [];
  return {
    commands,
    async start({ onSpeakStarted, onSpeakEnded }) {
      return {
        sessionId: `test-${Date.now()}-${Math.random()}`,
        client: { livekitUrl: "wss://livekit.invalid", livekitToken: "token" },
        beginSpeech() {
          return {
            push() { commands.push("speak"); },
            end() { commands.push("speak_end"); queueMicrotask(() => { onSpeakStarted(); onSpeakEnded(); }); },
          };
        },
        interrupt() { commands.push("interrupt"); },
        async settleAfterInterrupt() {},
        async whenInterruptSettled() {},
        startListening() { commands.push("start_listening"); },
        stopListening() { commands.push("stop_listening"); },
        async stop() { commands.push("stop"); },
      };
    },
  };
}

function fakeCoach(overrides = {}) {
  return {
    createState: () => ({}),
    speech: () => ({ voiceId: "voice", languageCode: null, sttLanguage: null, sttHallucinations: [] }),
    buildMessages: (session) => [{ role: "system", content: "Odpowiadaj krótko." }, ...session.history],
    ...overrides,
  };
}

// A session past its greeting, with captured SSE output.
async function liveSession({ llm, tts = fakeTts(), avatar = fakeAvatar(), coach = fakeCoach(), options = {} }) {
  const session = await startSession({ userId: `user-${Math.random()}`, llm, tts, avatar, coach, options });
  const events = [];
  session.sseClients.add({ write: (line) => events.push(JSON.parse(line.slice(6))), end() {} });
  session.greetingDone = true;
  return { session, events, tts, avatar };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

// A clock and timers moved by hand: { now, setTimer, clearTimer } as adapters take them.
function fakeTime() {
  let time = 0;
  const timers = new Map();
  let nextId = 1;
  return {
    now: () => time,
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: time + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= time) { timers.delete(id); timer.fn(); }
      }
    },
  };
}

module.exports = { sseStream, fakeLlm, fakeTts, fakeAvatar, fakeCoach, liveSession, tick, fakeTime };
