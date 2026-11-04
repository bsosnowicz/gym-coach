const test = require("node:test");
const assert = require("node:assert/strict");

const { ProviderFailure, PROVIDER_MESSAGES } = require("../src/engine/provider-failure");
const { createGroqWhisperStt } = require("../src/adapters/stt/groq-whisper");
const { createElevenLabsTts, failureFromMessage } = require("../src/adapters/tts/elevenlabs");
const { diffUsage, usageLine } = require("../src/usage");

async function withFetch(fake, run) {
  const previous = global.fetch;
  global.fetch = fake;
  try { return await run(); } finally { global.fetch = previous; }
}

const audio = Buffer.from([1, 2, 3, 4]);

test("błędny klucz STT daje czytelny komunikat bez szczegółów dostawcy", async () => {
  const stt = createGroqWhisperStt({ apiKey: "invalid-secret-key" });
  await withFetch(
    async () => new Response('{"error":"invalid_api_key: invalid-secret-key"}', { status: 401 }),
    () => assert.rejects(stt.transcribe({ audio }), (error) => {
      assert.ok(error instanceof ProviderFailure);
      assert.equal(error.service, "stt");
      assert.equal(error.message, PROVIDER_MESSAGES.stt);
      assert.doesNotMatch(error.message, /invalid-secret-key|invalid_api_key/i);
      // The server log, not the user, learns that the key itself is the problem.
      assert.equal(error.cause.message, "HTTP 401 — nieprawidłowy albo wygasły klucz API");
      return true;
    })
  );
});

test("STT wysyła język tylko wtedy, gdy został zadany, i odrzuca halucynacje", async () => {
  const languages = [];
  const stt = createGroqWhisperStt({ apiKey: "key" });
  await withFetch(async (_url, init) => {
    languages.push(init.body.get("language"));
    return Response.json({ text: " Thanks for watching! ", language: "english" });
  }, async () => {
    assert.deepEqual(await stt.transcribe({ audio, language: "en" }), { text: "Thanks for watching!", language: "english" });
    const filtered = await stt.transcribe({ audio, hallucinations: [/^thanks for watching!$/i] });
    assert.equal(filtered.text, "");
  });
  assert.deepEqual(languages, ["en", null]);
});

test("STT liczy zapytania i sekundy nagrań, krótkie rozliczane jak 10 s", async () => {
  const stt = createGroqWhisperStt({ apiKey: "key" });
  const durations = [2.5, 14];
  await withFetch(async () => Response.json({ text: "hello", language: "english", duration: durations.shift() }), async () => {
    await stt.transcribe({ audio, language: "en" });
    await stt.transcribe({ audio, language: "en" });
  });
  assert.deepEqual(stt.usage(), { requests: 2, audioSeconds: 16.5, billedSeconds: 24 });
});

test("zużycie sesji to różnica liczników z jej początku i końca, tylko z modelami, które pracowały", () => {
  const before = { llm: { gemini: { calls: 3, inputTokens: 300, cachedTokens: 0, outputTokens: 30 }, groq: { calls: 1, inputTokens: 90, cachedTokens: 0, outputTokens: 9 } }, tts: { characters: 100 }, stt: { requests: 1, audioSeconds: 2, billedSeconds: 10 } };
  const after = { llm: { gemini: { calls: 5, inputTokens: 700, cachedTokens: 200, outputTokens: 70 }, groq: before.llm.groq }, tts: { characters: 250 }, stt: { requests: 3, audioSeconds: 7, billedSeconds: 30 } };
  const spent = diffUsage(before, after);
  assert.deepEqual(spent, {
    llm: { gemini: { calls: 2, inputTokens: 400, cachedTokens: 200, outputTokens: 40 } },
    tts: { characters: 150 },
    stt: { requests: 2, audioSeconds: 5, billedSeconds: 20 },
  });
  assert.equal(usageLine(spent, 7.25),
    "gemini: 2 wywołań, wejście 400 tokenów (z cache 200), wyjście 40 · TTS: 150 znaków · STT: 2 zapytań, 5 s nagrań (20 s do rozliczenia) · czas sesji: 7.3 min");
});

test("STT ponawia dla języków pary, gdy wykryty język jest spoza niej", async () => {
  const languages = [];
  const candidates = [{ code: "pl", name: "Polish" }, { code: "en", name: "English" }];
  const replies = {
    null: { text: "Onde moras?", language: "portuguese", segments: [{ avg_logprob: -0.3 }] },
    pl: { text: "Gdzie morze?", language: "polish", segments: [{ avg_logprob: -0.9 }] },
    en: { text: "Where do you live?", language: "english", segments: [{ avg_logprob: -0.2 }] },
  };
  const stt = createGroqWhisperStt({ apiKey: "key" });
  await withFetch(async (_url, init) => {
    languages.push(init.body.get("language"));
    return Response.json(replies[init.body.get("language")]);
  }, async () => {
    assert.deepEqual(await stt.transcribe({ audio, candidates }), { text: "Where do you live?", language: "english" });
    assert.deepEqual(languages, [null, "pl", "en"]);

    languages.length = 0;
    replies.null = replies.en;
    assert.equal((await stt.transcribe({ audio, candidates })).text, "Where do you live?");
    assert.deepEqual(languages, [null]);
  });
});

