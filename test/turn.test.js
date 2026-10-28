const test = require("node:test");
const assert = require("node:assert/strict");

const { runTurn, interruptTurn, resumeTurn } = require("../src/engine/turn");
const { resumeOffset } = require("../src/engine/resume-point");
const { isLoneCourtesy } = require("../src/engine/words");
const { endSession } = require("../src/engine/session");
const { providerFailure, PROVIDER_MESSAGES } = require("../src/engine/provider-failure");
const { createLlm } = require("../src/adapters/llm/chat-completions");
const { fakeLlm, fakeTts, fakeCoach, liveSession, tick } = require("./helpers");

test("udana tura: zdania idą do TTS, znaczniki są wycinane, historia i blokada są spójne", async () => {
  const seen = [];
  const coach = fakeCoach({
    markers: [{ pattern: /\[SWITCH\]/g, handle: () => seen.push("switch") }],
    afterTurn: (_session, turn) => { seen.push(turn); },
  });
  const { session, events, tts, avatar } = await liveSession({
    llm: fakeLlm("Dobrze. ", "Teraz zmiana [SWI", "TCH] kierunku."),
    coach,
  });

  await runTurn(session, "Zamieńmy kierunek.");
  await tick();

  assert.deepEqual(tts.sent, ["Dobrze. ", "Teraz zmiana  kierunku."]);
  assert.deepEqual(session.history, [
    { role: "user", content: "Zamieńmy kierunek." },
    { role: "assistant", content: "Dobrze. Teraz zmiana kierunku." },
  ]);
  assert.equal(session.turnInFlight, false);
  assert.deepEqual(seen, ["switch", { userText: "Zamieńmy kierunek.", reply: "Dobrze. Teraz zmiana kierunku." }]);
  assert.ok(events.some((event) => event.stage === "avatar_transcription"));
  assert.equal(avatar.commands.at(-1), "start_listening");
  await endSession(session);
});

test("odrzucenie klucza LLM zwalnia turę, zachowuje transkrypt i nie ujawnia szczegółów dostawcy", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => new Response('{"error":"invalid_api_key: invalid-secret-key"}', { status: 401 });
  try {
    const llm = createLlm({
      primary: { name: "primary", url: "https://primary.invalid/chat", apiKey: "invalid-secret-key", model: "m", extraBody: {} },
    });
    const { session, events } = await liveSession({ llm });

    await runTurn(session, "Dzień dobry.");

    assert.equal(session.turnInFlight, false);
    assert.equal(session.providerFailurePayload?.service, "llm");
    assert.deepEqual(session.history, [{ role: "user", content: "Dzień dobry." }]);
    const failure = events.find((event) => event.stage === "provider_error");
    assert.equal(failure.message, PROVIDER_MESSAGES.llm);
    assert.doesNotMatch(JSON.stringify(events), /invalid-secret-key|invalid_api_key/i);
    assert.ok(session.recorder.events(session.id).some((event) => event.type === "user.transcription"));
    await endSession(session);
  } finally {
    global.fetch = previousFetch;
  }
});

test("odpowiedź z samych znaczników kończy turę po cichu, a nie jako awaria TTS", async () => {
  // Like ElevenLabs: a reply closed without any text gets no audio, which the adapter reports as a failure.
  const tts = fakeTts();
  const open = tts.open.bind(tts);
  tts.open = async (speech) => {
    const connection = await open(speech);
    return {
      ...connection,
      startUtterance(options) {
        const utterance = connection.startUtterance(options);
        let textSent = false;
        return {
          ...utterance,
          sendText: (text) => { textSent = true; utterance.sendText(text); },
          // Closed without text: no audio ever comes, so `finished` never settles.
          end: () => { if (textSent) utterance.end(); },
        };
      },
    };
  };
  const seen = [];
  const coach = fakeCoach({ markers: [{ pattern: /\[RESULT:\w+\]/g, handle: () => seen.push("result") }], afterTurn: (_session, turn) => { seen.push(turn); } });
  const { session, events, avatar } = await liveSession({ llm: fakeLlm("[RESULT:correct]"), coach, tts });

  await runTurn(session, "ticket");
  await tick();

  assert.deepEqual(events.filter((event) => event.stage === "provider_error"), []);
  assert.deepEqual(seen, ["result", { userText: "ticket", reply: "" }]);
  assert.deepEqual(session.history, [{ role: "user", content: "ticket" }]);
  assert.equal(avatar.commands.includes("speak_end"), false);
  assert.equal(session.turnInFlight, false);
  await endSession(session);
});

