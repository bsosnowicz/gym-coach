const test = require("node:test");
const assert = require("node:assert/strict");

const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const { withSessionControl, resumeIntent, endDialogAnswer, breakEndIntent, DEFAULT_TEXTS } = require("../src/engine/session-control");
const { createCoach, SYSTEM_PROMPT } = require("../src/coach");
const { fakeLlm, liveSession, tick } = require("./helpers");

function countingLlm(...deltas) {
  const llm = fakeLlm(...deltas);
  return { calls: 0, messages: null, streamChat(args) { this.calls += 1; this.messages = args.messages; return llm.streamChat(args); } };
}
const settle = async () => { for (let i = 0; i < 6; i += 1) await tick(); };

async function controlledSession(llm, hooks = {}) {
  const coach = withSessionControl({ ...createCoach({ voiceId: "v" }), ...hooks });
  const live = await liveSession({ llm, coach });
  live.session.history.push({ role: "assistant", content: "Opowiedz mi o swoim dniu." });
  return { ...live, coach };
}

test("przerwa głosem: stałe potwierdzenie, w przerwie model milczy, powrót powtarza ostatnią kwestię", async () => {
  const llm = countingLlm("[PAUSE]");
  const { session, events } = await controlledSession(llm);

  await runTurn(session, "Zróbmy przerwę.");
  await settle();
  assert.ok(events.some((event) => event.stage === "break_started"));
  assert.equal(session.history.at(-1).content, DEFAULT_TEXTS.pause);

  await runTurn(session, "jestem w kuchni");
  await runTurn(session, "no dobra");
  await settle();
  assert.equal(llm.calls, 1);
  assert.ok(!events.some((event) => event.stage === "break_ended"));

  await runTurn(session, "No dobra, kontynuujmy.");
  await settle();
  assert.ok(events.some((event) => event.stage === "break_ended"));
  assert.equal(session.history.at(-1).content, "Dobrze, wracamy. Opowiedz mi o swoim dniu.");
  assert.equal(llm.calls, 1);
  await endSession(session);
});

test("rozmowa z kimś obok: przerwa z osobnym potwierdzeniem", async () => {
  const llm = countingLlm("[OTHER_CONVERSATION]");
  const { session, events } = await controlledSession(llm);

  await runTurn(session, "Halo? Tak, mogę rozmawiać.");
  await settle();
  assert.ok(events.some((event) => event.stage === "break_started" && event.reason === "conversation"));
  assert.equal(session.history.at(-1).content, DEFAULT_TEXTS.conversationPause);
  await endSession(session);
});

test("przycisk Przerwa: potwierdzenie od razu, druga prośba nic nie zmienia", async () => {
  const { session, coach } = await controlledSession(countingLlm("Nic."));

  assert.equal(coach.requestPause(session, { source: "button", confirmNow: true }), true);
  await settle();
  assert.equal(session.history.at(-1).content, DEFAULT_TEXTS.pause);
  assert.equal(coach.requestPause(session, { source: "button", confirmNow: true }), false);
  assert.equal(coach.continueSession(session, { source: "button" }), true);
  assert.equal(coach.continueSession(session, { source: "button" }), false);
  await endSession(session);
});

test("koniec głosem: okno zakończenia, „nie kończymy” wraca, a pytanie zwrotne niczego nie rozstrzyga", async () => {
  const llm = countingLlm("[END]");
  const { session, events } = await controlledSession(llm);

  await runTurn(session, "Muszę już iść.");
  await settle();
  assert.ok(events.some((event) => event.stage === "end_requested"));

  await runTurn(session, "Czy już koniec? Pogubiłam się.");
  await settle();
  assert.ok(!events.some((event) => event.stage === "break_ended" || event.stage === "session_finished"));

  await runTurn(session, "Nie, nie kończymy.");
  await settle();
  assert.ok(events.some((event) => event.stage === "break_ended"));
  assert.equal(session.history.at(-1).content, "Dobrze, wracamy. Opowiedz mi o swoim dniu.");
  assert.equal(llm.calls, 1);
  await endSession(session);
});

