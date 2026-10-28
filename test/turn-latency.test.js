// Reply time (public/session/turn-latency.js), from yoga-startup: measured in the
// browser, from the silence after the utterance to the avatar's first sound.
// The admin panel and CSV report stay in yoga-startup.

const test = require("node:test");
const assert = require("node:assert/strict");

function loadTracker() {
  return import("../public/session/turn-latency.js");
}

// Clock and timers under the test's control.
function fakeClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => time,
    setTimer: (callback, ms) => { const id = nextId++; timers.set(id, { callback, at: time + ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    advance(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= time) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

async function tracker() {
  const { createTurnLatencyTracker } = await loadTracker();
  const clock = fakeClock();
  const reports = [];
  const latency = createTurnLatencyTracker({ onReport: (event) => reports.push(event), ...clock });
  return { latency, clock, reports };
}

test("tura modelu: jeden wpis od ciszy do pierwszego dźwięku z etapami serwera", async () => {
  const { latency, clock, reports } = await tracker();
  clock.advance(1000);
  latency.start({ silenceAt: 200, sttMs: 800 });
  latency.stage({ stage: "stt_ready", ms: 0, queuedMs: 40 });
  latency.stage({ stage: "llm_first_token", ms: 620, ttftMs: 560, attempt: 1 });
  latency.stage({ stage: "tts_first_chunk", ms: 900 });
  latency.stage({ stage: "audio_sent_to_avatar", ms: 910 });
  clock.advance(1500);
  latency.stage({ stage: "avatar_speak_started", ms: 1350 });
  assert.equal(reports.length, 0, "czeka na realny dźwięk");
  clock.advance(80);
  latency.audible();
  assert.equal(reports.length, 1);
  assert.deepEqual(reports[0], {
    action: "turn_latency",
    path: "llm",
    sttMs: 800,
    queuedMs: 40,
    firstTokenMs: 620,
    ttftMs: 560,
    ttsFirstChunkMs: 900,
    audioSentMs: 910,
    serverSpeakMs: 1350,
    speakStartedMs: 2300,
    audibleMs: 2380,
    llmAttempt: 1,
    llmRetries: 0,
    hedged: false,
    bargeIn: false,
  });
});

test("bez dźwięku wpis idzie po czasie oczekiwania, bez audibleMs", async () => {
  const { AUDIBLE_WAIT_MS } = await loadTracker();
  const { latency, clock, reports } = await tracker();
  latency.start({ silenceAt: 0, sttMs: 700 });
  latency.stage({ stage: "stt_ready", ms: 0 });
  latency.stage({ stage: "buffered_hit", ms: 1 });
  clock.advance(1200);
  latency.stage({ stage: "avatar_speak_started", ms: 300 });
  clock.advance(AUDIBLE_WAIT_MS);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].path, "buffered");
  assert.equal(reports[0].speakStartedMs, 1200);
  assert.equal(reports[0].audibleMs, null);
});

test("dźwięk przed zgłoszeniem startu mowy — wpis zaraz po zgłoszeniu", async () => {
  const { latency, clock, reports } = await tracker();
  latency.start({ silenceAt: 0, sttMs: 600 });
  clock.advance(1500);
  latency.audible();
  clock.advance(100);
  latency.stage({ stage: "avatar_speak_started", ms: 200 });
  assert.equal(reports.length, 1);
  assert.equal(reports[0].path, "engine");
  assert.equal(reports[0].audibleMs, 1500);
  assert.equal(reports[0].speakStartedMs, 1600);
});

test("wypowiedź bez odpowiedzi trenerki nie zostawia wpisu", async () => {
  const { REPLY_TIMEOUT_MS } = await loadTracker();
  const { latency, clock, reports } = await tracker();
  latency.start({ silenceAt: 0, sttMs: 600 });
  latency.stage({ stage: "turn_settled" });
  latency.stage({ stage: "avatar_speak_started", ms: 100 });
  latency.audible();
  clock.advance(REPLY_TIMEOUT_MS);
  assert.equal(reports.length, 0);

  latency.start({ silenceAt: 0, sttMs: 600 });
  clock.advance(REPLY_TIMEOUT_MS);
  latency.stage({ stage: "avatar_speak_started", ms: 100 });
  assert.equal(reports.length, 0, "po limicie mowa nie jest już odpowiedzią");
});

test("nowa wypowiedź zastępuje poprzednią, ponowiona tura liczy etapy od nowa", async () => {
  const { latency, clock, reports } = await tracker();
  latency.start({ silenceAt: 0, sttMs: 500 });
  latency.stage({ stage: "stt_ready", ms: 0, queuedMs: 10 });
  latency.stage({ stage: "llm_first_token", ms: 400, ttftMs: 390, attempt: 1 });
  clock.advance(2000);
  latency.start({ silenceAt: 1900, sttMs: 650, bargeIn: true });
  latency.stage({ stage: "stt_ready", ms: 0, queuedMs: 20 });
  latency.stage({ stage: "llm_retry" });
  latency.stage({ stage: "stt_ready", ms: 0, queuedMs: 5 });
  latency.stage({ stage: "llm_first_token", ms: 700, ttftMs: 650, attempt: 1 });
  clock.advance(1900);
  latency.stage({ stage: "avatar_speak_started", ms: 1200 });
  latency.audible();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].sttMs, 650);
  assert.equal(reports[0].queuedMs, 5);
  assert.equal(reports[0].firstTokenMs, 700);
  assert.equal(reports[0].llmRetries, 1);
  assert.equal(reports[0].bargeIn, true);
  assert.equal(reports[0].speakStartedMs, 2000);
});

test("rozbicie na odcinki domyka się do czasu startu mowy", async () => {
  const { turnLatencyBreakdown } = await loadTracker();
  const parts = turnLatencyBreakdown({
    path: "llm", sttMs: 800, queuedMs: 40, firstTokenMs: 620, ttftMs: 560,
    ttsFirstChunkMs: 900, audioSentMs: 910, serverSpeakMs: 1350, speakStartedMs: 2300, audibleMs: 2380,
  });
  assert.deepEqual(parts, {
    totalMs: 2380, sttMs: 800, networkMs: 110, queuedMs: 40, llmMs: 620, ttsMs: 280, sendMs: 10, avatarMs: 440, audioPathMs: 80,
  });
  const sum = parts.sttMs + parts.networkMs + parts.queuedMs + parts.llmMs + parts.ttsMs + parts.sendMs + parts.avatarMs;
  assert.equal(sum, 2300);

  const engine = turnLatencyBreakdown({ path: "engine", sttMs: 600, serverSpeakMs: 200, speakStartedMs: 1600 });
  assert.equal(engine.totalMs, 1600);
  assert.equal(engine.networkMs, null, "kwestia silnika nie ma etapów tej wypowiedzi");
  assert.equal(engine.avatarMs, null);
});
