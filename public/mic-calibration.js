// Hearing calibration: the VAD thresholds and the voice check before Start.
// From yoga-startup, without its sensitivity slider.
//
// A threshold from the background noise alone can sit above a quiet or distant
// voice, and the avatar simply does not hear the user. The voice measured once
// before Start (voice-check.js) lowers it. Pure module (no DOM, no Web Audio,
// localStorage behind try/catch), so the maths is tested in Node. Listening
// (stt.js) and the voice check take thresholds, mic settings and the level
// scale from here, so they measure exactly what the session later uses.

// The threshold depends on the microphone and the room: measure the noise right
// after start and put the threshold above it.
export const NOISE_MARGIN = 3;
// Floor: in a very quiet room the margin alone would let a fan pass for speech.
// Ceiling, the more important one: above ~0.05 speech may never cross it.
// A false speech start is cheap (MIN_SPEECH_MS and the server's hallucination
// filter catch it), a missed one costs the whole conversation.
export const MIN_RMS_THRESHOLD = 0.015;
export const MAX_RMS_THRESHOLD = 0.05;

// Interrupting the avatar takes a clearly louder signal than starting to speak:
// its voice coming back from the speakers is, even after AEC, much quieter than
// speech straight into the mic. Tune by ear on the target microphone:
//   - the avatar cuts itself off             -> RAISE the multiplier
//   - hard to get a word in, you must shout  -> LOWER it
// 2.5 -> 1.8 in yoga-startup: users far from the mic were not heard.
export const BARGE_IN_SENSITIVITY = 1.8;
// Without this ceiling a loud room (base threshold at MAX_RMS_THRESHOLD) would
// push the raised threshold above normal speech.
export const MAX_BARGE_IN_THRESHOLD = 0.07;

