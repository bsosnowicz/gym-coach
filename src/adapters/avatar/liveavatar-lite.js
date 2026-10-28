// Avatar adapter: LiveAvatar in LITE mode. LiveAvatar only renders the face from
// audio we send; it does no speech recognition, no LLM and no TTS, so it is
// indifferent to the spoken language.
//
// Verified against the live API:
// - /sessions/token {mode:"LITE"} then /sessions/start returns livekit_url,
//   livekit_client_token (video for the browser) and ws_url (control, server side).
// - Audio for agent.speak MUST be PCM 16-bit, 24 kHz, mono, base64. A wrong
//   format gives a mute or distorted avatar WITHOUT any error.
// - Commands sent before the socket reports "connected" are silently dropped.
// - Stopping uses POST /sessions/stop with the session token as Bearer.
// - An account allows one concurrent session, so a session must always be stopped.

const crypto = require("crypto");
const { httpProblem } = require("../../engine/provider-failure");

const API_URL = "https://api.liveavatar.com/v1";
// The only avatar the docs list as available in sandbox mode (Wayne).
const SANDBOX_AVATAR_ID = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";
const BYTES_PER_SEC = 48000; // PCM16 mono @ 24 kHz
const BYTES_PER_MS = BYTES_PER_SEC / 1000;
// Below the recommended 600 ms: the avatar starts speaking sooner.
const FIRST_CHUNK_BYTES = Math.floor(BYTES_PER_SEC * 0.25);
// Measured (scripts/measure-speech-flow.js, 23.10, eleven_multilingual_v2, 6
// replies): with 1 s chunks after the first 250 ms the avatar ran out of audio
// in 2 of 6 replies (up to 76 ms, heard as a stutter): it had to wait for a
// whole second to arrive. With 250 ms chunks: no gap, same start.
const NEXT_CHUNK_BYTES = Math.floor(BYTES_PER_SEC * 0.25);
// Shorter waits are jitter of the measurement, not something the learner hears.
const MIN_GAP_MS = 20;
const CONNECT_TIMEOUT_MS = 10000;
// The idle limit is 5 minutes.
const KEEP_ALIVE_MS = 100000;
// Time the avatar needs to act on an interrupt before new audio is safe to send.
const INTERRUPT_SETTLE_MS = 600;
const REQUEST_TIMEOUT_MS = 10000;