test("STT sprawdza język oczekiwany przez zadanie, gdy wykryty jest drugi język pary", async () => {
  const languages = [];
  const candidates = [{ code: "pl", name: "Polish" }, { code: "de", name: "German" }];
  // Readings measured on real Whisper (see EXPECTED_LANGUAGE_MARGIN).
  const replies = {
    null: { text: "Derberów.", language: "polish", segments: [{ avg_logprob: -0.44 }] },
    de: { text: "Derberuf", language: "german", segments: [{ avg_logprob: -0.69 }] },
  };
  const stt = createGroqWhisperStt({ apiKey: "key" });
  await withFetch(async (_url, init) => {
    languages.push(init.body.get("language"));
    return Response.json(replies[init.body.get("language")]);
  }, async () => {
    // German said with a Polish accent: a bit less confident as German, and still preferred.
    assert.deepEqual(await stt.transcribe({ audio, candidates, expected: "de" }), { text: "Derberuf", language: "german" });
    assert.deepEqual(languages, [null, "de"]);

    // A Polish question forced into German turns into a translation, far less confident: Polish stays.
    languages.length = 0;
    replies.null = { text: "Jak się mówi bilet po niemiecku?", language: "polish", segments: [{ avg_logprob: -0.18 }] };
    replies.de = { text: "Wie heißt es, bilet auf Englisch zu sagen?", language: "german", segments: [{ avg_logprob: -0.93 }] };
    assert.equal((await stt.transcribe({ audio, candidates, expected: "de" })).text, "Jak się mówi bilet po niemiecku?");

    // Detected as expected, or nothing expected: one request only.
    languages.length = 0;
    replies.null = replies.de;
    await stt.transcribe({ audio, candidates, expected: "de" });
    replies.null = { text: "Nie wiem.", language: "polish", segments: [{ avg_logprob: -0.2 }] };
    await stt.transcribe({ audio, candidates });
    assert.deepEqual(languages, [null, null]);
  });
});

test("błąd autoryzacji TTS jest rozpoznawany w wiadomości z WebSocketu", () => {
  const failure = failureFromMessage({ type: "auth_error", error: "invalid_api_key" });
  assert.equal(failure.service, "tts");
  assert.equal(failure.message, PROVIDER_MESSAGES.tts);
  assert.equal(failureFromMessage({ audio: "AAAA" }), null);
  assert.match(failure.cause.message, /^nieprawidłowy albo wygasły klucz ElevenLabs/);
});

test("wyczerpany limit ElevenLabs jest nazwany w logu, a uczeń widzi zwykły komunikat", () => {
  const failure = failureFromMessage({ error: "quota_exceeded", message: "This request exceeds your quota of 10000." });
  assert.equal(failure.message, PROVIDER_MESSAGES.tts);
  assert.equal(failure.cause.message, "wyczerpany limit znaków ElevenLabs — doładuj plan albo podmień klucz (quota_exceeded: This request exceeds your quota of 10000.)");
});

function fakeSocketClass(onSend) {
  return class FakeSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      queueMicrotask(() => this.onopen?.());
    }
    send(raw) { onSend(this, JSON.parse(raw)); }
    close() { this.readyState = 3; }
  };
}

test("TTS składa audio z kontekstu wypowiedzi i wymusza język w adresie połączenia", async () => {
  let url;
  const tts = createElevenLabsTts({
    apiKey: "key",
    WebSocketImpl: fakeSocketClass((socket, message) => {
      url = socket.url;
      if (!message.flush) return;
      const reply = (payload) => socket.onmessage({ data: JSON.stringify({ contextId: message.context_id, ...payload }) });
      queueMicrotask(() => {
        reply({ audio: Buffer.from("ab").toString("base64") });
        reply({ audio: Buffer.from("cd").toString("base64"), isFinal: true });
      });
    }),
  });
  const pcm = await tts.synthesize("Hello.", { voiceId: "voice-1", languageCode: "en" });
  assert.equal(pcm.toString(), "abcd");
  assert.match(url, /\/voice-1\/multi-stream-input\?.*language_code=en/);
});

