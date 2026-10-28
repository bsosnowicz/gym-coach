// The voice check before Start: the part that touches the microphone. The
// measurement logic (countdown, listening, result) is createVoiceCheckAnalyzer
// in mic-calibration.js, tested there; this file feeds it Web Audio readings
// every 50 ms, like the session VAD (stt.js): same mic settings, window and scale.
// The microphone is open only for the check and closed before the session opens its own.

import { createVoiceCheckAnalyzer, micAudioConstraints, rmsOf } from "./mic-calibration.js";

const TICK_MS = 50;
const FFT_SIZE = 1024;

// Call FROM A CLICK HANDLER. onUpdate({ phase, remainingMs, level, voiced }) on
// every reading. Returns { done, cancel }: done resolves with { outcome:
// "ok"|"weak"|"silent", noiseFloor, voiceLevel, label } (null after cancel) and
// rejects with the getUserMedia error.
export function startVoiceCheck({ deviceId = "", onUpdate } = {}) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  // Safari requires AudioContext creation within the initiating user gesture.
  const audioContext = new AudioContextClass();
  const resumed = audioContext.state === "suspended" ? audioContext.resume().catch(() => {}) : Promise.resolve();
  let stream = null;
  let timer = null;
  let cancelled = false;
  let settle = null;

  // Concurrent microphone streams can mute each other on iOS.
  function release() {
    clearInterval(timer);
    timer = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    audioContext.close().catch(() => {});
  }

  async function openStream() {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: micAudioConstraints(deviceId) });
    } catch (error) {
      // A remembered input may no longer exist after audio routes change.
      if (!deviceId || error?.name === "NotAllowedError") throw error;
      return navigator.mediaDevices.getUserMedia({ audio: micAudioConstraints("") });
    }
  }

  const done = (async () => {
    try {
      stream = await openStream();
      await resumed;
    } catch (error) {
      release();
      throw error;
    }
    if (cancelled) {
      release();
      return null;
    }
    const label = stream.getAudioTracks()[0]?.label || "";
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const analyzer = createVoiceCheckAnalyzer({ tickMs: TICK_MS });
    const startedAt = performance.now();

    return new Promise((resolve) => {
      settle = resolve;
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const state = analyzer.tick(rmsOf(samples), performance.now() - startedAt);
        try { onUpdate?.(state); } catch (_) { /* UI errors must not interrupt measurement. */ }
        if (state.phase === "done") {
          release();
          resolve({ ...analyzer.result(), label });
        }
      }, TICK_MS);
    });
  })();

  return {
    done,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (!timer) return;
      release();
      settle?.(null);
    },
  };
}
