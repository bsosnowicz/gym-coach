// How far the mascot's mouth opens for the coach's voice (voice mode).

// RMS of ElevenLabs speech (eleven_multilingual_v2, 7 clips incl. the current voice, measured 3.11.2026 in
// ~21 ms windows): median 0.07-0.08, p90 0.14-0.15, p99 0.19-0.24; silence below 0.01.
// x6 puts the median at ~0.48 and p90 at ~0.9, the 0.3-0.9 mouth range the mascot was drawn for.
export const LEVEL_GAIN = 6;

export function levelOf(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.min(1, Math.sqrt(sum / samples.length) * LEVEL_GAIN);
}

export function smooth(previous, next) {
  return previous * 0.6 + next * 0.4;
}

// The mouth as a few drawn shapes rather than a scale that follows every
// frame: at 60 changes a second it flapped; cartoons change the mouth about
// 10-12 times a second, which reads as speech. MOUTH_OPEN is how far each
// shape opens (closed, slightly, half, wide).
export const MOUTH_OPEN = [0, 0.4, 0.7, 1];
// Between the shapes, on the smoothed level. In headless Chromium with an
// ElevenLabs clip (3.11.2026) it ran p10 0.03, p50 0.42, p90 0.71-0.77: pauses
// close the mouth, ordinary speech is half open, its loudest tenth wide.
const MOUTH_STEPS = [0.15, 0.35, 0.6];
// A level must pass a step by this much to change the shape, or it would
// flicker while it hovers at the step.
const MOUTH_HYSTERESIS = 0.04;
const MOUTH_HOLD_MS = 90;

export function createMouth() {
  let shape = 0;
  let changedAt = -Infinity;
  return {
    // A shape given outright (from the letters being said), still held for MOUTH_HOLD_MS.
    show(now, next) {
      if (next !== shape && now - changedAt >= MOUTH_HOLD_MS) {
        shape = next;
        changedAt = now;
      }
      return shape;
    },
    // The shape (an index of MOUTH_OPEN) for the level at this moment.
    update(now, level) {
      if (now - changedAt < MOUTH_HOLD_MS) return shape;
      let next = shape;
      while (next < MOUTH_STEPS.length && level > MOUTH_STEPS[next] + MOUTH_HYSTERESIS) next += 1;
      while (next > 0 && level < MOUTH_STEPS[next - 1] - MOUTH_HYSTERESIS) next -= 1;
      if (next !== shape) {
        shape = next;
        changedAt = now;
      }
      return shape;
    },
  };
}
