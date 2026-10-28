// Where to restart a paused reply. The cut point is only an estimate of how far
// the avatar got, and restarting there would begin mid-word, so playback goes
// back to the last short pause in the speech before it.

// PCM 16-bit mono @ 24 kHz.
const BYTES_PER_MS = 48;
const WINDOW_BYTES = 20 * BYTES_PER_MS;
// Synthesized silence is close to digital zero; speech is in the thousands.
const QUIET_RMS = 400;
// This many quiet windows in a row (80 ms) count as a pause between words.
const QUIET_WINDOWS = 4;
const MAX_REWIND_BYTES = 2500 * BYTES_PER_MS;
const FALLBACK_REWIND_BYTES = 300 * BYTES_PER_MS;

function windowRms(pcm, start) {
  let sum = 0;
  for (let offset = start; offset < start + WINDOW_BYTES; offset += 2) {
    const sample = pcm.readInt16LE(offset);
    sum += sample * sample;
  }
  return Math.sqrt(sum / (WINDOW_BYTES / 2));
}

// pcm: everything synthesized so far; cut: byte offset the avatar had reached.
function resumeOffset(pcm, cut) {
  const end = Math.max(0, Math.min(pcm.length, cut));
  let quietRun = 0;
  let pauseEnd = 0;
  let index = Math.floor(end / WINDOW_BYTES) - 1;
  for (; index >= 0 && end - index * WINDOW_BYTES <= MAX_REWIND_BYTES; index -= 1) {
    if (windowRms(pcm, index * WINDOW_BYTES) >= QUIET_RMS) {
      quietRun = 0;
      continue;
    }
    if (quietRun === 0) pauseEnd = index * WINDOW_BYTES;
    quietRun += 1;
    // The last quiet window stays in as a lead-in.
    if (quietRun >= QUIET_WINDOWS) return pauseEnd;
  }
  // Reached the very beginning: say it again from the start.
  if (index < 0) return 0;
  return Math.max(0, end - FALLBACK_REWIND_BYTES) & ~1;
}

module.exports = { BYTES_PER_MS, resumeOffset };