test("awaria TTS kończy turę od razu jako błąd dostawcy tts", async () => {
  const { session, events } = await liveSession({
    llm: fakeLlm("Cześć."),
    tts: fakeTts({ fail: providerFailure("tts", new Error("invalid_api_key")) }),
  });

  const startedAt = performance.now();
  await runTurn(session, "Hej.");

  assert.ok(performance.now() - startedAt < 1000);
  assert.equal(events.find((event) => event.stage === "provider_error")?.service, "tts");
  assert.equal(session.turnInFlight, false);
  await endSession(session);
});

test("LLM, który milczy, dostaje jedno ponowienie tury, a potem błąd timeoutu", async () => {
  let calls = 0;
  const hangingLlm = {
    streamChat({ signal, onAttemptStarted }) {
      calls += 1;
      onAttemptStarted(1);
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      });
    },
  };
  const { session, events } = await liveSession({ llm: hangingLlm, options: { firstTokenTimeoutMs: 20 } });

  await runTurn(session, "Halo?");
  while (session.turnInFlight || session.activeTurn) await tick();

  assert.equal(calls, 2);
  const failure = events.find((event) => event.stage === "provider_error");
  assert.deepEqual([failure.service, failure.code], ["llm", "provider_timeout"]);
  await endSession(session);
});

test("barge-in przerywa turę i zostawia w historii to, co coach zdążył powiedzieć", async () => {
  let release;
  const slowLlm = {
    async streamChat({ signal }) {
      return {
        deltas: (async function* generate() {
          yield "Pierwsze zdanie. ";
          await new Promise((resolve, reject) => {
            release = resolve;
            signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
          });
        })(),
        attempt: 1,
        startedAt: performance.now(),
        model: "m",
        provider: "fake",
      };
    },
  };
  let interruptions = 0;
  const { session, events, avatar } = await liveSession({ llm: slowLlm, coach: fakeCoach({ onInterrupted: () => { interruptions += 1; } }) });

  const turn = runTurn(session, "Opowiedz coś.");
  while (!release) await tick();
  interruptTurn(session);
  await turn;

  assert.ok(events.some((event) => event.stage === "interrupted"));
  assert.equal(interruptions, 1);
  assert.ok(avatar.commands.includes("interrupt"));
  assert.equal(session.history.at(-1).content, "Pierwsze zdanie.");
  assert.equal(session.turnInFlight, false);
  await endSession(session);
});

test("tura użytkownika przed końcem powitania jest odrzucana", async () => {
  const { session, tts } = await liveSession({ llm: fakeLlm("Cześć.") });
  session.greetingDone = false;

  await runTurn(session, "Przerywam.");

  assert.deepEqual(tts.sent, []);
  assert.deepEqual(session.history, []);
  await endSession(session);
});

test("zamknięcie sesji powiadamia coacha, a jego błąd nie psuje zamknięcia", async () => {
  let ended = 0;
  const { session, avatar } = await liveSession({ llm: fakeLlm("Cześć."), coach: fakeCoach({ onSessionEnd: () => { ended += 1; throw new Error("boom"); } }) });
  await endSession(session);
  await tick();
  assert.equal(ended, 1);
  assert.ok(avatar.commands.includes("stop"));
});

// TTS and avatar driven by hand, to stop a reply in the middle of its audio.
function manualRig() {
  const rig = { speeches: [], commands: [], utterances: 0, ttsEnded: false, callbacks: null, onAudio: null, finishTts: null };
  rig.tts = {
    keyFor: () => "voice|",
    async open() {
      return {
        key: "voice|",
        isOpen: () => true,
        close() {},
        startUtterance({ onAudio }) {
          rig.utterances += 1;
          rig.ttsEnded = false;
          rig.onAudio = onAudio;
          const finished = new Promise((resolve) => { rig.finishTts = resolve; });
          return { finished, sendText() {}, end() { rig.ttsEnded = true; }, cancel() {} };
        },
      };
    },
  };
  rig.avatar = {
    async start(callbacks) {
      rig.callbacks = callbacks;
      return {
        sessionId: `rig-${Math.random()}`,
        client: {},
        beginSpeech() {
          const speech = { bytes: 0, ended: false };
          rig.speeches.push(speech);
          return { push(pcm) { speech.bytes += pcm.length; }, end() { speech.ended = true; } };
        },
        interrupt() { rig.commands.push("interrupt"); },
        async settleAfterInterrupt() {},
        async whenInterruptSettled() {},
        startListening() { rig.commands.push("start_listening"); },
        stopListening() { rig.commands.push("stop_listening"); },
        async stop() {},
      };
    },
  };
  rig.untilTtsEnded = async (count) => { while (rig.utterances < count || !rig.ttsEnded) await tick(); };
  return rig;
}

