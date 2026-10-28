// Hearing diagnostics: what the microphone actually caught during the session.
//
// "It does not hear me" has three different causes that look the same: speech
// the VAD never detected (threshold too high, too quiet, too far), an utterance
// detected but dropped on the way, and one garbled by Whisper. Transcripts are
// in the recorder already; this collects what is not: levels and what was lost
// before transcription. stt.js feeds it the VAD readings; the Lite adapter sends
// its mic_calibrated / mic_stats reports to the session recorder. Pure module,
// tested in Node. From yoga-startup ("trainer" in field names is the avatar).

import { sessionThresholds } from "./mic-calibration.js";

// One report a minute and only when something happened: enough to see WHEN
// someone was not heard, without flooding the session log.
const WINDOW_MS = 60_000;
const TICK_MS = 50;
const NEAR_MISS_NOISE_FACTOR = 2;
const NEAR_MISS_FLOOR = 0.0075;
const NEAR_MISS_MIN_MS = 300;
// Short gaps between syllables must not split one speech attempt.
const NEAR_MISS_GAP_TICKS = 2;
const NEAR_MISS_MAX_MS = 8000;
const NOISE_GRACE_MS = 500;
// The quietest 20% resist brief noise and speech below the detection threshold.
const NOISE_PERCENTILE = 0.2;
const NOISE_MIN_QUIET_MS = 2000;
const NOISE_BLOCK_MS = 5000;
const NOISE_BLOCK_MIN_QUIET_MS = 1000;
const NOISE_REPORT_SHIFT_DB = 3;
// A floor avoids infinite decibel ratios and reports caused by negligible noise changes.
const NOISE_DB_FLOOR = 0.002;
const HINT_MIN_NEAR_MISSES = 2;
const HINT_NOISY_MARGIN_DB = 10;

function percentileOf(values, share) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

function decibels(ratio) {
  return Math.round(20 * Math.log10(ratio) * 10) / 10;
}

function level(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}
export function describePlatform(userAgent = "", maxTouchPoints = 0) {
  const ua = String(userAgent);
  let os = /iPhone|iPad|iPod/.test(ua) ? "ios"
    : /Android/.test(ua) ? "android"
    : /Windows/.test(ua) ? "windows"
    : /Macintosh|Mac OS X/.test(ua) ? "macos"
    : /Linux|CrOS/.test(ua) ? "linux"
    : "other";
  if (os === "macos" && maxTouchPoints > 1) os = "ios";
  const browser = /EdgA?\/|EdgiOS\//.test(ua) ? "edge"
    : /SamsungBrowser\//.test(ua) ? "samsung"
    : /OPR\/|Opera/.test(ua) ? "opera"
    : /Firefox\/|FxiOS\//.test(ua) ? "firefox"
    : /CriOS\/|Chrome\//.test(ua) ? "chrome"
    : /Safari\//.test(ua) ? "safari"
    : "other";
  return { os, browser };
}
export function inputKind(label) {
  const text = String(label || "").toLowerCase();
  if (!text) return "unknown";
  if (/airpods|buds|headset|headphone|hands-?free|bluetooth|słuchawk|earphone|jabra|bose/.test(text)) return "headset";
  if (/built-?in|wbudowan|internal|macbook|imac|microphone array|realtek/.test(text)) return "builtin";
  return "other";
}
export function describeTrack(track, supported = {}) {
  const settings = typeof track?.getSettings === "function" ? track.getSettings() : {};
  const flag = (value) => (typeof value === "boolean" ? value : null);
  return {
    echoCancellation: flag(settings.echoCancellation),
    noiseSuppression: flag(settings.noiseSuppression),
    autoGainControl: flag(settings.autoGainControl),
    agcSupported: supported?.autoGainControl === true,
    sampleRate: Number.isInteger(settings.sampleRate) ? settings.sampleRate : null,
    inputKind: inputKind(track?.label),
  };
}

