// A microphone start that hangs without an error (public/mic-start.js), from
// yoga-startup: after 4 s the page and the log learn about it, and the first
// gesture ("Włącz mikrofon") resumes suspended audio.

const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return import("../public/mic-start.js");
}

// A fake window that remembers gesture listeners so the test can "click".
function fakeWindow() {
  const listeners = new Map();
  globalThis.window = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
  };
  return listeners;
}

// An AudioContext suspended until a gesture: resume() outside one hangs.
function blockedContext() {
  const context = {
    state: "suspended",
    gesture: false,
    handlers: [],
    addEventListener(type, handler) { this.handlers.push(handler); },
    removeEventListener() {},
    resume() {
      if (!this.gesture) return new Promise(() => {});
      this.state = "running";
      for (const handler of this.handlers) handler();
      return Promise.resolve();
    },
  };
  return context;
}

test("wstrzymany dźwięk: po 4 s zgłoszenie, po geście start i czas czekania", async (t) => {
  const { reportIfStuck, waitForRunningAudio, resumeBlockedAudio, MIC_BLOCKED_HINT_MS } = await load();
  const listeners = fakeWindow();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const context = blockedContext();
  const calls = [];
  let done = false;
  const started = reportIfStuck(waitForRunningAudio(context), "audio", () => ({ audioState: context.state }), {
    onBlocked: (reason, details) => calls.push(["blocked", reason, details.audioState]),
    onUnblocked: (reason) => calls.push(["unblocked", reason]),
  }).then(() => { done = true; });
  t.mock.timers.tick(MIC_BLOCKED_HINT_MS - 1);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  assert.deepEqual(calls, [["blocked", "audio", "suspended"]]);
  assert.ok(listeners.has("pointerdown"), "czeka na gest na stronie");
  // The "Włącz mikrofon" button (a user gesture).
  context.gesture = true;
  resumeBlockedAudio();
  await started;
  assert.equal(done, true);
  assert.deepEqual(calls.at(-1), ["unblocked", "audio"]);
  assert.equal(listeners.size, 0, "nasłuchy gestów zdjęte");
  t.mock.timers.reset();
  delete globalThis.window;
});

test("mikrofon, który rusza od razu, nie zgłasza niczego", async (t) => {
  const { reportIfStuck } = await load();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  await reportIfStuck(Promise.resolve("strumień"), "permission", () => ({}), {
    onBlocked: () => calls.push("blocked"),
    onUnblocked: () => calls.push("unblocked"),
  });
  t.mock.timers.tick(10_000);
  assert.deepEqual(calls, []);
  t.mock.timers.reset();
});

test("błąd w zgłoszeniu nie psuje startu mikrofonu", async (t) => {
  const { reportIfStuck, MIC_BLOCKED_HINT_MS } = await load();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let release;
  const started = reportIfStuck(new Promise((resolve) => { release = resolve; }), "permission", () => ({}), {
    onBlocked: () => { throw new Error("strona się wysypała"); },
    onUnblocked: () => { throw new Error("jw."); },
  });
  t.mock.timers.tick(MIC_BLOCKED_HINT_MS);
  release("strumień");
  assert.equal(await started, "strumień");
  t.mock.timers.reset();
});