test("TTS podaje czasy liter od początku kawałka audio, choć ElevenLabs liczy je od początku kontekstu", async () => {
  const tts = createElevenLabsTts({
    apiKey: "key",
    WebSocketImpl: fakeSocketClass((socket, message) => {
      if (!message.flush) return;
      const reply = (payload) => socket.onmessage({ data: JSON.stringify({ contextId: message.context_id, ...payload }) });
      const audio = Buffer.alloc(4800).toString("base64"); // 100 ms
      queueMicrotask(() => {
        // The first chunk's letters run past its audio (to 150 ms); the next ones start again at 0.
        reply({ audio, alignment: { chars: ["a", "b"], charStartTimesMs: [0, 60], charDurationsMs: [60, 90] } });
        reply({ audio, alignment: { chars: ["c"], charStartTimesMs: [0], charDurationsMs: [50] } });
        reply({ audio: "", isFinal: true });
      });
    }),
  });
  const connection = await tts.open({ voiceId: "voice-1" });
  const letters = [];
  const speech = connection.startUtterance({ onAudio: (_pcm, chunkLetters) => letters.push(chunkLetters) });
  speech.sendText("abc");
  speech.end();
  await speech.finished;
  // "c" is said at 150 ms of the context: 50 ms into the second chunk.
  assert.deepEqual(letters, [{ chars: "ab", ms: [0, 60] }, { chars: "c", ms: [50] }]);
  connection.close();
});

test("TTS czyta fragmenty w «» w osobnych kontekstach, po kolei, a samą interpunkcję pomija", async () => {
  const texts = new Map();
  const tts = createElevenLabsTts({
    apiKey: "key",
    WebSocketImpl: fakeSocketClass((socket, message) => {
      if (message.text?.trim()) texts.set(message.context_id, `${texts.get(message.context_id) || ""}${message.text}`);
      if (!message.flush) return;
      const reply = (payload) => socket.onmessage({ data: JSON.stringify({ contextId: message.context_id, ...payload }) });
      queueMicrotask(() => reply({ audio: Buffer.from(`[${texts.get(message.context_id)}]`).toString("base64"), isFinal: true }));
    }),
  });
  const connection = await tts.open({ voiceId: "voice-1" });
  const audio = [];
  const speech = connection.startUtterance({ onAudio: (pcm) => audio.push(pcm.toString()) });
  // As the sentence stream sends it: « and » may fall in different fragments.
  speech.sendText("Słowo: «der ");
  speech.sendText("Beruf». Powtórz proszę: «der Beruf».");
  speech.end();
  await speech.finished;
  assert.deepEqual(audio, ["[Słowo: ]", "[der Beruf]", "[. Powtórz proszę: ]", "[der Beruf]"]);
  // What ElevenLabs bills: the text sent, without « and » and without the full stop that was never sent.
  assert.deepEqual(tts.usage(), { characters: "Słowo: der Beruf. Powtórz proszę: der Beruf".length });
  connection.close();
});

test("TTS zamyka kontekst zaraz po flush: bez tego ElevenLabs nie przysyła isFinal i koniec czekał 2 s ciszy", async () => {
  const sent = [];
  const tts = createElevenLabsTts({
    apiKey: "key",
    // Like ElevenLabs: the end of a context (isFinal) comes only once it is closed.
    WebSocketImpl: fakeSocketClass((socket, message) => {
      sent.push(message.flush ? "flush" : message.close_context ? "close" : "text");
      const reply = (payload) => socket.onmessage({ data: JSON.stringify({ contextId: message.context_id, ...payload }) });
      if (message.flush) queueMicrotask(() => reply({ audio: Buffer.from("ab").toString("base64") }));
      if (message.close_context) queueMicrotask(() => queueMicrotask(() => reply({ isFinal: true })));
    }),
  });
  const connection = await tts.open({ voiceId: "voice-1" });
  const speech = connection.startUtterance({ onAudio: () => {} });
  speech.sendText("Hallo.");
  speech.end();
  const startedAt = Date.now();
  await speech.finished;
  assert.ok(Date.now() - startedAt < 500, "koniec bez czekania na ciszę");
  assert.deepEqual(sent, ["text", "text", "flush", "close"]);
  connection.close();
});

test("TTS zgłoszony przez dostawcę błąd kończy wypowiedź jako awarię tts", async () => {
  const tts = createElevenLabsTts({
    apiKey: "bad",
    WebSocketImpl: fakeSocketClass((socket, message) => {
      if (message.xi_api_key) queueMicrotask(() => socket.onmessage({ data: JSON.stringify({ type: "error", error: "invalid_api_key" }) }));
    }),
  });
  await assert.rejects(tts.synthesize("Hello.", { voiceId: "voice-1" }), (error) => error.service === "tts");
});

test("zegar odtwarzania awatara: dziura tylko wtedy, gdy kolejna porcja przychodzi po odtworzeniu poprzednich", () => {
  const { createPlaybackClock } = require("../src/adapters/avatar/liveavatar-lite");
  let time = 0;
  const clock = createPlaybackClock(() => time);
  // 250 ms chunks arriving faster than they play: the avatar always has audio.
  for (const at of [0, 100, 200, 300]) { time = at; clock.sent(250); }
  assert.deepEqual(clock.gaps(), []);
  // Played until 1000 ms; the next chunk at 1076 ms leaves 76 ms of silence; 10 ms is jitter, not a gap.
  time = 1076; clock.sent(250);
  time = 1336; clock.sent(250);
  assert.deepEqual(clock.gaps(), [76]);
});
