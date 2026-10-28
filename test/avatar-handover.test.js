const test = require("node:test");
const assert = require("node:assert/strict");
const { createAvatarHandover } = require("../src/engine/avatar-handover");
const { endSession, getSession } = require("../src/engine/session");
const { runTurn, speakText, interruptTurn } = require("../src/engine/turn");
const { withSessionControl } = require("../src/engine/session-control");
const { avatarSessionLimitS } = require("../src/adapters/avatar/liveavatar-lite");
const { fakeAvatar, fakeCoach, fakeLlm, liveSession, tick } = require("./helpers");

function rig(t, { boundary = true, busy = false, ready = true, readyTimeoutMs = 100 } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const events = [];
  const calls = [];
  const handle = () => ({ expiresAt: Date.now() + 60000, durationMs: 60000, client: { livekitToken: "token" },
    stop: async () => calls.push("stop"), startListening: () => calls.push("listen") });
  const session = { id: "conversation", avatar: handle(), coach: { atBoundary: () => boundary },
    greetingDone: true, turnInFlight: busy, speechEpoch: 0 };
  const controller = createAvatarHandover(session, {
    readyTimeoutMs,
    stopSpeaking: async () => calls.push("silence"),
    openAvatar: async () => { calls.push("open"); return handle(); },
    record() {},
    emit: (_session, event) => {
      events.push(event);
      if (ready && event.stage === "avatar_handover") controller.ready(event.handoverId);
    },
    endSession: async () => { session.closed = true; controller.cancel(); calls.push("end"); },
  });
  t.after(() => { session.closed = true; controller.cancel(); });
  return { controller, session, events, calls };
}

test("provider duration is respected and the testing override can only shorten it", () => {
  assert.equal(avatarSessionLimitS(120, 90), 90);
  assert.equal(avatarSessionLimitS(120, 500), 120);
  assert.equal(avatarSessionLimitS(3600), 3600);
  for (const value of [null, 0, -1, Infinity, "invalid"]) assert.equal(avatarSessionLimitS(value), 1200);
  assert.equal(avatarSessionLimitS(120, NaN), 120);
});

test("timer replaces an idle avatar at the boundary and rearms for the next expiry", async (t) => {
  const { controller, calls, events } = rig(t);
  controller.arm();
  t.mock.timers.tick(35999);
  await tick();
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  await tick();
  assert.deepEqual(calls, ["silence", "stop", "open", "listen"]);
  t.mock.timers.tick(36000);
  await tick();
  assert.equal(events.filter((event) => event.stage === "avatar_handover_ended").length, 2);
});

test("busy speech or the domain boundary postpones replacement until the emergency deadline", async (t) => {
  const { controller, calls } = rig(t, { boundary: false, busy: true });
  controller.arm();
  t.mock.timers.tick(36000);
  await tick();
  assert.deepEqual(calls, []);
  t.mock.timers.tick(12000);
  await tick();
  assert.deepEqual(calls, ["silence", "stop", "open", "listen"]);
});

test("a pending direct announcement is not a safe boundary", async (t) => {
  const { controller, calls, session } = rig(t);
  session.directSpeechInFlight = 1;
  controller.arm();
  t.mock.timers.tick(36000);
  await tick();
  assert.deepEqual(calls, []);
  session.directSpeechInFlight = 0;
  t.mock.timers.tick(500);
  await tick();
  assert.ok(calls.includes("open"));
});

test("missing audio acknowledgement fails and closes instead of pretending the avatar is ready", async (t) => {
  const { controller, events, calls, session } = rig(t, { ready: false });
  const pending = controller.begin();
  await tick();
  assert.equal(controller.ready("stale-id"), false);
  t.mock.timers.tick(100);
  await pending;
  assert.equal(session.closed, true);
  assert.equal(calls.includes("listen"), false);
  assert.equal(events.at(-1).stage, "avatar_handover_failed");
});

test("two replacements preserve conversation, pause, history, TTS and suppress old callbacks", async () => {
  const avatar = fakeAvatar();
  const callbacks = [];
  const original = avatar.start;
  avatar.start = (handlers) => { callbacks.push(handlers); return original(handlers); };
  const { session, events } = await liveSession({ llm: fakeLlm(), avatar, coach: withSessionControl(fakeCoach()) });
  const id = session.id;
  const history = session.history;
  history.push({ role: "user", content: "Mam na imię Ania." });
  const state = session.coachState;
  const tts = session.ttsConnection;
  session.control = { paused: true, endPending: false };
  try {
    for (let i = 0; i < 2; i++) {
      const oldAvatar = session.avatar;
      const work = session.handover.begin();
      assert.equal(session.handover.begin(), work);
      await tick();
      assert.notEqual(session.avatar, oldAvatar);
      assert.equal(session.handover.active, true);
      const snapshot = session.handover.snapshot();
      assert.equal(snapshot.stage, "avatar_handover");
      assert.equal(session.handover.ready(snapshot.handoverId), true);
      await work;
      assert.equal(session.handover.snapshot().completed, true);
      assert.equal(session.handover.ready(snapshot.handoverId), true);
    }
    assert.equal(getSession(id), session);
    assert.equal(session.id, id);
    assert.equal(session.history, history);
    assert.equal(session.coachState, state);
    assert.equal(session.ttsConnection, tts);
    assert.equal(session.control.paused, true);
    assert.equal(session.greetingDone, true);
    const before = events.length;
    callbacks[0].onSpeakStarted();
    callbacks[0].onSpeakEnded();
    assert.equal(events.length, before);
    assert.equal(events.filter((e) => e.stage === "avatar_handover_ended").length, 2);
  } finally { await endSession(session); }
});

test("end while opening a replacement closes the late avatar without publishing it", async () => {
  const avatar = fakeAvatar();
  const original = avatar.start;
  let release;
  let count = 0;
  let replacementStopped = false;
  avatar.start = async (handlers) => {
    if (++count === 1) return original(handlers);
    await new Promise((resolve) => { release = resolve; });
    return { ...(await original(handlers)), stop: async () => { replacementStopped = true; } };
  };
  const { session, events } = await liveSession({ llm: fakeLlm(), avatar });
  const work = session.handover.begin();
  await tick();
  const ending = endSession(session);
  release();
  await Promise.all([work, ending]);
  assert.equal(replacementStopped, true);
  assert.equal(getSession(session.id), undefined);
  assert.equal(events.some((e) => e.stage === "avatar_handover"), false);
});

test("provider failure ends the conversation; a failed stop never starts another paid session", async () => {
  const { session, events } = await liveSession({ llm: fakeLlm() });
  session.avatar.stop = async () => { throw new Error("stop failed"); };
  await session.handover.begin();
  await tick();
  assert.equal(session.closed, true);
  assert.equal(getSession(session.id), undefined);
  assert.equal(events.at(-1).stage, "avatar_handover_failed");
});

test("turns, announcements and interrupts cannot use the avatar during replacement", async () => {
  const { session, events } = await liveSession({ llm: fakeLlm() });
  const history = [...session.history];
  const work = session.handover.begin();
  await runTurn(session, "Hej");
  assert.equal(await speakText(session, "Test"), false);
  assert.equal(interruptTurn(session).ignored, "avatar_handover");
  assert.deepEqual(session.history, history);
  assert.ok(events.some((e) => e.reason === "avatar_handover"));
  await endSession(session);
  await work;
});

test("a closing farewell does not allocate another avatar", async (t) => {
  const { controller, session, calls } = rig(t);
  session.control = { finishing: true };
  controller.arm();
  t.mock.timers.tick(60000);
  await tick();
  assert.deepEqual(calls, []);
});
