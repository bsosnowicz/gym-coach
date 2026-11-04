// Plays the coach's voice in voice mode (COACH_AVATAR=voice): PCM 16-bit
// 24 kHz chunks from the session events, one after another without gaps, as
// the avatar would. The server counts the same timeline to know when the
// coach has finished (src/adapters/avatar/browser-voice.js).

import { levelOf } from "./voice-level.js";
import { cuesFrom, shapeAt } from "./visemes.js";

const SAMPLE_RATE = 24000;
// Scheduling a chunk a moment ahead avoids a click when the previous one has
// already run out.
const LEAD_S = 0.05;

// Call it from the click that starts the lesson, before any await: iOS lets a
// page play sound only from an AudioContext made or resumed in a user gesture.
export function createVoicePlayer() {
  const context = new AudioContext();
  context.resume().catch(() => {});
  const output = context.createGain();
  output.connect(context.destination);
  // The same sound as a MediaStreamTrack, for the "when is it audible" probe (avatar-onset.js).
  const stream = context.createMediaStreamDestination();
  output.connect(stream);
  // The mascot's mouth follows this (voice-level.js).
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  output.connect(analyser);
  const frame = new Float32Array(analyser.fftSize);

  let playAt = 0;
  const playing = new Set();
  // The mouth's shapes for the audio playing now, from the letters that came
  // with it. Chunks played back to back are one run; a run without letters
  // (a resumed reply, a fixed message) leaves the mouth to the loudness.
  let cues = [];
  let runHasLetters = false;

  function stop() {
    for (const source of playing) {
      try { source.stop(); } catch (_) {}
    }
    playing.clear();
    playAt = 0;
    cues = [];
    runHasLetters = false;
  }

  return {
    track: stream.stream.getAudioTracks()[0],
    get blocked() {
      return context.state !== "running";
    },
    resume: () => context.resume(),

    // An index of MOUTH_OPEN for what is heard now, or null: no letters for it.
    mouth() {
      // currentTime is the sample being made; it is heard outputLatency later.
      const heard = context.currentTime - (context.outputLatency || 0);
      if (!runHasLetters || heard >= playAt) return null;
      return shapeAt(cues, heard);
    },

    level() {
      analyser.getFloatTimeDomainData(frame);
      return levelOf(frame);
    },

    // letters: { chars, ms } said in this chunk, ms from its start.
    push(base64, letters = null) {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const samples = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
      if (!samples.length) return;
      const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) channel[index] = samples[index] / 32768;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      const startAt = Math.max(playAt, context.currentTime + LEAD_S);
      if (startAt > playAt) {
        cues = [];
        runHasLetters = false;
      }
      playAt = startAt;
      if (letters) {
        cues.push(...cuesFrom(letters, playAt));
        runHasLetters = true;
      }
      source.start(playAt);
      playAt += buffer.duration;
      playing.add(source);
      source.onended = () => playing.delete(source);
    },

    stop,

    close() {
      stop();
      context.close().catch(() => {});
    },
  };
}
