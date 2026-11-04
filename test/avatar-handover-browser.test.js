const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { tick } = require("./helpers");

// Run the actual browser adapter with transport and microphone doubles, without a CDN or paid services.
function browserRig({ mode = null } = {}) {
  const rooms = [];
  const players = [];
  const acknowledgements = [];
  const ended = [];
  const transitions = [];
  const transcripts = [];
  const muted = [];
  let disconnected = 0;
  let recorderStops = 0;
  let mic;
  const source = { readyState: 1, close() { this.closed = true; } };
  const RoomEvent = Object.fromEntries(["TrackSubscribed", "TrackUnsubscribed", "ConnectionQualityChanged", "AudioPlaybackStatusChanged", "Disconnected"].map((key) => [key, key]));
  class Room {
    constructor() { this.handlers = {}; this.canPlaybackAudio = false; rooms.push(this); }
    on(event, handler) { this.handlers[event] = handler; }
    emit(event, ...args) { this.handlers[event]?.(...args); }
    async connect() {}
    disconnect() { this.emit("Disconnected"); }
    async startAudio() { this.canPlaybackAudio = true; this.emit("AudioPlaybackStatusChanged"); }
  }
  const noop = () => {};
  const deps = {
    Room, RoomEvent, log: noop, logProviderOutput: noop, showAudioUnlock: noop, hideAudioUnlock: noop,
    startSession: async () => (mode ? { sessionId: "conversation", mode }
      : { sessionId: "conversation", livekitUrl: "initial", livekitToken: "initial-token" }),
    createVoicePlayer: () => {
      const player = { pushed: [], stops: 0, closed: false, blocked: false, track: {},
        push(pcm, letters) { this.pushed.push([pcm, letters]); }, stop() { this.stops += 1; }, close() { this.closed = true; },
        level: () => 0.5, mouth: () => 2 };
      players.push(player);
      return player;
    },
    endSession: async (id) => ended.push(id), openEvents: () => source,
    sendTurn: noop, interrupt: noop, resume: noop, pauseSession: noop, askEnd: noop, continueSession: noop,
    finishSession: noop, report: noop, handoverReady: async (...args) => acknowledgements.push(args),
    SILENCE_HOLD_MS: 500, resumeBlockedAudio: noop, armAvatarOnset: noop, resetAvatarOnset: noop,
    createTurnLatencyTracker: () => ({ reset: noop, stage: noop, start: noop }), turnLatencyBreakdown: noop,
    createSpeechRecorder: async (options) => {
      mic = options;
      return { setMuted: (value) => muted.push(value), setAvatarSpeaking: noop, stop: () => recorderStops++ };
    },
  };
  const code = fs.readFileSync(require.resolve("../public/session/lite-adapter.js"), "utf8")
    .replace(/^import \{([^}]+)\} from "[^"]+";$/gm, "const {$1} = deps;")
    .replace("export function createLiteAdapter", "function createLiteAdapter");
  const create = new Function("deps", `${code}\nreturn createLiteAdapter;`)(deps);
  const floor = { reset: noop, avatarStartedSpeaking: noop, avatarStoppedSpeaking: noop,
    setAvatarUtterance: noop, isEcho: () => false, turnSent: noop };
  const adapter = create({ floor, onHandover: (...args) => transitions.push(args),
    onDisconnected: () => disconnected++, onTranscript: (...args) => transcripts.push(args) });
  return { adapter, rooms, players, acknowledgements, ended, transitions, transcripts, muted, source,
    mic: () => mic, disconnected: () => disconnected, recorderStops: () => recorderStops,
    event: (data) => source.onmessage({ data: JSON.stringify(data) }),
    audio(room) { room.emit("TrackSubscribed", { kind: "audio", attach: noop, detach: noop, mediaStreamTrack: {} }); },
  };
}

const replacement = (id, extra = {}) => ({ stage: "avatar_handover", handoverId: id, livekitUrl: "new-room", livekitToken: "secret", ...extra });

test("replacement preserves microphone and transcript, and waits for an audible audio track", async () => {
  const r = browserRig();
  await r.adapter.connect({});
  r.event({ stage: "avatar_transcription", text: "Pamiętam rozmowę." });
  r.event({ stage: "greeting_done" });
  r.event({ stage: "avatar_handover_started", handoverId: "first" });
  assert.equal(r.muted.at(-1), true);
  r.event(replacement("first"));
  await tick();
  assert.equal(r.rooms.length, 2);
  assert.equal(r.disconnected(), 0);
  assert.equal(r.recorderStops(), 0);
  r.audio(r.rooms[1]);
  await tick();
  assert.equal(r.acknowledgements.length, 0);
  await r.rooms[1].startAudio();
  await tick();
  assert.deepEqual(r.acknowledgements, [["conversation", "first"]]);
  r.event({ stage: "avatar_handover_ended", handoverId: "first", paused: true });
  assert.equal(r.adapter.reconnecting, false);
  assert.equal(r.muted.at(-1), false);
  assert.deepEqual(r.transcripts, [["coach", "Pamiętam rozmowę."]]);
  assert.equal(r.transitions.at(-1)[1].paused, true);
  assert.deepEqual(r.ended, []);
  await r.adapter.disconnect();
});

