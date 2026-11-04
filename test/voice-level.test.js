const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../public/session/voice-level.js");

test("levelOf: silence and no samples keep the mouth closed", async () => {
  const { levelOf } = await load();
  assert.equal(levelOf(new Float32Array(0)), 0);
  assert.equal(levelOf(new Float32Array(512)), 0);
});

test("levelOf: median speech opens the mouth halfway, loud speech fully", async () => {
  const { levelOf } = await load();
  const constant = (value) => new Float32Array(512).fill(value);
  assert.ok(Math.abs(levelOf(constant(0.08)) - 0.48) < 1e-6);
  assert.ok(Math.abs(levelOf(constant(-0.08)) - 0.48) < 1e-6);
  assert.equal(levelOf(constant(0.5)), 1);
});

test("createMouth: a shape per level, held for 90 ms, with a margin at each step", async () => {
  const { createMouth } = await load();
  const mouth = createMouth();
  assert.equal(mouth.update(0, 0.02), 0);
  assert.equal(mouth.update(10, 0.8), 3);
  // Too soon after a change, however quiet.
  assert.equal(mouth.update(50, 0), 3);
  assert.equal(mouth.update(100, 0.45), 2);
  // Just under the step (0.35) is not enough to close further.
  assert.equal(mouth.update(200, 0.33), 2);
  assert.equal(mouth.update(300, 0.30), 1);
  assert.equal(mouth.update(400, 0.05), 0);
});

test("smooth: keeps 60% of the previous level", async () => {
  const { smooth } = await load();
  assert.ok(Math.abs(smooth(0, 1) - 0.4) < 1e-9);
  assert.ok(Math.abs(smooth(1, 0) - 0.6) < 1e-9);
});
