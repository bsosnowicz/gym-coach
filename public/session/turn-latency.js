// How fast the avatar answered the user: one record per turn, from yoga-startup.
//
// The recorder's own entries cannot tell: the user's words are recorded after
// transcription and the avatar's line once it has been spoken in full, so their
// gap is mostly the length of the line. Only the browser knows both ends on one
// clock: the silence after the utterance (VAD in stt.js) and the first audible
// sound of the avatar (audio-onset.js). Server stages arrive over SSE, counted
// from the start of the turn on the server's clock (session.turnStartedAt).
// What neither side measures directly (sending the turn, the way back over SSE)
// is left as the remainder (see turnLatencyBreakdown).

// After avatar_speak_started, wait a moment for real sound. The detector may be
// unavailable (no audio track, suspended AudioContext); then the record goes
// without that number instead of being lost.
export const AUDIBLE_WAIT_MS = 3000;
// An utterance the avatar did not start answering within this time has no
// reply time to measure (no words, rejected, held).
export const REPLY_TIMEOUT_MS = 30000;

function finiteMs(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

export function createTurnLatencyTracker({
  onReport,
  now = () => performance.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let turn = null;
  let timer = null;

  function stopTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function drop() {
    stopTimer();
    turn = null;
  }

  function arm(ms, callback) {
    stopTimer();
    timer = setTimer(callback, ms);
  }

  function elapsed() {
    return Math.round(now() - turn.silenceAt);
  }

  function report() {
    const done = turn;
    drop();
    if (!done || done.speakStartedMs === null) return;
    onReport({
      action: "turn_latency",
      path: done.path,
      sttMs: done.sttMs,
      queuedMs: done.queuedMs,
      firstTokenMs: done.firstTokenMs,
      ttftMs: done.ttftMs,
      ttsFirstChunkMs: done.ttsFirstChunkMs,
      audioSentMs: done.audioSentMs,
      serverSpeakMs: done.serverSpeakMs,
      speakStartedMs: done.speakStartedMs,
      audibleMs: done.audibleMs,
      llmAttempt: done.llmAttempt,
      llmRetries: done.llmRetries,
      hedged: done.hedged,
      bargeIn: done.bargeIn,
    });
  }

  function resetServerStages() {
    turn.queuedMs = null;
    turn.firstTokenMs = null;
    turn.ttftMs = null;
    turn.llmAttempt = null;
    turn.ttsFirstChunkMs = null;
    turn.audioSentMs = null;
  }

  return {
    // The finished utterance goes to the server. A new utterance replaces the
    // previous one the avatar has not answered yet.
    start({ silenceAt, sttMs, bargeIn = false }) {
      drop();
      if (!Number.isFinite(silenceAt)) return;
      turn = {
        silenceAt,
        sttMs: finiteMs(sttMs),
        bargeIn: bargeIn === true,
        // Without stt_ready from the server the engine spoke on its own (break,
        // end window): a reply too, but without the model.
        path: "engine",
        sttReadySeen: false,
        llmRetries: 0,
        hedged: false,
        serverSpeakMs: null,
        speakStartedMs: null,
        audibleMs: null,
      };
      resetServerStages();
      arm(REPLY_TIMEOUT_MS, drop);
    },

    // An SSE event from the server (handlePipelineEvent in the Lite adapter).
    stage(data) {
      if (!turn || !data) return;
      switch (data.stage) {
        case "stt_ready":
          // A retried turn (silent model) counts again: the server stages are
          // about the last attempt, the first one's time goes to the remainder.
          if (turn.sttReadySeen) resetServerStages();
          turn.sttReadySeen = true;
          if (turn.path === "engine") turn.path = "llm";
          turn.queuedMs = finiteMs(data.queuedMs);
          break;
        case "buffered_hit":
          turn.path = "buffered";
          break;
        case "llm_first_token":
          if (turn.firstTokenMs === null) {
            turn.firstTokenMs = finiteMs(data.ms);
            turn.ttftMs = finiteMs(data.ttftMs);
            turn.llmAttempt = Number.isInteger(data.attempt) ? data.attempt : null;
          }
          break;
        case "llm_retry":
          turn.llmRetries += 1;
          break;
        case "llm_hedge":
          turn.hedged = true;
          break;
        case "tts_first_chunk":
          if (turn.ttsFirstChunkMs === null) turn.ttsFirstChunkMs = finiteMs(data.ms);
          break;
        case "audio_sent_to_avatar":
          if (turn.audioSentMs === null) turn.audioSentMs = finiteMs(data.ms);
          break;
        case "avatar_speak_started":
          if (turn.speakStartedMs !== null) break;
          turn.speakStartedMs = elapsed();
          turn.serverSpeakMs = finiteMs(data.ms);
          if (turn.audibleMs !== null) report();
          else arm(AUDIBLE_WAIT_MS, report);
          break;
        // The server settled the utterance without the avatar speaking, or dropped it.
        case "turn_settled":
        case "turn_dropped":
          drop();
          break;
        default:
          break;
      }
    },

    // The avatar's first real sound (audio-onset.js). It may come before
    // avatar_speak_started: the provider reports the start at an unknown moment.
    audible() {
      if (!turn || turn.audibleMs !== null) return;
      turn.audibleMs = elapsed();
      if (turn.speakStartedMs !== null) report();
    },

    // End of the session or a disconnect: an unfinished measurement is dropped.
    reset() {
      drop();
    },
  };
}

// A turn_latency record split into segments, in milliseconds. A segment that
// cannot be computed (another path, no measurement) is null. The "network"
// remainder can come out a few ms negative (rounding on two clocks); it stays
// as it is so a measurement error is not hidden.
export function turnLatencyBreakdown(details = {}) {
  const value = (key) => (Number.isFinite(details[key]) ? details[key] : null);
  const diff = (a, b) => (a !== null && b !== null ? a - b : null);
  const stt = value("sttMs");
  const queued = value("queuedMs");
  const firstToken = value("firstTokenMs");
  const ttsFirst = value("ttsFirstChunkMs");
  const audioSent = value("audioSentMs");
  const serverSpeak = value("serverSpeakMs");
  const speakStarted = value("speakStartedMs");
  const audible = value("audibleMs");
  // An engine line ("engine") is timed by the server from the start of THAT
  // line, not from the utterance: the server-side split says nothing there.
  const engine = details.path === "engine";
  const network = engine ? null : diff(diff(speakStarted, stt), serverSpeak);
  return {
    totalMs: audible ?? speakStarted,
    sttMs: stt,
    // Sending the turn and the way back over SSE, without waiting on the server.
    networkMs: network !== null && queued !== null ? network - queued : network,
    // From accepting the turn to its start.
    queuedMs: engine ? null : queued,
    // From the start of the turn to the first token (prompt + TTFT).
    llmMs: engine ? null : firstToken,
    ttsMs: engine ? null : diff(ttsFirst, firstToken),
    // To the first audio chunk sent to LiveAvatar.
    sendMs: engine ? null : details.path === "buffered" ? audioSent : diff(audioSent, ttsFirst),
    avatarMs: engine ? null : diff(serverSpeak, audioSent),
    // From the reported start of speech to real sound (WebRTC); may be negative.
    audioPathMs: diff(audible, speakStarted),
  };
}
