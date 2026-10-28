const test = require("node:test");
const assert = require("node:assert/strict");

const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const { createCoach, SYSTEM_PROMPT } = require("../src/coach");
const { fakeLlm, liveSession, tick } = require("./helpers");

function recordingLlm(...deltas) {
  const llm = fakeLlm(...deltas);
  return { calls: [], streamChat(args) { this.calls.push(args.messages); return llm.streamChat(args); } };
}

test("Gym Coach: powitanie zaczyna się od zdarzenia startu, rozmowa idzie z historią", async () => {
  const llm = recordingLlm("Cześć! Jaki jest Twój cel treningu?");
  const { session } = await liveSession({ llm, coach: createCoach({ voiceId: "v" }) });

  await runTurn(session, null);
  assert.deepEqual(llm.calls[0], [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "[EVENT: session_start]" },
  ]);

  await runTurn(session, "Chcę zbudować siłę.");
  for (let i = 0; i < 4; i += 1) await tick();
  assert.deepEqual(llm.calls[1].slice(1).map((message) => message.content), ["Cześć! Jaki jest Twój cel treningu?", "Chcę zbudować siłę."]);
  await endSession(session);
});

test("Gym Coach: STT po polsku z filtrem halucynacji Whispera", () => {
  const speech = createCoach({ voiceId: "v" }).speech();
  assert.equal(speech.sttLanguage, "pl");
  assert.ok(speech.sttHallucinations.some((pattern) => pattern.test("Dziękuję za oglądanie!")));
  assert.ok(!speech.sttHallucinations.some((pattern) => pattern.test("Dziękuję, wystarczy.")));
});