const loudPcm = (ms) => Buffer.alloc(ms * 48, 0x40);

test("pauza i wznowienie: fałszywy alarm nie kończy tury, a awatar dostaje resztę wypowiedzi", async () => {
  const rig = manualRig();
  const { session, events } = await liveSession({ llm: fakeLlm("Jedno zdanie."), tts: rig.tts, avatar: rig.avatar });
  const turn = runTurn(session, "Opowiedz coś.");
  await rig.untilTtsEnded(1);
  rig.onAudio(loudPcm(2000));
  rig.callbacks.onSpeakStarted();

  assert.deepEqual(interruptTurn(session), { ok: true, held: true });
  assert.ok(events.some((event) => event.stage === "paused"));
  rig.onAudio(loudPcm(1000));
  assert.equal(rig.speeches[0].bytes, loudPcm(2000).length);
  rig.callbacks.onSpeakEnded();
  rig.finishTts();
  await tick();
  assert.equal(session.turnInFlight, true);

  assert.deepEqual(resumeTurn(session), { ok: true, resumed: true });
  while (rig.speeches.length < 2) await tick();
  assert.equal(rig.speeches[1].bytes, loudPcm(3000).length);
  assert.equal(rig.speeches[1].ended, true);
  rig.callbacks.onSpeakStarted();
  rig.callbacks.onSpeakEnded();
  await turn;

  assert.ok(events.some((event) => event.stage === "resumed"));
  assert.ok(!events.some((event) => event.stage === "interrupted"));
  assert.equal(session.history.at(-1).content, "Jedno zdanie.");
  assert.equal(session.turnInFlight, false);
  assert.deepEqual(resumeTurn(session), { ok: true, resumed: false });
  await endSession(session);
});

test("pauza i prawdziwa wypowiedź: wstrzymana odpowiedź przepada, a nowa tura rusza po niej", async () => {
  const rig = manualRig();
  let interruptions = 0;
  const { session, events } = await liveSession({
    llm: fakeLlm("Jedno zdanie."), tts: rig.tts, avatar: rig.avatar,
    coach: fakeCoach({ onInterrupted: () => { interruptions += 1; } }),
  });
  runTurn(session, "Opowiedz coś.");
  await rig.untilTtsEnded(1);
  rig.onAudio(loudPcm(2000));
  rig.callbacks.onSpeakStarted();
  interruptTurn(session);

  const next = runTurn(session, "Mam pytanie.");
  await rig.untilTtsEnded(2);
  assert.equal(interruptions, 1);
  rig.onAudio(loudPcm(500));
  rig.finishTts();
  await tick();
  rig.callbacks.onSpeakStarted();
  rig.callbacks.onSpeakEnded();
  await next;

  assert.ok(events.some((event) => event.stage === "interrupted"));
  assert.deepEqual(session.history.map((message) => message.content), ["Opowiedz coś.", "Jedno zdanie.", "Mam pytanie.", "Jedno zdanie."]);
  await endSession(session);
});

function countingLlm(...deltas) {
  const llm = fakeLlm(...deltas);
  const streamChat = llm.streamChat;
  llm.calls = 0;
  llm.streamChat = (...args) => { llm.calls += 1; return streamChat(...args); };
  return llm;
}

const courtesyCoach = () => fakeCoach({
  speech: () => ({ voiceId: "voice", languageCode: null, sttLanguage: null, sttHallucinations: [], courtesyWords: ["dziękuję", "mhm"] }),
});