function freshWindow(startedAt) {
  return {
    startedAt,
    speechStarts: 0,
    speechStartsOverTrainer: 0,
    utterances: 0,
    tooShort: 0,
    stale: 0,
    empty: 0,
    nearMisses: 0,
    nearMissesOverTrainer: 0,
    nearMissPeak: 0,
    peakRms: 0,
    speechRmsSum: 0,
    speechTicks: 0,
    threshold: null,
    bargeThreshold: null,
    quiet: [],
    blockIndex: 0,
    blockQuiet: [],
    blockFloors: [],
  };
}
function closeBlock(stats) {
  let floor = null;
  if (stats.blockQuiet.length * TICK_MS >= NOISE_BLOCK_MIN_QUIET_MS) {
    floor = percentileOf(stats.blockQuiet, NOISE_PERCENTILE);
    stats.blockFloors.push(floor);
  }
  stats.blockQuiet = [];
  return floor;
}

function hadActivity(stats) {
  return stats.speechStarts + stats.utterances + stats.tooShort + stats.stale
    + stats.empty + stats.nearMisses + stats.nearMissesOverTrainer > 0;
}
export function createMicDiagnostics({ onReport, windowMs = WINDOW_MS } = {}) {
  let current = null;
  let noiseFloor = 0;
  let voiceLevel = null;
  let reportedNoise = 0;
  let lastBusyAt = -Infinity;
  let liveNoise = 0;
  let run = null;

  function nearMissGate() {
    return Math.max(Math.max(noiseFloor, liveNoise) * NEAR_MISS_NOISE_FACTOR, NEAR_MISS_FLOOR);
  }
  // Sustained background noise must not be counted as an unheard speech attempt.
  function updateLiveNoise(floor) {
    if (floor === null) return;
    if (run && floor >= nearMissGate()) run = null;
    liveNoise = floor;
  }

  function closeRun() {
    const runMs = run ? run.lastAt - run.startedAt : 0;
    if (run && current && runMs >= NEAR_MISS_MIN_MS && runMs <= NEAR_MISS_MAX_MS) {
      if (run.overTrainer) current.nearMissesOverTrainer += 1;
      else current.nearMisses += 1;
      current.nearMissPeak = Math.max(current.nearMissPeak, run.peak);
    }
    run = null;
  }
  function noiseSummary(stats) {
    updateLiveNoise(closeBlock(stats));
    if (stats.quiet.length * TICK_MS < NOISE_MIN_QUIET_MS) {
      return { noise: null, fields: { noiseRms: null, noiseMinRms: null, noiseMaxRms: null, noiseShiftDb: null, voiceMarginDb: null, adaptiveThreshold: null, hintShadow: null } };
    }
    const noise = percentileOf(stats.quiet, NOISE_PERCENTILE);
    const floored = Math.max(noise, NOISE_DB_FLOOR);
    const voiceMarginDb = voiceLevel ? decibels(voiceLevel / floored) : null;
    let hintShadow = null;
    if (stats.nearMisses >= HINT_MIN_NEAR_MISSES) {
      const margin = voiceMarginDb ?? decibels(Math.max(stats.nearMissPeak, floored) / floored);
      hintShadow = margin < HINT_NOISY_MARGIN_DB ? "noisy" : "quiet_voice";
    }
    return {
      noise,
      fields: {
        noiseRms: level(noise),
        noiseMinRms: stats.blockFloors.length ? level(Math.min(...stats.blockFloors)) : null,
        noiseMaxRms: stats.blockFloors.length ? level(Math.max(...stats.blockFloors)) : null,
        noiseShiftDb: decibels(floored / Math.max(noiseFloor, NOISE_DB_FLOOR)),
        voiceMarginDb,
        adaptiveThreshold: level(sessionThresholds({ noiseFloor: noise, voiceLevel }).threshold),
        hintShadow,
      },
    };
  }

  function noiseShifted(noise) {
    if (noise === null) return false;
    const shift = decibels(Math.max(noise, NOISE_DB_FLOOR) / Math.max(reportedNoise, NOISE_DB_FLOOR));
    return Math.abs(shift) >= NOISE_REPORT_SHIFT_DB;
  }

  function emitWindow() {
    if (!current) return;
    const { noise, fields } = noiseSummary(current);
    if (!hadActivity(current) && !noiseShifted(noise)) return;
    if (noise !== null) reportedNoise = noise;
    onReport?.({
      action: "mic_stats",
      windowS: Math.round((current.lastAt - current.startedAt) / 100) / 10,
      speechStarts: current.speechStarts,
      speechStartsOverTrainer: current.speechStartsOverTrainer,
      utterances: current.utterances,
      tooShort: current.tooShort,
      stale: current.stale,
      empty: current.empty,
      nearMisses: current.nearMisses,
      nearMissesOverTrainer: current.nearMissesOverTrainer,
      nearMissPeak: current.nearMissPeak ? level(current.nearMissPeak) : null,
      peakRms: level(current.peakRms),
      speechRms: current.speechTicks ? level(current.speechRmsSum / current.speechTicks) : null,
      threshold: level(current.threshold),
      bargeThreshold: level(current.bargeThreshold),
      quietS: Math.round(current.quiet.length * TICK_MS / 100) / 10,
      ...fields,
    });
  }

  function startWindow(at) {
    current = freshWindow(at);
    current.lastAt = at;
  }

  return {
    calibrated({
      noiseFloor: measured,
      threshold,
      bargeThreshold,
      clamped,
      deviceChanged,
      voiceCheck = "none",
      voiceLevel: measuredVoice = null,
      platform,
      track,
    }) {
      noiseFloor = Number.isFinite(measured) ? measured : 0;
      reportedNoise = noiseFloor;
      liveNoise = 0;
      if (current) {
        current.quiet = [];
        current.blockQuiet = [];
        current.blockFloors = [];
      }
      voiceLevel = Number.isFinite(measuredVoice) && measuredVoice > 0 ? measuredVoice : null;
      run = null;
      onReport?.({
        action: "mic_calibrated",
        noiseFloor: level(noiseFloor),
        threshold: level(threshold),
        bargeThreshold: level(bargeThreshold),
        clamped: Boolean(clamped),
        deviceChanged: Boolean(deviceChanged),
        voiceCheck,
        voiceLevel: level(measuredVoice),
        os: platform?.os || "other",
        browser: platform?.browser || "other",
        ...track,
      });
    },
    tick({ rms, threshold, bargeThreshold, avatarSpeaking, speaking, muted = false, at }) {
      if (!current) startWindow(at);
      current.lastAt = at;
      if (speaking || avatarSpeaking) lastBusyAt = at;
      else if (!muted && at - lastBusyAt >= NOISE_GRACE_MS) {
        const block = Math.floor((at - current.startedAt) / NOISE_BLOCK_MS);
        if (block !== current.blockIndex) {
          updateLiveNoise(closeBlock(current));
          current.blockIndex = block;
        }
        current.quiet.push(rms);
        current.blockQuiet.push(rms);
      }
      current.threshold = threshold;
      current.bargeThreshold = bargeThreshold;
      current.peakRms = Math.max(current.peakRms, rms);
      const activeThreshold = avatarSpeaking ? bargeThreshold : threshold;
      if (speaking) {
        run = null;
        if (rms >= activeThreshold) {
          current.speechRmsSum += rms;
          current.speechTicks += 1;
        }
      } else if (rms >= nearMissGate()) {
        if (!run) run = { startedAt: at, lastAt: at, quiet: 0, peak: rms, overTrainer: Boolean(avatarSpeaking) };
        run.lastAt = at;
        run.quiet = 0;
        run.peak = Math.max(run.peak, rms);
      } else if (run) {
        run.quiet += 1;
        if (run.quiet >= NEAR_MISS_GAP_TICKS) closeRun();
      }
      if (at - current.startedAt >= windowMs) {
        emitWindow();
        startWindow(at);
      }
    },
    speechStarted({ avatarSpeaking }) {
      run = null;
      if (!current) return;
      current.speechStarts += 1;
      if (avatarSpeaking) current.speechStartsOverTrainer += 1;
    },
    utteranceSent() { if (current) current.utterances += 1; },
    tooShort() { if (current) current.tooShort += 1; },
    staleTranscript() { if (current) current.stale += 1; },
    emptyTranscript() { if (current) current.empty += 1; },
    flush() {
      closeRun();
      emitWindow();
      current = null;
    },
  };
}