test("mute preference survives two replacements, duplicate SSE does not create another room", async () => {
  const r = browserRig();
  await r.adapter.connect({});
  r.adapter.setMicMuted(true);
  for (const id of ["first", "second"]) {
    r.event({ stage: "avatar_handover_started", handoverId: id });
    r.event(replacement(id));
    r.event(replacement(id));
    await tick();
    const room = r.rooms.at(-1);
    r.audio(room);
    await room.startAudio();
    await tick();
    r.event({ stage: "avatar_handover_ended", handoverId: id });
    assert.equal(r.muted.at(-1), true);
  }
  assert.equal(r.rooms.length, 3);
  assert.equal(r.recorderStops(), 0);
  await r.adapter.disconnect();
});

test("late events from an old room do not disconnect or detach the new avatar", async () => {
  const r = browserRig();
  await r.adapter.connect({});
  r.event(replacement("first"));
  await tick();
  r.audio(r.rooms[1]);
  await r.rooms[1].startAudio();
  await tick();
  r.event({ stage: "avatar_handover_ended", handoverId: "first" });
  let detached = false;
  r.rooms[0].emit("Disconnected");
  r.rooms[0].emit("TrackUnsubscribed", { detach: () => { detached = true; } });
  assert.equal(detached, false);
  assert.equal(r.disconnected(), 0);
  assert.equal(r.adapter.connected, true);
  await r.adapter.disconnect();
});

test("stop during replacement releases the microphone and never acknowledges a late audio track", async () => {
  const r = browserRig();
  await r.adapter.connect({});
  r.event(replacement("first"));
  await tick();
  await r.adapter.disconnect();
  r.audio(r.rooms[1]);
  await r.rooms[1].startAudio();
  await tick();
  assert.deepEqual(r.acknowledgements, []);
  assert.equal(r.recorderStops(), 1);
  assert.deepEqual(r.ended, ["conversation"]);
});

test("SSE replay restores a missed completion without replacing the room again", async () => {
  const r = browserRig();
  await r.adapter.connect({});
  r.event(replacement("first"));
  await tick();
  r.audio(r.rooms[1]);
  await r.rooms[1].startAudio();
  await tick();
  assert.equal(r.adapter.reconnecting, true);
  r.event(replacement("first", { completed: true }));
  await tick();
  assert.equal(r.adapter.reconnecting, false);
  assert.equal(r.rooms.length, 2);
  await r.adapter.disconnect();
});

test("server failure closes the local transport and microphone", async () => {
  const r = browserRig();
  await r.adapter.connect({});
  r.event(replacement("first"));
  await tick();
  r.event({ stage: "avatar_handover_failed" });
  await tick();
  assert.equal(r.disconnected(), 1);
  assert.equal(r.recorderStops(), 1);
  assert.equal(r.adapter.connected, false);
  assert.equal(r.source.closed, true);
});

test("a transcript from before replacement is discarded even if STT returns after reconnection", async () => {
  const r = browserRig();
  await r.adapter.connect({});
  r.event({ stage: "greeting_done" });
  const silenceAt = performance.now();
  r.event(replacement("first"));
  await tick();
  r.audio(r.rooms[1]);
  await r.rooms[1].startAudio();
  await tick();
  r.event({ stage: "avatar_handover_ended", handoverId: "first" });
  r.mic().onUtterance({ text: "stale", silenceAt, sttMs: 1000 });
  assert.deepEqual(r.transcripts, []);
  await r.adapter.disconnect();
});

test("voice mode: no avatar room, the coach's audio goes to the player in the page", async () => {
  const rig = browserRig({ mode: "voice" });
  await rig.adapter.connect({}, {});
  assert.equal(rig.rooms.length, 0);
  assert.equal(rig.players.length, 1);
  const [player] = rig.players;
  rig.event({ stage: "audio", pcm: "AAAA", letters: { chars: "a", ms: [0] } });
  rig.event({ stage: "audio_stop" });
  assert.deepEqual(player.pushed, [["AAAA", { chars: "a", ms: [0] }]]);
  assert.equal(player.stops, 1);
  assert.equal(rig.adapter.voiceLevel(), 0.5);
  assert.equal(rig.adapter.voiceMouth(), 2);
  await rig.adapter.disconnect();
  assert.equal(player.closed, true);
  assert.equal(rig.adapter.voiceLevel(), 0);
  assert.equal(rig.adapter.voiceMouth(), null);
});

test("avatar mode: the player made in the click is closed once the session has a room", async () => {
  const rig = browserRig();
  await rig.adapter.connect({}, {});
  assert.equal(rig.rooms.length, 1);
  assert.equal(rig.players[0].closed, true);
  rig.event({ stage: "audio", pcm: "AAAA" });
  assert.deepEqual(rig.players[0].pushed, []);
});
