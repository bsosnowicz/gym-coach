const test = require("node:test");
const assert = require("node:assert/strict");

const { createBrowserVoice, END_MARGIN_MS } = require("../src/adapters/avatar/browser-voice");
const { fakeTime } = require("./helpers");

const MS = 48; // bytes of PCM16 @ 24 kHz per millisecond

async function startVoice() {
  const clock = fakeTime();
  const sent = [];
  const calls = [];
  const handle = await createBrowserVoice(clock).start({
    onSpeakStarted: () => calls.push(`started@${clock.now()}`),
    onSpeakEnded: () => calls.push(`ended@${clock.now()}`),
    send: (payload) => sent.push(payload),
  });
  const audio = () => sent.filter((event) => event.stage === "audio").map((event) => Buffer.from(event.pcm, "base64").length);
  return { clock, sent, calls, handle, audio };
}

test("browser voice: speech goes to the page in 250 ms chunks, the rest at the end", async () => {
  const { handle, calls, audio } = await startVoice();
  assert.equal(handle.client.mode, "voice");
  let firstChunks = 0;
  const speech = handle.beginSpeech({ onFirstChunk: () => { firstChunks += 1; } });
  speech.push(Buffer.alloc(200 * MS));
  assert.deepEqual(audio(), [], "less than one chunk waits for more");
  speech.push(Buffer.alloc(400 * MS));
  assert.deepEqual(audio(), [250 * MS, 250 * MS]);
  speech.end();
  assert.deepEqual(audio(), [250 * MS, 250 * MS, 100 * MS]);
  assert.equal(firstChunks, 1);
  assert.deepEqual(calls, ["started@0"]);
});

test("browser voice: letters go with the chunk they are said in, timed from its start", async () => {
  const { handle, sent } = await startVoice();
  const speech = handle.beginSpeech();
  speech.push(Buffer.alloc(200 * MS), { chars: "ab", ms: [10, 240] });
  // "c" comes with the second piece of audio: 40 ms into it is 240 ms into the speech.
  speech.push(Buffer.alloc(200 * MS), { chars: "c", ms: [40] });
  speech.end();
  const letters = sent.filter((event) => event.stage === "audio").map((event) => event.letters ?? null);
  // Chunks of 250 ms: "a" in the first; "b" and "c" at 240 ms; nothing in the rest.
  assert.deepEqual(letters, [{ chars: "abc", ms: [10, 240, 240] }, null]);
});

test("browser voice: speak ended comes once the page has played it all, plus a margin", async () => {
  const { handle, calls, clock } = await startVoice();
  const speech = handle.beginSpeech();
  speech.push(Buffer.alloc(500 * MS));
  speech.end();
  clock.advance(500 + END_MARGIN_MS - 1);
  assert.deepEqual(calls, ["started@0"]);
  clock.advance(1);
  assert.deepEqual(calls, ["started@0", `ended@${500 + END_MARGIN_MS}`]);
});

test("browser voice: audio arriving slower than speech pushes the end later", async () => {
  const { handle, calls, clock } = await startVoice();
  const speech = handle.beginSpeech();
  speech.push(Buffer.alloc(250 * MS));
  // The page played the first chunk and waited 100 ms in silence for the next.
  clock.advance(350);
  speech.push(Buffer.alloc(250 * MS));
  speech.end();
  clock.advance(250 + END_MARGIN_MS);
  assert.deepEqual(calls, ["started@0", `ended@${350 + 250 + END_MARGIN_MS}`]);
});

test("browser voice: an interrupt silences the page and ends the speech at once", async () => {
  const { handle, calls, clock, sent } = await startVoice();
  const speech = handle.beginSpeech();
  speech.push(Buffer.alloc(500 * MS));
  speech.end();
  clock.advance(100);
  handle.interrupt();
  assert.equal(sent.at(-1).stage, "audio_stop");
  assert.deepEqual(calls, ["started@0", "ended@100"]);
  clock.advance(5000);
  assert.deepEqual(calls, ["started@0", "ended@100"], "the clock of the cut speech does not fire later");

  // What follows a pause starts as a new speech.
  const resumed = handle.beginSpeech();
  resumed.push(Buffer.alloc(250 * MS));
  assert.deepEqual(calls, ["started@0", "ended@100", "started@5100"]);
});

test("browser voice: no audio, no speech; an odd last byte is dropped", async () => {
  const { handle, calls, clock, audio } = await startVoice();
  handle.beginSpeech().end();
  clock.advance(10000);
  assert.deepEqual(calls, []);

  const speech = handle.beginSpeech();
  speech.push(Buffer.alloc(101));
  speech.end();
  assert.deepEqual(audio(), [100]);
});

test("browser voice: the audio reaches the page through the session events", async () => {
  const { liveSession, fakeLlm } = require("./helpers");
  const { endSession } = require("../src/engine/session");
  const { session, events } = await liveSession({ llm: fakeLlm("Hej."), avatar: createBrowserVoice(fakeTime()) });
  assert.equal(session.avatar.client.mode, "voice");
  session.avatar.beginSpeech().push(Buffer.alloc(250 * MS));
  assert.deepEqual(events.map((event) => event.stage), ["audio", "avatar_speak_started"]);
  await endSession(session);
  const sent = events.length;
  session.avatar.interrupt();
  assert.equal(events.length, sent, "a closed session sends nothing more");
});
