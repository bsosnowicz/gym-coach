// The mascot's mouth from the letters of the coach's speech (voice mode): when
// each letter is said comes from ElevenLabs with the audio. One drawn mouth,
// four openings (voice-level.js, MOUTH_OPEN): a cartoon needs no more than
// open vowels wide, rounded ones half, the rest barely, lips together for m/b/p.
// The same for Polish, English and German: letters, not sounds, and for a
// drawing the difference does not show.

const WIDE = /[aąäáàâeęéèê]/;
const HALF = /[oóöôuüúùy]/;
const CLOSED = /[mbp]/;

// An index of MOUTH_OPEN, or null for a space: the mouth does not shut between words.
export function shapeOf(char) {
  const letter = char.toLowerCase();
  if (/\s/.test(letter)) return null;
  if (!/\p{L}/u.test(letter)) return 0;
  if (CLOSED.test(letter)) return 0;
  if (WIDE.test(letter)) return 3;
  if (HALF.test(letter)) return 2;
  return 1;
}

// letters: { chars, ms } from the start of a chunk that plays from startTime (s).
export function cuesFrom(letters, startTime) {
  const cues = [];
  Array.from(letters.chars).forEach((char, index) => {
    const shape = shapeOf(char);
    if (shape === null || shape === cues.at(-1)?.shape) return;
    cues.push({ time: startTime + letters.ms[index] / 1000, shape });
  });
  return cues;
}

// The shape of the last cue at or before time; closed before the first one.
export function shapeAt(cues, time) {
  let shape = 0;
  for (const cue of cues) {
    if (cue.time > time) break;
    shape = cue.shape;
  }
  return shape;
}
