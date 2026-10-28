// From a YOLO deviation to one correction (public/camera/correction-loop.js),
// on a fake clock: the 4 s to step into the frame, 1 s for a deviation to
// hold, a pause in the conversation before speaking, silence during a break
// (and the end window, the handover — all of them are canSpeak() === false),
// and a fixed posture cancelling its waiting correction.

const test = require("node:test");
const assert = require("node:assert/strict");

const leaning = { scenario: "standing", detected: true, deviations: [{ id: "shoulders_not_over_hips" }] };
const upright = { scenario: "standing", detected: true, deviations: [] };
const nobody = { scenario: "standing", detected: false, deviations: [] };

async function setup() {
  const { createCorrectionLoop } = await import("../public/camera/correction-loop.js");
  let clock = 0;
  const state = { busy: false, canSpeak: true };
  const cues = [];
  const loop = createCorrectionLoop({
    floor: { isBusy: () => state.busy },
    canSpeak: () => state.canSpeak,
    onCue: (cue) => cues.push(cue),
    now: () => clock,
  });
  loop.setScenario("standing");
  // Frames every 200 ms (YOLO sends ~6 a second), from `from` to `to`.
  const frames = (analysis, from, to) => {
    for (clock = from; clock <= to; clock += 200) loop.handleAnalysis(analysis);
  };
  return { loop, state, cues, frames };
}

test("Korekta: po wejściu w kadr, odchylenie trwa 1 s, w ciszy — jedna korekta", async () => {
  const { cues, frames } = await setup();
  frames(leaning, 0, 3800);
  assert.deepEqual(cues, [], "pierwsze 4 s to czas na wejście w kadr");

  frames(leaning, 4000, 6400);
  assert.deepEqual(cues, [{ scenario: "standing", deviation: "shoulders_not_over_hips" }]);

  frames(leaning, 6600, 15000);
  assert.equal(cues.length, 1, "ta sama uwaga nie wraca przed upływem 15 s");
});

test("Korekta: czeka, aż trener skończy mówić, i jeszcze 1,2 s ciszy", async () => {
  const { state, cues, frames } = await setup();
  state.busy = true;
  frames(leaning, 0, 8000);
  assert.deepEqual(cues, []);

  state.busy = false;
  frames(leaning, 8200, 9000);
  assert.deepEqual(cues, [], "cisza krótsza niż 1,2 s to pauza między zdaniami");
  frames(leaning, 9200, 9400);
  assert.equal(cues.length, 1);
});

test("Korekta: poprawiona postawa przed przerwą w rozmowie — korekta przepada", async () => {
  const { state, cues, frames } = await setup();
  state.busy = true;
  frames(leaning, 0, 6000);
  frames(upright, 6200, 6400);
  state.busy = false;
  frames(upright, 6600, 10000);
  assert.deepEqual(cues, []);
});

test("Korekta: w przerwie, oknie końca i przy podmianie awatara milczy; po powrocie czeka na ciszę", async () => {
  const { state, cues, frames } = await setup();
  frames(leaning, 0, 4400);
  state.canSpeak = false;
  frames(leaning, 4600, 20000);
  assert.deepEqual(cues, [], "zaległa korekta przepada, nowe nie powstają");

  state.canSpeak = true;
  frames(leaning, 20200, 21000);
  assert.deepEqual(cues, [], "po powrocie najpierw pauza");
  frames(leaning, 21200, 22600);
  assert.equal(cues.length, 1);
});

test("Korekta: nikogo w kadrze — nic do poprawy; reset() po wyłączeniu kamery czyści zaległą", async () => {
  const { loop, state, cues, frames } = await setup();
  frames(nobody, 0, 8000);
  assert.deepEqual(cues, []);

  state.busy = true;
  frames(leaning, 8200, 10000);
  loop.reset();
  state.busy = false;
  frames(nobody, 10200, 14000);
  assert.deepEqual(cues, []);
});