test("pauza i samo „Dziękuję”: awatar mówi dalej, a model nie dostaje nowej tury", async () => {
  const rig = manualRig();
  const llm = countingLlm("Jedno zdanie.");
  const { session, events } = await liveSession({ llm, tts: rig.tts, avatar: rig.avatar, coach: courtesyCoach() });
  const turn = runTurn(session, "Opowiedz coś.");
  await rig.untilTtsEnded(1);
  rig.onAudio(loudPcm(2000));
  rig.callbacks.onSpeakStarted();
  interruptTurn(session);
  rig.onAudio(loudPcm(1000));
  rig.callbacks.onSpeakEnded();
  rig.finishTts();
  await tick();

  await runTurn(session, "Dziękuję.");
  while (rig.speeches.length < 2) await tick();
  assert.equal(rig.speeches[1].bytes, loudPcm(3000).length);
  rig.callbacks.onSpeakStarted();
  rig.callbacks.onSpeakEnded();
  await turn;

  assert.equal(llm.calls, 1);
  assert.ok(events.some((event) => event.stage === "resumed"));
  assert.ok(!events.some((event) => event.stage === "interrupted"));
  assert.deepEqual(session.history.map((message) => message.content), ["Opowiedz coś.", "Jedno zdanie."]);
  const types = session.recorder.events(session.id).map((event) => event.type);
  assert.ok(types.includes("user.turn_dropped"));
  await endSession(session);
});

test("pauza i „Dziękuję, a co dalej?”: to już pytanie, więc wstrzymana odpowiedź przepada", async () => {
  const rig = manualRig();
  const { session, events } = await liveSession({ llm: fakeLlm("Jedno zdanie."), tts: rig.tts, avatar: rig.avatar, coach: courtesyCoach() });
  runTurn(session, "Opowiedz coś.");
  await rig.untilTtsEnded(1);
  rig.onAudio(loudPcm(2000));
  rig.callbacks.onSpeakStarted();
  interruptTurn(session);

  const next = runTurn(session, "Dziękuję, a co dalej?");
  await rig.untilTtsEnded(2);
  rig.onAudio(loudPcm(500));
  rig.finishTts();
  await tick();
  rig.callbacks.onSpeakStarted();
  rig.callbacks.onSpeakEnded();
  await next;

  assert.ok(events.some((event) => event.stage === "interrupted"));
  assert.equal(session.history.at(-2).content, "Dziękuję, a co dalej?");
  await endSession(session);
});

test("samo „Dziękuję”, gdy awatar milczy, idzie do modelu jak każda wypowiedź", async () => {
  const llm = countingLlm("Proszę bardzo.");
  const { session } = await liveSession({ llm, coach: courtesyCoach() });
  await runTurn(session, "Dziękuję.");
  await tick();
  assert.equal(llm.calls, 1);
  assert.deepEqual(session.history.map((message) => message.content), ["Dziękuję.", "Proszę bardzo."]);
  await endSession(session);
});

test("isLoneCourtesy: do trzech słów, wszystkie z listy domeny", () => {
  const words = ["dziękuję", "dzięki", "bardzo", "mhm"];
  assert.equal(isLoneCourtesy("Mhm.", words), true);
  assert.equal(isLoneCourtesy("Dzięki bardzo!", words), true);
  assert.equal(isLoneCourtesy("DZIEKUJE", words), true);
  assert.equal(isLoneCourtesy("Dziękuję, a co dalej?", words), false);
  assert.equal(isLoneCourtesy("mhm mhm dzięki bardzo", words), false);
  assert.equal(isLoneCourtesy("...", words), false);
  assert.equal(isLoneCourtesy("Dziękuję.", undefined), false);
});

test("pauza bez rozstrzygnięcia kończy się jak zwykłe przerwanie", async () => {
  const rig = manualRig();
  const { session, events } = await liveSession({ llm: fakeLlm("Jedno zdanie."), tts: rig.tts, avatar: rig.avatar, options: { holdTimeoutMs: 20 } });
  const turn = runTurn(session, "Opowiedz coś.");
  await rig.untilTtsEnded(1);
  rig.onAudio(loudPcm(2000));
  interruptTurn(session);
  await turn;
  assert.ok(events.some((event) => event.stage === "interrupted"));
  assert.equal(session.turnInFlight, false);
  await endSession(session);
});

test("punkt wznowienia cofa się do ostatniej pauzy w mowie", () => {
  const ms = (value) => value * 48;
  const speechThenPause = Buffer.concat([loudPcm(1000), Buffer.alloc(ms(200)), loudPcm(1000)]);
  const point = resumeOffset(speechThenPause, ms(1900));
  assert.ok(point >= ms(1000) && point <= ms(1200), `punkt ${point / 48} ms`);
  assert.equal(resumeOffset(loudPcm(5000), ms(4000)), ms(3700));
  assert.equal(resumeOffset(loudPcm(1000), ms(500)), 0);
  assert.equal(resumeOffset(Buffer.alloc(0), 0), 0);
});