test("koniec potwierdzony głosem: pożegnanie do końca, potem nic nie trafia do modelu", async () => {
  const llm = countingLlm("[END]");
  const { session, events } = await controlledSession(llm);

  await runTurn(session, "Na dziś wystarczy.");
  await settle();
  await runTurn(session, "Tak, kończymy.");
  await settle();
  assert.ok(events.some((event) => event.stage === "session_finished"));
  assert.equal(session.history.at(-1).content, DEFAULT_TEXTS.farewell);

  await runTurn(session, "A jeszcze jedno.");
  assert.equal(llm.calls, 1);
  await endSession(session);
});

test("„kończymy” w przerwie otwiera okno zakończenia, „nie kończmy” nie", async () => {
  const llm = countingLlm("[PAUSE]");
  const { session, events } = await controlledSession(llm);

  await runTurn(session, "Daj mi chwilę.");
  await settle();
  await runTurn(session, "Nie kończmy jeszcze.");
  assert.ok(!events.some((event) => event.stage === "end_requested"));
  await runTurn(session, "Dobra, kończymy.");
  assert.ok(events.some((event) => event.stage === "end_requested"));
  assert.equal(llm.calls, 1);
  await endSession(session);
});

test("instrukcja znaczników idzie zaraz po prompcie aplikacji", async () => {
  const llm = countingLlm("Hej!");
  const { session } = await controlledSession(llm);
  await runTurn(session, "Cześć.");
  assert.deepEqual(llm.messages.slice(0, 2), [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: DEFAULT_TEXTS.prompt },
  ]);
  await endSession(session);
});

test("aplikacja może podmienić teksty, np. na trening", async () => {
  const coach = withSessionControl(createCoach({ voiceId: "v" }), { texts: { farewell: "Dobry trening!" } });
  const { session, events } = await liveSession({ llm: countingLlm("Nic."), coach });
  coach.requestEnd(session, { source: "button" });
  await coach.farewell(session);
  assert.equal(session.history.at(-1).content, "Dobry trening!");
  assert.ok(events.some((event) => event.stage === "session_finished"));
  await endSession(session);
});

test("słownik powrotu: znane słowa, przekręcone „kontynuuj”, nie rozmowa z pokoju", () => {
  for (const text of ["Kontynuujmy.", "No dobra, wracamy", "Kante noj", "Kontinu umi", "continue"]) {
    assert.equal(resumeIntent(text), true, text);
  }
  for (const text of ["jestem w kuchni", "dalej nie wiem", "konto walutowe", "no dobra", "a potem wracamy do domu i jemy obiad"]) {
    assert.equal(resumeIntent(text), false, text);
  }
});

test("okno zakończenia głosem: przeczenie odwraca znaczenie, samo tak/nie odpowiada na pytanie", () => {
  const cases = {
    "Tak.": "finish",
    "Na pewno.": "finish",
    "Kończymy.": "finish",
    "Nie wracam, kończymy.": "finish",
    "Nie.": "resume",
    "Nie kończymy.": "resume",
    "Wracamy.": "resume",
    "Nie, kończymy.": "finish",
    "Czy już koniec? O, pogubiłam się.": null,
    "Kończymy i wracamy.": null,
    "Hmm, nie wiem.": null,
  };
  for (const [text, expected] of Object.entries(cases)) assert.equal(endDialogAnswer(text), expected, text);
});

test("koniec z przerwy tylko słowem skierowanym do sesji", () => {
  assert.equal(breakEndIntent("Dobra, kończymy."), true);
  assert.equal(breakEndIntent("Nie kończmy."), false);
  assert.equal(breakEndIntent("Wystarczy mi przerwy."), false);
  assert.equal(breakEndIntent("Czy już koniec?"), false);
});