// With a measured voice the threshold sits halfway between noise and voice in
// decibels (geometric mean), but:
//   - at most half the voice (~6 dB headroom): the voice is often quieter in
//     the session than during the check,
//   - at least 1.5 x noise and ABSOLUTE_MIN_THRESHOLD, so noise is not speech,
//   - never above the noise-only threshold: the check can only IMPROVE hearing.
const VOICE_THRESHOLD_SHARE = 0.5;
const NOISE_HEADROOM = 1.5;
const ABSOLUTE_MIN_THRESHOLD = 0.005;
// The barge-in threshold at most 60% of the measured voice: a normal voice can
// interrupt. Risk: with a very quiet voice it gets close to the echo level.
const VOICE_BARGE_SHARE = 0.6;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function positive(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Session thresholds from the noise measured at its start and the voice from
// the check (if there was one, for this microphone). Without a voice the result
// is exactly the old noise-only threshold: the way out for a skipped check.
export function sessionThresholds({ noiseFloor = 0, voiceLevel = null } = {}) {
  const noise = positive(noiseFloor);
  const voice = positive(voiceLevel) || null;
  const base = clamp(noise * NOISE_MARGIN, MIN_RMS_THRESHOLD, MAX_RMS_THRESHOLD);

  let threshold = base;
  if (voice) {
    const lower = Math.max(noise * NOISE_HEADROOM, ABSOLUTE_MIN_THRESHOLD);
    const upper = Math.min(base, voice * VOICE_THRESHOLD_SHARE);
    // Voice barely above noise: a threshold just above noise. More false
    // alarms, but those are cheap and deafness is not.
    const middle = Math.sqrt(Math.max(noise, 0.001) * voice);
    threshold = Math.min(base, upper <= lower ? lower : clamp(middle, lower, upper));
  }
  // Counted from the noise-only threshold, the voice only lowers it as far as
  // normal speech needs. It does not follow the lowered speech threshold down:
  // here the stake is the avatar's echo from the speakers.
  let bargeThreshold = Math.min(base * BARGE_IN_SENSITIVITY, MAX_BARGE_IN_THRESHOLD);
  if (voice) bargeThreshold = Math.min(bargeThreshold, voice * VOICE_BARGE_SHARE);
  bargeThreshold = Math.max(bargeThreshold, threshold);

  return {
    threshold,
    bargeThreshold,
    // The noise broke through the ceiling: noise may pass for speech too.
    clamped: noise * NOISE_MARGIN > MAX_RMS_THRESHOLD,
  };
}

// The same mic settings in the voice check and in the session, otherwise we
// would measure another signal than the one the threshold works on.
export function micAudioConstraints(deviceId = "") {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    // AGC raises the gain exactly when it is quiet, so the measured "noise" is
    // amplified hiss and a threshold measured once stops fitting seconds later.
    autoGainControl: false,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

// RMS of AnalyserNode.getFloatTimeDomainData samples: one scale for the voice check and the session VAD.
export function rmsOf(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
// -60..0 dBFS spread linearly over 0..1: a linear scale would squeeze quiet speech into a few pixels.
export function meterPosition(rms) {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  return clamp((20 * Math.log10(rms) + 60) / 60, 0, 1);
}

function percentile(values, share) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}
// --- Voice check ---------------------------------------------------------------
//
// A countdown, then listening while the user says the phrase. Noise is the 20th
// percentile of ALL readings (the quietest moments, so neither steps nor speech
// raise it). Voice is the 70th percentile of readings clearly above noise, the
// vowel level the VAD has to catch; a median would be pulled down by consonants
// and fading word endings.
export const VOICE_CHECK_COUNTDOWN_MS = 3000;
export const VOICE_CHECK_LISTEN_MS = 6000;
const VOICE_TICK_MS = 50;
const VOICED_GATE_FACTOR = 2;
const VOICED_GATE_FLOOR = 0.004;
// Less speech than this is a crackle, not an utterance.
const VOICED_MIN_MS = 300;
// A sentence said (at least 0.6 s of speech) and 0.7 s of quiet after it: stop early.
const EARLY_STOP_VOICED_MS = 600;
const EARLY_STOP_QUIET_MS = 700;
// A voice under 3 x noise (~10 dB) or very quiet in absolute terms: usable,
// but worth moving closer or using a headset.
const WEAK_VOICE_NOISE_FACTOR = 3;
const WEAK_VOICE_LEVEL = 0.01;

export function createVoiceCheckAnalyzer({
  countdownMs = VOICE_CHECK_COUNTDOWN_MS,
  listenMs = VOICE_CHECK_LISTEN_MS,
  tickMs = VOICE_TICK_MS,
} = {}) {
  const all = [];
  const heard = [];
  let voicedMs = 0;
  let lastVoicedAt = null;
  let finished = false;

  // The 20th percentile excludes speech and brief noises from the background estimate.
  function gate() {
    return Math.max(percentile(all, 0.2) * VOICED_GATE_FACTOR, VOICED_GATE_FLOOR);
  }

  return {
    tick(rms, at) {
      const level = Number.isFinite(rms) && rms > 0 ? rms : 0;
      if (finished) return { phase: "done", level, remainingMs: 0, voiced: false };
      all.push(level);
      if (at < countdownMs) {
        return { phase: "countdown", level, remainingMs: countdownMs - at, voiced: false };
      }
      heard.push(level);
      const voiced = level >= gate();
      if (voiced) {
        voicedMs += tickMs;
        lastVoicedAt = at;
      }
      const listenedMs = at - countdownMs;
      const sentenceDone = voicedMs >= EARLY_STOP_VOICED_MS && lastVoicedAt !== null && at - lastVoicedAt >= EARLY_STOP_QUIET_MS;
      if (sentenceDone || listenedMs >= listenMs) {
        finished = true;
        return { phase: "done", level, remainingMs: 0, voiced };
      }
      return { phase: "listen", level, remainingMs: listenMs - listenedMs, voiced };
    },

    result() {
      const noiseFloor = percentile(all, 0.2);
      const voicedGate = Math.max(noiseFloor * VOICED_GATE_FACTOR, VOICED_GATE_FLOOR);
      const voiced = heard.filter((level) => level >= voicedGate);
      if (voiced.length * tickMs < VOICED_MIN_MS) return { outcome: "silent", noiseFloor, voiceLevel: null };
      // The 70th percentile captures vowels without lowering the estimate for word endings.
      const voiceLevel = percentile(voiced, 0.7);
      const weak = voiceLevel < Math.max(noiseFloor * WEAK_VOICE_NOISE_FACTOR, WEAK_VOICE_LEVEL);
      return { outcome: weak ? "weak" : "ok", noiseFloor, voiceLevel };
    },
  };
}

// --- Memory on the device --------------------------------------------------------
//
// The measured voice stays in localStorage and later sessions start from it.
// It depends on the microphone (AirPods and a laptop mic are very different), so
// it is stored per microphone, by name and not by deviceId: Safari changes
// deviceIds between visits, the name stays. The name never leaves the device.
const VOICE_CHECK_KEY = "avatar.voiceCheck";
const MAX_REMEMBERED_MICS = 8;
export const VOICE_CHECK_OUTCOMES = ["ok", "weak", "skipped", "other_mic", "none"];

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (_) {
    return null;
  }
}

function readJson(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) || "null");
  } catch (_) {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}
