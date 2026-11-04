// TTS adapter: ElevenLabs multi-context WebSocket, PCM 16-bit 24 kHz output
// (the exact format LiveAvatar Lite expects, so no resampling).

const { providerFailure } = require("../../engine/provider-failure");

// Flash v2.5 answers ~250 ms sooner but reads a phrase quoted in the other
// language with the accent of the surrounding sentence.
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
// Lower stability lets tempo and timbre drift between short chunks.
const VOICE_SETTINGS = { stability: 0.7, similarity_boost: 0.8 };
// Shorter than the default schedule: earlier first audio at some cost in prosody.
const GENERATION_CONFIG = { chunk_length_schedule: [50, 90, 120, 150] };
const OPEN_TIMEOUT_MS = 10000;
// "isFinal" is sometimes lost; this long without audio after all text was sent counts as done.
const QUIET_MS = 2000;
const SYNTHESIZE_TIMEOUT_MS = 20000;
const BYTES_PER_MS = 48; // PCM16 mono @ 24 kHz

// A refusal as the server log shows it. A used-up quota or a rejected key is
// a matter of the account, not an outage: retrying will not help, so it says so.
function describeRefusal(detail) {
  if (/quota/i.test(detail)) return `wyczerpany limit znaków ElevenLabs — doładuj plan albo podmień klucz (${detail})`;
  if (/invalid_api_key|unauthori[sz]ed/i.test(detail)) return `nieprawidłowy albo wygasły klucz ElevenLabs (${detail})`;
  return detail;
}

function failureFromMessage(message) {
  if (!message || typeof message !== "object") return null;
  const type = String(message.type || message.message_type || "").toLowerCase();
  if (message.error || type === "error" || type.endsWith("_error")) {
    const code = typeof message.error === "string" ? message.error : message.error?.message;
    const detail = [code, message.message].filter(Boolean).join(": ") || "ElevenLabs zgłosił błąd.";
    return providerFailure("tts", new Error(describeRefusal(String(detail))));
  }
  return null;
}

