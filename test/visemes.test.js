const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../public/session/visemes.js");

test("shapeOf: open vowels wide, rounded half, m/b/p and punctuation closed, a space keeps the mouth", async () => {
  const { shapeOf } = await load();
  assert.deepEqual(["a", "Ę", "ä", "o", "ü", "y", "i", "t", "M", "p", ".", " "].map(shapeOf), [3, 3, 3, 2, 2, 2, 1, 1, 0, 0, 0, null]);
});

test("cuesFrom: a cue where the shape changes, in seconds from the chunk's start", async () => {
  const { cuesFrom } = await load();
  // "Mam to." from a chunk playing at 10 s.
  const cues = cuesFrom({ chars: "Mam to.", ms: [0, 80, 160, 220, 260, 330, 420] }, 10);
  assert.deepEqual(cues.map((cue) => [Math.round(cue.time * 1000), cue.shape]), [[10000, 0], [10080, 3], [10160, 0], [10260, 1], [10330, 2], [10420, 0]]);
});

test("shapeAt: the last cue so far, closed before the first", async () => {
  const { shapeAt } = await load();
  const cues = [{ time: 1, shape: 3 }, { time: 1.2, shape: 1 }];
  assert.equal(shapeAt(cues, 0.5), 0);
  assert.equal(shapeAt(cues, 1.1), 3);
  assert.equal(shapeAt(cues, 5), 1);
});