for (const source of ["button", "voice"]) {
  for (const marker of ["[PAUSE]", "[OTHER_CONVERSATION]", "[END]"]) {
    test(`domain hooks run once for ${marker} and resume (${source})`, async () => {
      const calls = [];
      const { session, coach } = await controlledSession(countingLlm(marker), {
        onPause: (current) => calls.push({ hook: "pause", session: current, held: current.control.paused || current.control.endPending }),
        onResume: (current) => calls.push({ hook: "resume", session: current, held: current.control.paused || current.control.endPending }),
      });
      try {
        if (source === "voice") {
          await runTurn(session, "Prośba użytkownika.");
          await settle();
        } else if (marker === "[END]") coach.requestEnd(session, { source });
        else coach.requestPause(session, { source, reason: marker === "[OTHER_CONVERSATION]" ? "conversation" : "request", confirmNow: true });

        assert.equal(coach.requestPause(session), false);
        if (marker === "[END]") assert.equal(coach.requestEnd(session), false);
        if (source === "voice") await runTurn(session, marker === "[END]" ? "Nie kończymy." : "Wracam.");
        else assert.equal(coach.continueSession(session, { source }), true);
        await settle();
        assert.equal(coach.continueSession(session), false);
        assert.deepEqual(calls.map(({ hook, held }) => ({ hook, held })), [
          { hook: "pause", held: true }, { hook: "resume", held: false },
        ]);
        assert.ok(calls.every((call) => call.session === session));
      } finally { await endSession(session); }
    });
  }
}

test("moving from a break to end confirmation keeps domain activity suspended", async () => {
  const calls = [];
  const { session, coach } = await controlledSession(countingLlm("[PAUSE]"), {
    onPause: () => calls.push("pause"), onResume: () => calls.push("resume"),
  });
  try {
    await runTurn(session, "Przerwa.");
    await settle();
    await runTurn(session, "Kończymy.");
    assert.equal(session.control.endPending, true);
    assert.deepEqual(calls, ["pause"]);
    await coach.farewell(session);
    assert.deepEqual(calls, ["pause"]);
    assert.equal(coach.continueSession(session), false);
  } finally { await endSession(session); }
});

test("domain clock excludes the break and time spent deciding whether to end", async () => {
  let now = 0;
  const { session, coach } = await controlledSession(countingLlm("Nic."), {
    createState: () => ({ elapsed: 0, runningSince: now }),
    onPause: ({ coachState }) => { coachState.elapsed += now - coachState.runningSince; },
    onResume: ({ coachState }) => { coachState.runningSince = now; },
  });
  try {
    now = 1000;
    coach.requestPause(session);
    now = 5000;
    coach.requestEnd(session);
    now = 9000;
    coach.continueSession(session);
    now = 11000;
    coach.requestEnd(session);
    assert.equal(session.coachState.elapsed, 3000);
  } finally { await endSession(session); }
});

test("domain hook failure is recorded and does not block session controls", async () => {
  const fail = () => { throw new Error("domain failure"); };
  const { session, coach, events } = await controlledSession(countingLlm("Nic."), { onPause: fail, onResume: fail });
  try {
    assert.equal(coach.requestPause(session), true);
    assert.equal(coach.continueSession(session), true);
    assert.equal(events.filter((event) => event.stage === "break_started").length, 1);
    assert.equal(events.filter((event) => event.stage === "break_ended").length, 1);
    const failures = session.recorder.events(session.id).filter((event) => event.type === "control.hook_failed");
    assert.deepEqual(failures.map((event) => event.payload.hook), ["onPause", "onResume"]);
  } finally { await endSession(session); }
});

test("closed sessions and blocked controls do not call domain hooks", async () => {
  const calls = [];
  const { session, coach } = await controlledSession(countingLlm("Nic."), {
    onPause: () => calls.push("pause"), onResume: () => calls.push("resume"),
  });
  const work = session.handover.begin();
  assert.equal(coach.requestPause(session), false);
  assert.equal(coach.continueSession(session), false);
  await endSession(session);
  await work;
  assert.equal(coach.requestEnd(session), false);
  assert.equal(coach.requestPause(session), false);
  assert.equal(coach.continueSession(session), false);
  assert.deepEqual(calls, []);
});