function avatarSessionLimitS(reported, override = 0) {
  const limit = Number(reported);
  const duration = Number.isFinite(limit) && limit > 0 ? limit : 1200;
  return Number.isFinite(override) && override > 0 ? Math.min(override, duration) : duration;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function command(type, extra = {}) {
  return JSON.stringify({ type, event_id: extra.event_id || crypto.randomUUID(), ...extra });
}

// The avatar plays each chunk of a reply once it has it, one after another.
// This keeps the same clock and notes every moment it would have nothing left
// to play: a gap the learner hears as a stutter. It assumes playback starts as
// the first chunk is sent; the avatar starts a little later, so a real gap is
// at most this long.
function createPlaybackClock(now = () => performance.now()) {
  let playedUntil = null;
  const gaps = [];
  return {
    sent(ms) {
      const at = now();
      if (playedUntil !== null && at - playedUntil >= MIN_GAP_MS) gaps.push(Math.round(at - playedUntil));
      playedUntil = Math.max(playedUntil ?? at, at) + ms;
    },
    gaps: () => gaps,
  };
}

function createLiveAvatarLite({
  apiKey,
  avatarId = null,
  sandbox = true,
  videoQuality = "medium",
  sessionLimitS = 0,
  WebSocketImpl = globalThis.WebSocket,
}) {
  // Sandbox rejects any other avatar with a 400, so a configured id only applies outside it.
  const resolvedAvatarId = sandbox ? SANDBOX_AVATAR_ID : avatarId;

  async function stopRemote(sessionId, sessionToken) {
    const res = await fetch(`${API_URL}/sessions/stop`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!res.ok) throw new Error(`LiveAvatar: zamknięcie sesji nieudane (${httpProblem(res.status)}).`);
  }

  return {
    sandbox,

    async start({ onSpeakStarted = () => {}, onSpeakEnded = () => {} } = {}) {
      if (!resolvedAvatarId) throw new Error("Brak LIVEAVATAR_AVATAR_ID (wymagane poza sandboxem).");
      if (typeof WebSocketImpl === "undefined") {
        throw new Error("Ten proces Node nie ma natywnego WebSocket — uruchom pod Node 22+.");
      }

      const tokenRes = await fetch(`${API_URL}/sessions/token`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
        body: JSON.stringify({
          mode: "LITE",
          avatar_id: resolvedAvatarId,
          is_sandbox: sandbox,
          video_settings: { quality: videoQuality },
        }),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      const sessionToken = tokenData?.data?.session_token;
      // Provider payloads can carry session credentials, so they are never logged.
      if (!tokenRes.ok || !sessionToken) throw new Error(`LiveAvatar nie zwrócił session_token (${httpProblem(tokenRes.status)}).`);

      const startedAt = Date.now();
      let startData;
      try {
        const startRes = await fetch(`${API_URL}/sessions/start`, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          method: "POST",
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        startData = await startRes.json().catch(() => ({}));
        if (!startRes.ok || !startData?.data?.ws_url || !startData.data.session_id
          || !startData.data.livekit_url || !startData.data.livekit_client_token) {
          throw new Error(`LiveAvatar nie zwrócił połączenia sesji (${httpProblem(startRes.status)}).`);
        }
      } catch (error) {
        await stopRemote(startData?.data?.session_id || tokenData?.data?.session_id, sessionToken).catch(() => {});
        throw error;
      }
      const sessionId = startData?.data?.session_id;
      const wsUrl = startData?.data?.ws_url;
      let ws;
      let stopped = false;
      let stopPromise = null;
      let lastInterruptAt = 0;

      try {
        ws = new WebSocketImpl(wsUrl);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("LiveAvatar: WebSocket nie potwierdził połączenia w 10s.")), CONNECT_TIMEOUT_MS);
          ws.onerror = (e) => { clearTimeout(timeout); reject(new Error(e.message || "LiveAvatar: błąd WebSocket.")); };
          ws.onclose = () => { clearTimeout(timeout); reject(new Error("LiveAvatar: połączenie zamknięte przed gotowością.")); };
          ws.onmessage = (ev) => {
            let parsed;
            try { parsed = JSON.parse(ev.data); } catch (_) { return; }
            if (parsed.type === "session.state_updated" && parsed.state === "connected") {
              clearTimeout(timeout);
              resolve();
            } else if (parsed.type === "agent.speak_started") {
              onSpeakStarted();
            } else if (parsed.type === "agent.speak_ended") {
              onSpeakEnded();
            }
          };
        });
      } catch (error) {
        // The session already exists remotely and would block the one-session limit.
        try { ws?.close(); } catch (_) {}
        await stopRemote(sessionId, sessionToken).catch(() => {});
        throw error;
      }

      ws.onerror = (e) => console.warn(`LiveAvatar [${sessionId}]: błąd WebSocket: ${e.message || ""}`);
      ws.onclose = () => { if (!stopped) console.warn(`LiveAvatar [${sessionId}]: WebSocket zamknięty.`); };
      const send = (type, extra) => ws.send(command(type, extra));
      const keepAlive = setInterval(() => {
        try { send("session.keep_alive"); } catch (_) {}
      }, KEEP_ALIVE_MS);

      return {
        sessionId,
        durationMs: avatarSessionLimitS(startData.data.max_session_duration, sessionLimitS) * 1000,
        expiresAt: startedAt + avatarSessionLimitS(startData.data.max_session_duration, sessionLimitS) * 1000,
        // What the browser needs to join the LiveKit room (video only).
        client: {
          livekitUrl: startData.data.livekit_url,
          livekitToken: startData.data.livekit_client_token,
        },

        // One spoken reply. PCM is forwarded in chunks as it arrives from TTS.
        beginSpeech({ onFirstChunk = () => {} } = {}) {
          const eventId = `speak-${Date.now()}`;
          let buffer = Buffer.alloc(0);
          let chunkTarget = FIRST_CHUNK_BYTES;
          let sentAny = false;
          const clock = createPlaybackClock();
          const sendChunk = (chunk) => {
            send("agent.speak", { event_id: eventId, audio: chunk.toString("base64") });
            clock.sent(chunk.length / BYTES_PER_MS);
            if (!sentAny) { sentAny = true; onFirstChunk(); }
          };
          return {
            push(pcm) {
              buffer = Buffer.concat([buffer, pcm]);
              while (buffer.length >= chunkTarget) {
                sendChunk(buffer.subarray(0, chunkTarget));
                buffer = buffer.subarray(chunkTarget);
                chunkTarget = NEXT_CHUNK_BYTES;
              }
            },
            end() {
              if (buffer.length) sendChunk(buffer);
              buffer = Buffer.alloc(0);
              send("agent.speak_end", { event_id: eventId });
              // Audio that came slower than speech: the place to look when the learner hears a stutter.
              const gaps = clock.gaps();
              if (gaps.length) {
                console.warn(`LiveAvatar [${sessionId}]: dziura w dopływie audio — ${gaps.length}×, razem ${gaps.reduce((sum, gap) => sum + gap, 0)} ms, najdłuższa ${Math.max(...gaps)} ms.`);
              }
            },
          };
        },

        interrupt() {
          send("agent.interrupt");
          lastInterruptAt = Date.now();
        },

        // Waits out the interrupt window counted from the LAST interrupt, so
        // synthesis time and settle time overlap instead of adding up.
        async settleAfterInterrupt() {
          const since = Date.now() - lastInterruptAt;
          if (since >= INTERRUPT_SETTLE_MS) {
            this.interrupt();
            await sleep(INTERRUPT_SETTLE_MS);
            return;
          }
          await sleep(INTERRUPT_SETTLE_MS - since);
        },

        // For audio that follows a known interrupt: only the rest of its window.
        async whenInterruptSettled() {
          const since = Date.now() - lastInterruptAt;
          if (since < INTERRUPT_SETTLE_MS) await sleep(INTERRUPT_SETTLE_MS - since);
        },

        startListening() {
          send("agent.start_listening");
        },

        stopListening() {
          send("agent.stop_listening");
        },

        async stop() {
          if (stopPromise) return stopPromise;
          stopped = true;
          clearInterval(keepAlive);
          try { ws.close(); } catch (_) {}
          stopPromise = stopRemote(sessionId, sessionToken).catch((error) => {
            stopPromise = null;
            throw error;
          });
          return stopPromise;
        },
      };
    },
  };
}

module.exports = { createLiveAvatarLite, createPlaybackClock, avatarSessionLimitS, SANDBOX_AVATAR_ID };
