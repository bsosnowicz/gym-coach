// A microphone start that hangs without an error (public/stt.js). Two steps can
// wait forever: getUserMedia, until someone answers the browser's permission
// prompt, and AudioContext.resume() without a user gesture (Safari, Chrome before
// the first touch). In yoga-startup 13 sessions of 4 testers looked like this:
// the greeting played, the user talked into the void and closed the tab after
// ~25 s, with no trace in the log. After MIC_BLOCKED_HINT_MS the page and the log
// get onBlocked, and onUnblocked once the microphone finally starts.
export const MIC_BLOCKED_HINT_MS = 4000;
// Gestures after which the browser lets audio resume.
const GESTURE_EVENTS = ["pointerdown", "touchend", "keydown", "click"];
const blockedAudioContexts = new Set();

// Resumes suspended microphone audio; called from the "Włącz mikrofon" button
// and from any gesture on the page.
export function resumeBlockedAudio() {
  for (const context of blockedAudioContexts) context.resume().catch(() => {});
}

export function waitForRunningAudio(context) {
  return new Promise((resolve) => {
    let settled = false;
    const check = () => {
      if (settled || context.state !== "running") return;
      settled = true;
      blockedAudioContexts.delete(context);
      context.removeEventListener?.("statechange", check);
      if (!blockedAudioContexts.size) {
        for (const type of GESTURE_EVENTS) window.removeEventListener(type, resumeBlockedAudio, true);
      }
      resolve();
    };
    blockedAudioContexts.add(context);
    context.addEventListener?.("statechange", check);
    for (const type of GESTURE_EVENTS) window.addEventListener(type, resumeBlockedAudio, true);
    context.resume().then(check, () => {});
    check();
  });
}

export async function reportIfStuck(promise, reason, details, { onBlocked, onUnblocked }) {
  const startedAt = performance.now();
  let reported = false;
  const timer = setTimeout(() => {
    reported = true;
    try { onBlocked?.(reason, details()); } catch (_) { /* a report must not break the start */ }
  }, MIC_BLOCKED_HINT_MS);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
    if (reported) {
      try { onUnblocked?.(reason, Math.round(performance.now() - startedAt)); } catch (_) { /* as above */ }
    }
  }
}
