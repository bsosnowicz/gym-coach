// STT adapter: Groq Whisper. The language is chosen per request, which is what
// makes switching the practice direction mid-session possible.

const { httpProblem, providerFailure } = require("../../engine/provider-failure");

// "turbo" transcribes several times faster than full large-v3, and STT sits on
// the latency-critical path.
const DEFAULT_MODEL = "whisper-large-v3-turbo";
const DEFAULT_TIMEOUT_MS = 15000;
// How much less confident (avg_logprob) the reading in the expected language
// may be and still win. Measured on short answers: German with a Polish accent
// read as Polish -0.44 "Derberów" vs as German -0.69 "Derberuf" (0.25 apart);
// Polish "nie wiem" -0.10 vs -0.28, same text; a Polish question forced into
// German became a German translation at -0.93 against -0.18 (0.75 apart).
const EXPECTED_LANGUAGE_MARGIN = 0.3;
// Groq bills every request as at least this long.
const BILLED_MIN_SECONDS = 10;

function fileExtension(contentType) {
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("ogg")) return "ogg";
  return "webm";
}

function createGroqWhisperStt({ apiKey, model = DEFAULT_MODEL, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  // Since the process started; a second reading of the same recording is a request of its own.
  const usage = { requests: 0, audioSeconds: 0, billedSeconds: 0 };

  async function request({ audio, contentType, language }) {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: contentType }), `speech.${fileExtension(contentType)}`);
    form.append("model", model);
    if (language) form.append("language", language);
    // verbose_json for the per-segment metrics; "text" is identical to plain json.
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");

    const startedAt = performance.now();
    let response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      console.error(`STT: dostawca nie odpowiedział (${error.name || "Error"}).`);
      throw providerFailure("stt", error, { code: error.name === "TimeoutError" ? "provider_timeout" : "provider_unavailable" });
    }
    if (!response.ok) {
      console.error(`STT: Groq Whisper ${httpProblem(response.status)}.`);
      throw providerFailure("stt", new Error(httpProblem(response.status)));
    }

    let body;
    try {
      body = await response.json();
    } catch (error) {
      throw providerFailure("stt", error);
    }
    const seconds = Number(body.duration) || 0;
    usage.requests += 1;
    usage.audioSeconds += seconds;
    usage.billedSeconds += Math.max(seconds, BILLED_MIN_SECONDS);
    const text = (body.text || "").trim();
    const detectedLanguage = body.language || null;
    const segments = Array.isArray(body.segments) ? body.segments : [];
    const worst = (field, pick) => segments.reduce(
      (acc, segment) => (typeof segment?.[field] === "number" ? pick(acc, segment[field]) : acc),
      null
    );
    const avgLogprob = worst("avg_logprob", (a, b) => (a === null ? b : Math.min(a, b)));

    if (text) {
      const fmt = (value) => (typeof value === "number" ? value.toFixed(2) : "?");
      console.log(
        `STT: "${text.slice(0, 60)}" · ${Math.round(performance.now() - startedAt)} ms · ` +
        `zadany=${language || "auto"} · wykryty=${detectedLanguage || "?"} · ` +
        `no_speech=${fmt(worst("no_speech_prob", (a, b) => (a === null ? b : Math.max(a, b))))} · ` +
        `avg_logprob=${fmt(avgLogprob)} · ` +
        `compression=${fmt(worst("compression_ratio", (a, b) => (a === null ? b : Math.max(a, b))))} · ` +
        `audio=${(audio.length / 1024).toFixed(1)}kB`
      );
    }
    return { text, language: detectedLanguage, avgLogprob };
  }

  return {
    usage: () => ({ ...usage }),

    // language: ISO-639-1 code, or null to let Whisper detect it.
    // candidates: the languages detection may land on, as { code, name }.
    // hallucinations: patterns of phrases Whisper invents on silence or noise.
    // expected: the candidate the answer should be in, when the task says so.
    async transcribe({ audio, contentType = "audio/webm", language = null, candidates = [], hallucinations = [], expected = null }) {
      if (!apiKey) throw providerFailure("stt", new Error("Brak GROQ_API_KEY."));
      if (!audio?.length) {
        const error = new Error("Puste nagranie.");
        error.statusCode = 400;
        error.expose = true;
        throw error;
      }

      let result = await request({ audio, contentType, language });

      // Whisper detects among ~100 languages and, once it picks a wrong one,
      // writes the utterance out translated into it. Outside the candidates the
      // transcript is unusable, so each candidate is forced and the more
      // confident one wins.
      const detected = (result.language || "").toLowerCase();
      const known = candidates.find(({ code, name }) => detected === code || detected === name.toLowerCase());
      const moreConfident = (best, next) => ((next.avgLogprob ?? -Infinity) > (best.avgLogprob ?? -Infinity) ? next : best);
      if (!language && candidates.length && result.text && !known) {
        console.log(`STT: wykryty język "${result.language || "?"}" spoza pary, ponawiam dla: ${candidates.map(({ code }) => code).join(", ")}.`);
        const retries = await Promise.all(candidates.map(({ code }) => request({ audio, contentType, language: code })));
        result = retries.reduce(moreConfident);
      } else if (!language && expected && result.text && known && known.code !== expected) {
        // A short utterance in the taught language, said with the learner's
        // accent, is easily taken for the learner's own language (German "der
        // Beruf" written down as Polish "Derberów"). The expected language is
        // tried too and wins unless clearly less confident, so a sentence really
        // said in the other language is not replaced by a translation.
        const forced = await request({ audio, contentType, language: expected });
        const chosen = forced.text && (forced.avgLogprob ?? -Infinity) + EXPECTED_LANGUAGE_MARGIN >= (result.avgLogprob ?? -Infinity) ? forced : result;
        console.log(`STT: wykryty "${known.code}", zadanie oczekuje "${expected}": wybrano ${chosen === forced ? expected : known.code}.`);
        result = chosen;
      }

      if (hallucinations.some((pattern) => pattern.test(result.text))) {
        console.log("STT: odrzucono potencjalną halucynację Whispera.");
        return { text: "", language: result.language };
      }
      return { text: result.text, language: result.language };
    },
  };
}

module.exports = { createGroqWhisperStt };
