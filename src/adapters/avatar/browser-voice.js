// Avatar adapter without a face: the coach's speech goes to the page as PCM in
// the session events, and the page plays it (public/session/voice-player.js).
// Unlike the LiveAvatar sandbox it has no time limit and no one-session limit,
// and a minute of the session costs about a third (language-coach ROADMAP, step 2).
//
// LiveAvatar tells the engine when it starts and stops speaking. Here nothing
// plays on the server, so the same moments come from a clock: the page plays
// the chunks back to back as they arrive, as the avatar does.

const crypto = require("crypto");

const BYTES_PER_SEC = 48000; // PCM16 mono @ 24 kHz, as the TTS adapter gives it
const BYTES_PER_MS = BYTES_PER_SEC / 1000;
// One event per chunk: few events, and the first one leaves after 250 ms of
// audio, as the first chunk to LiveAvatar does.
const CHUNK_BYTES = Math.floor(BYTES_PER_SEC * 0.25);
// The page hears a chunk a little after it was sent: events reached it within
// 0.1 s through the Cloudflare quick tunnel (3.11.2026) and the player starts
// 50 ms ahead. "Speak ended" this long after the last sample, so the
// microphone does not take the tail of the coach's voice for the learner.
const END_MARGIN_MS = 300;

function createBrowserVoice({ now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return {
    async start({ onSpeakStarted = () => {}, onSpeakEnded = () => {}, send }) {
      // When the page will have played everything sent so far.
      let playedUntil = null;
      let speaking = false;
      let endTimer = null;

      const finish = () => {
        clearTimer(endTimer);
        endTimer = null;
        playedUntil = null;
        if (!speaking) return;
        speaking = false;
        onSpeakEnded();
      };

      const sendChunk = (pcm, letters) => {
        send({ stage: "audio", pcm: pcm.toString("base64"), ...(letters && { letters }) });
        const at = now();
        playedUntil = Math.max(playedUntil ?? at, at) + pcm.length / BYTES_PER_MS;
        if (!speaking) {
          speaking = true;
          onSpeakStarted();
        }
      };

      // Stops the page at once. The events keep their order, so the next
      // speech can follow straight away: no settle time as with LiveAvatar.
      const interrupt = () => {
        send({ stage: "audio_stop" });
        finish();
      };

      return {
        sessionId: crypto.randomUUID(),
        client: { mode: "voice" },

        beginSpeech({ onFirstChunk = () => {} } = {}) {
          let buffer = Buffer.alloc(0);
          let sentAny = false;
          // Bytes of this speech received and sent on; letters waiting for the
          // chunk they are said in, by their byte in the speech.
          let received = 0;
          let sent = 0;
          let waiting = [];
          // The letters said within the chunk, in ms from its start; one said
          // before it (late) counts as said at its start.
          const lettersIn = (length) => {
            const end = sent + length;
            const due = waiting.filter((letter) => letter.at < end);
            waiting = waiting.filter((letter) => letter.at >= end);
            if (!due.length) return null;
            return {
              chars: due.map((letter) => letter.char).join(""),
              ms: due.map((letter) => Math.max(0, Math.round((letter.at - sent) / BYTES_PER_MS))),
            };
          };
          const flush = (chunk) => {
            sendChunk(chunk, lettersIn(chunk.length));
            sent += chunk.length;
            if (!sentAny) { sentAny = true; onFirstChunk(); }
          };
          return {
            push(pcm, letters) {
              if (letters) {
                Array.from(letters.chars).forEach((char, index) => {
                  waiting.push({ char, at: received + letters.ms[index] * BYTES_PER_MS });
                });
              }
              received += pcm.length;
              buffer = Buffer.concat([buffer, pcm]);
              while (buffer.length >= CHUNK_BYTES) {
                flush(buffer.subarray(0, CHUNK_BYTES));
                buffer = buffer.subarray(CHUNK_BYTES);
              }
            },
            end() {
              // Every chunk before is whole samples; an odd last byte would be noise.
              const rest = buffer.subarray(0, buffer.length - (buffer.length % 2));
              buffer = Buffer.alloc(0);
              if (rest.length) flush(rest);
              if (!speaking) return;
              clearTimer(endTimer);
              endTimer = setTimer(finish, Math.max(0, playedUntil - now()) + END_MARGIN_MS);
            },
          };
        },

        interrupt,
        async settleAfterInterrupt() { interrupt(); },
        async whenInterruptSettled() {},
        // LiveAvatar's listening pose; nothing to show here.
        startListening() {},
        stopListening() {},

        async stop() {
          clearTimer(endTimer);
          speaking = false;
        },
      };
    },
  };
}

module.exports = { createBrowserVoice, END_MARGIN_MS };