// "Default - MacBook Pro Microphone" and "MacBook Pro Microphone" are the same
// mic: the system prefix only says which one is the default right now.
export function micKey(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/^(default|domyślny|domyslny|communications|komunikacja)\s*-\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
// When the browser refuses localStorage (private mode, blocked site data), the
// result is kept in memory until reload; otherwise the check would return before every session.
let unsavedRecord = null;

function readRecord(storage) {
  const record = readJson(storage, VOICE_CHECK_KEY) ?? unsavedRecord;
  return record && typeof record === "object" && !Array.isArray(record) ? record : null;
}

function writeRecord(storage, record) {
  const saved = writeJson(storage, VOICE_CHECK_KEY, record);
  unsavedRecord = saved ? null : record;
  return saved;
}

function rememberedMics(record) {
  return record?.mics && typeof record.mics === "object" && !Array.isArray(record.mics) ? record.mics : {};
}
// The check comes before every session: the mic and the place change, and a
// restart after trouble is often about sound. A good result from the last 30
// minutes is not forced again: the window offers it and starts with one click.
export const RECENT_CHECK_MS = 30 * 60 * 1000;
// The latest good result of the last 30 minutes ({ label, outcome, at }) or null. A skip does not count.
export function recentVoiceCheck(storage = defaultStorage(), now = Date.now()) {
  let latest = null;
  for (const [key, entry] of Object.entries(rememberedMics(readRecord(storage)))) {
    if ((entry?.outcome !== "ok" && entry?.outcome !== "weak") || !positive(entry.voiceLevel)) continue;
    const at = Number(entry.at);
    if (!Number.isFinite(at) || at > now || now - at > RECENT_CHECK_MS) continue;
    if (!latest || at > latest.at) latest = { label: entry.label || key, outcome: entry.outcome, at };
  }
  return latest;
}

export function saveVoiceCheck({ label = "", outcome, voiceLevel = null, noiseFloor = null }, storage = defaultStorage(), now = Date.now()) {
  const previous = readRecord(storage) || {};
  const mics = { ...rememberedMics(previous) };
  const key = micKey(label) || "default";
  if ((outcome === "ok" || outcome === "weak") && positive(voiceLevel)) {
    delete mics[key];
    mics[key] = { outcome, voiceLevel, noiseFloor: positive(noiseFloor), at: now, label: String(label).slice(0, 80) };
    // The oldest go first: key order is insertion order.
    const keys = Object.keys(mics);
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED_MICS))) delete mics[stale];
  }
  return writeRecord(storage, {
    checkedAt: now,
    lastOutcome: outcome === "ok" || outcome === "weak" ? outcome : "skipped",
    mics,
  });
}
// What a session takes for the microphone with this name. "other_mic": checked, but another mic.
export function voiceCheckFor(label, storage = defaultStorage()) {
  const record = readRecord(storage);
  const mics = rememberedMics(record);
  const entry = mics[micKey(label) || "default"];
  if (entry && positive(entry.voiceLevel) && (entry.outcome === "ok" || entry.outcome === "weak")) {
    return { outcome: entry.outcome, voiceLevel: entry.voiceLevel };
  }
  if (Object.keys(mics).length) return { outcome: "other_mic", voiceLevel: null };
  return { outcome: record?.checkedAt ? "skipped" : "none", voiceLevel: null };
}
