const { randomUUID } = require("crypto");

// Only the provider connection expires. Conversation state and its public ID survive.
function createAvatarHandover(session, { openAvatar, stopSpeaking, emit, record, endSession,
  readyTimeoutMs = 20000, pollMs = 500, now = Date.now }) {
  let timer = null;
  let readyTimer = null;
  let pending = null;
  let task = null;
  let lastConnection = null;

  const controlState = () => ({ paused: Boolean(session.control?.paused), endPending: Boolean(session.control?.endPending) });

  function arm() {
    clearTimeout(timer);
    const { expiresAt, durationMs } = session.avatar;
    if (session.closed || !Number.isFinite(expiresAt) || !Number.isFinite(durationMs)) return;
    const windowAt = expiresAt - Math.min(90000, durationMs * 0.4);
    timer = setTimeout(check, Math.max(0, windowAt - now()));
    timer.unref?.();
  }

  function check() {
    if (session.closed || pending || session.control?.finishing) return;
    const forced = now() >= session.avatar.expiresAt - Math.min(45000, session.avatar.durationMs * 0.2);
    let boundary = false;
    try { boundary = session.coach.atBoundary?.(session) ?? true; }
    catch (_) { record(session, "avatar.boundary_failed"); }
    if (forced || (session.greetingDone && !session.turnInFlight && !session.directSpeechInFlight && !session.avatarSpeaking && boundary)) {
      begin({ forced });
    } else {
      timer = setTimeout(check, pollMs);
      timer.unref?.();
    }
  }

  function begin({ forced = false } = {}) {
    if (session.closed) return Promise.resolve();
    if (pending) return task;
    clearTimeout(timer);
    const state = { id: randomUUID(), client: null, ready: null };
    pending = state;
    task = Promise.resolve().then(async () => {
      record(session, "avatar.handover_started", { forced });
      emit(session, { stage: "avatar_handover_started", handoverId: state.id });
      session.speechEpoch += 1;
      session.onSpeakEnded?.();
      session.onSpeakEnded = null;
      await stopSpeaking(session);
      if (session.closed) return;
      await session.avatar.stop();
      if (session.closed) return;
      const replacement = await openAvatar();
      if (session.closed) { await replacement.stop(); return; }
      session.avatar = replacement;
      session.avatarSpeaking = false;
      session.speakStartedAt = null;
      state.client = replacement.client;
      const ready = new Promise((resolve, reject) => {
        state.ready = resolve;
        readyTimer = setTimeout(() => reject(new Error("Przeglądarka nie potwierdziła dźwięku nowego awatara.")), readyTimeoutMs);
      });
      emit(session, snapshot());
      await ready;
      if (session.closed) return;
      session.avatar.startListening();
      record(session, "avatar.handover_ended");
      lastConnection = { stage: "avatar_handover", handoverId: state.id, ...state.client, completed: true };
      pending = null;
      emit(session, { stage: "avatar_handover_ended", handoverId: state.id, ...controlState() });
      arm();
    }).catch((error) => {
      if (session.closed) return;
      console.warn(`Sesja ${session.id}: podmiana awatara — ${error.message}`);
      record(session, "avatar.handover_failed");
      emit(session, { stage: "avatar_handover_failed" });
      endSession(session).catch(() => {});
    }).finally(() => {
      clearTimeout(readyTimer);
      if (pending === state) pending = null;
    });
    return task;
  }

  function snapshot() {
    if (!pending) return lastConnection ? { ...lastConnection, ...controlState() } : null;
    return { stage: pending.client ? "avatar_handover" : "avatar_handover_started",
      handoverId: pending.id, ...(pending.client || {}) };
  }

  return {
    arm, begin, snapshot,
    get active() { return Boolean(pending); },
    ready(id) {
      if (!session.closed && !pending && lastConnection?.handoverId === id) return true;
      if (!pending?.ready || pending.id !== id || session.closed) return false;
      pending.ready();
      return true;
    },
    cancel() {
      clearTimeout(timer);
      clearTimeout(readyTimer);
      pending?.ready?.();
      return task;
    },
  };
}

module.exports = { createAvatarHandover };
