// Posture corrections spoken by the avatar (src/coach/cues.js): the text comes
// from the scenario file, and the server stays silent during a turn, a break,
// the end window, the goodbye and an avatar handover.

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadCorrections, cueBlockedBy, createCueSpeaker } = require("../src/coach/cues");
const { speakText } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const { fakeLlm, liveSession } = require("./helpers");

test("Korekty: tekst pochodzi z yolo-backend/scenarios, nie z przeglądarki", () => {
  const corrections = loadCorrections();
  assert.equal(corrections.get("standing").get("shoulders_not_over_hips"), "Stań prosto, barki nad biodrami.");
  assert.equal(createCueSpeaker({ speakText }).correctionFor("standing", "made_up"), null);
});

test("Korekty: bramka serwera — tura, mowa, przerwa, okno końca, pożegnanie, podmiana awatara", () => {
  const idle = { control: {} };
  assert.equal(cueBlockedBy(idle), null);
  assert.equal(cueBlockedBy({ ...idle, closed: true }), "closed");
  assert.equal(cueBlockedBy({ ...idle, handover: { active: true } }), "avatar_handover");
  assert.equal(cueBlockedBy({ control: { paused: true } }), "paused");
  assert.equal(cueBlockedBy({ control: { endPending: true } }), "end_pending");
  assert.equal(cueBlockedBy({ control: { finishing: true } }), "finishing");
  assert.equal(cueBlockedBy({ ...idle, activeTurn: Promise.resolve() }), "turn");
  assert.equal(cueBlockedBy({ ...idle, avatarSpeaking: true }), "speaking");
  assert.equal(cueBlockedBy({ ...idle, directSpeechInFlight: 1 }), "speaking");
});

test("Korekty: w ciszy awatar mówi tekst ze scenariusza, w przerwie milczy", async () => {
  const { session, avatar, events } = await liveSession({ llm: fakeLlm() });
  const recorded = [];
  const cues = createCueSpeaker({ speakText, record: (_session, type, payload) => recorded.push({ type, ...payload }) });
  const cue = { scenario: "standing", deviation: "shoulders_not_over_hips" };

  assert.deepEqual(await cues.speak(session, cue), { spoken: true, text: "Stań prosto, barki nad biodrami." });
  assert.ok(avatar.commands.includes("speak"));
  assert.ok(events.some((event) => event.stage === "avatar_transcription" && event.text === "Stań prosto, barki nad biodrami."));

  session.control = { paused: true };
  const spokenBefore = avatar.commands.filter((command) => command === "speak").length;
  assert.deepEqual(await cues.speak(session, cue), { spoken: false, reason: "paused" });
  assert.equal(avatar.commands.filter((command) => command === "speak").length, spokenBefore);
  assert.deepEqual(recorded.map((entry) => `${entry.type}:${entry.reason || ""}`), ["camera.cue:", "camera.cue_dropped:paused"]);

  assert.deepEqual(await cues.speak(session, { scenario: "standing", deviation: "x" }), { spoken: false, reason: "unknown_deviation" });
  await endSession(session);
});