function createElevenLabsTts({
  apiKey,
  modelId = DEFAULT_MODEL_ID,
  WebSocketImpl = globalThis.WebSocket,
}) {
  let contextCounter = 0;
  // Characters sent for synthesis since the process started: what ElevenLabs bills.
  let characters = 0;

  // Voice and enforced language are part of the socket URL, so changing either
  // means a new connection.
  function keyFor({ voiceId, languageCode = null }) {
    return `${voiceId}|${languageCode || ""}`;
  }

  function openSocket({ voiceId, languageCode = null }) {
    if (!voiceId) return Promise.reject(new Error("ElevenLabs: brak voiceId."));
    return new Promise((resolve, reject) => {
      const query = new URLSearchParams({ model_id: modelId, output_format: "pcm_24000" });
      if (languageCode) query.set("language_code", languageCode);
      const ws = new WebSocketImpl(`wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/multi-stream-input?${query}`);
      const timeout = setTimeout(() => reject(new Error("ElevenLabs: WebSocket nie otworzył się w 10s.")), OPEN_TIMEOUT_MS);
      ws.onopen = () => { clearTimeout(timeout); resolve(ws); };
      ws.onerror = (e) => { clearTimeout(timeout); reject(new Error(e.message || "ElevenLabs: błąd WebSocket.")); };
    });
  }

  // One spoken reply on an open socket. Text goes in fragment by fragment,
  // audio comes back through onAudio; `finished` settles when the audio is complete.
  function startUtterance(ws, { onAudio, signal }) {
    const contextId = `ctx-${Date.now()}-${contextCounter += 1}`;
    let ended = false;
    let allTextSent = false;
    let gotAudio = false;
    let quietTimer = null;
    let settle;
    const finished = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    finished.catch(() => {});

    // When each letter is said, for the mascot's mouth in voice mode. ElevenLabs
    // counts these times from the start of the context, not of the audio chunk
    // they come with (measured in language-coach 3.11.2026: a chunk of 1340 ms
    // of audio carried letters up to 1858 ms, the next one started again at 0).
    // Returned as ms from the start of this chunk.
    let lettersUntilMs = 0;
    let audioUntilMs = 0;
    const lettersOf = (alignment, pcm) => {
      const chunkStartMs = audioUntilMs;
      audioUntilMs += pcm.length / BYTES_PER_MS;
      const chars = alignment?.chars;
      if (!chars?.length) return null;
      const from = lettersUntilMs;
      const last = chars.length - 1;
      lettersUntilMs += alignment.charStartTimesMs[last] + alignment.charDurationsMs[last];
      return { chars: chars.join(""), ms: alignment.charStartTimesMs.map((at) => Math.round(from + at - chunkStartMs)) };
    };

    let contextClosed = false;
    const closeContext = () => {
      if (contextClosed) return;
      contextClosed = true;
      try { ws.send(JSON.stringify({ context_id: contextId, close_context: true })); } catch (_) {}
    };
    function fail(error) {
      if (ended) return;
      ended = true;
      clearTimeout(quietTimer);
      closeContext();
      settle.reject(providerFailure("tts", error));
    }
    function finish() {
      if (ended) return;
      // ElevenLabs can answer a bad key or an exhausted quota with silence.
      if (!gotAudio) { fail(new Error("ElevenLabs nie zwrócił audio.")); return; }
      ended = true;
      clearTimeout(quietTimer);
      closeContext();
      settle.resolve();
    }
    function scheduleQuietCheck() {
      if (ended) return;
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => { if (allTextSent) finish(); }, QUIET_MS);
    }

    ws.onmessage = (ev) => {
      if (ended || signal?.aborted) return;
      let parsed;
      try { parsed = JSON.parse(ev.data); } catch (_) { return; }
      const messageContextId = parsed.contextId || parsed.context_id;
      if (messageContextId && messageContextId !== contextId) return;
      const reported = failureFromMessage(parsed);
      if (reported) { fail(reported); return; }
      if (parsed.audio) {
        gotAudio = true;
        const pcm = Buffer.from(parsed.audio, "base64");
        onAudio(pcm, lettersOf(parsed.alignment, pcm));
        scheduleQuietCheck();
      }
      if (parsed.isFinal) finish();
    };
    ws.onerror = (event) => fail(new Error(event?.message || "Błąd WebSocket ElevenLabs."));
    ws.onclose = (event) => {
      if (ended || signal?.aborted) return;
      // The reason of the close is where ElevenLabs may say why, e.g. the quota.
      fail(new Error(describeRefusal(`Połączenie ElevenLabs zostało zamknięte${event?.reason ? `: ${event.reason}` : "."}`)));
    };

    ws.send(JSON.stringify({
      text: " ",
      context_id: contextId,
      voice_settings: VOICE_SETTINGS,
      generation_config: GENERATION_CONFIG,
      xi_api_key: apiKey,
    }));

    return {
      finished,
      sendText(text) {
        characters += text.length;
        ws.send(JSON.stringify({ text, context_id: contextId }));
      },
      end() {
        ws.send(JSON.stringify({ text: "", context_id: contextId, flush: true }));
        // Measured: after a flush alone ElevenLabs never sends isFinal, so the
        // end waited QUIET_MS of silence (2 s on every reply, and between the
        // parts of a reply). Closed right away, the context still says all it
        // was given and sends isFinal with its last audio.
        closeContext();
        allTextSent = true;
        scheduleQuietCheck();
      },
      cancel() {
        if (ended) return;
        ended = true;
        clearTimeout(quietTimer);
        closeContext();
      },
    };
  }

  // A spoken reply in which text between « and » is in the taught language.
  // Generated together with the sentence around it, a German phrase takes the
  // accent of the Polish sentence; generated on its own it sounds German. So
  // the reply is cut at « and » and each part is a context of its own, one after
  // another and in order. Generation runs ahead of speech, so the next part is
  // ready before the avatar has finished saying the previous one.
  function startSpeech(ws, { onAudio, signal }) {
    let inside = false;
    let current = null;
    let active = null;
    let stopped = false;
    let queue = Promise.resolve();
    let settle;
    // Rejects as soon as any part fails, so the turn can stop the model mid-reply.
    const finished = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    finished.catch(() => {});

    function closeCurrent() {
      current?.close();
      current = null;
    }
    // A part is opened only for text with something to say: a context without
    // words, like the full stop after «der Beruf», gets no audio, which would
    // count as a failure.
    function partFor(text) {
      if (current) return current;
      if (!/[\p{L}\p{N}]/u.test(text)) return null;
      const part = { utterance: null, pending: [] };
      const closed = new Promise((resolve) => { part.close = resolve; });
      queue = queue.then(async () => {
        if (stopped) return;
        part.utterance = startUtterance(ws, { onAudio, signal });
        active = part.utterance;
        // A failure while the part is still receiving text stops the reply at once.
        part.utterance.finished.catch((error) => {
          stopped = true;
          settle.reject(error);
        });
        part.pending.forEach((pending) => part.utterance.sendText(pending));
        part.pending = null;
        await closed;
        if (stopped) return;
        part.utterance.end();
        await part.utterance.finished;
      }).catch((error) => {
        stopped = true;
        settle.reject(error);
      });
      current = part;
      return part;
    }

    return {
      finished,
      sendText(text) {
        // « and » may fall in different fragments: whether we are inside carries over.
        for (const piece of text.split(/([«»])/)) {
          if (piece === "«" || piece === "»") {
            if ((piece === "«") !== inside) closeCurrent();
            inside = piece === "«";
            continue;
          }
          const part = piece && partFor(piece);
          if (!part) continue;
          if (part.utterance) part.utterance.sendText(piece);
          else part.pending.push(piece);
        }
      },
      end() {
        closeCurrent();
        queue.then(() => { if (!stopped) settle.resolve(); });
      },
      cancel() {
        stopped = true;
        closeCurrent();
        active?.cancel();
      },
    };
  }

  return {
    keyFor,
    usage: () => ({ characters }),

    // Session-long connection: the handshake is paid once, not on every turn.
    async open(speech) {
      const ws = await openSocket(speech);
      ws.onclose = () => {};
      ws.onerror = () => {};
      return {
        key: keyFor(speech),
        isOpen: () => ws.readyState === 1,
        startUtterance: (options) => startSpeech(ws, options),
        close() {
          try { ws.send(JSON.stringify({ close_socket: true })); } catch (_) {}
          try { ws.close(); } catch (_) {}
        },
      };
    },

    // Whole text to one PCM buffer on a DEDICATED socket, so it never competes
    // with a live turn for the session connection's single message handler.
    async synthesize(text, { voiceId, languageCode = null, signal } = {}) {
      const ws = await openSocket({ voiceId, languageCode });
      const chunks = [];
      const utterance = startSpeech(ws, { onAudio: (pcm) => chunks.push(pcm), signal });
      let watchdog = null;
      try {
        utterance.sendText(text);
        utterance.end();
        await Promise.race([
          utterance.finished,
          new Promise((_, reject) => {
            const abort = () => reject(Object.assign(new Error("przerwane"), { name: "AbortError" }));
            if (signal?.aborted) abort();
            else signal?.addEventListener("abort", abort, { once: true });
            watchdog = setTimeout(() => reject(new Error("ElevenLabs nie odesłał audio w 20s")), SYNTHESIZE_TIMEOUT_MS);
          }),
        ]);
        return Buffer.concat(chunks);
      } finally {
        clearTimeout(watchdog);
        utterance.cancel();
        try { ws.close(); } catch (_) {}
      }
    },
  };
}

module.exports = { createElevenLabsTts, failureFromMessage };
