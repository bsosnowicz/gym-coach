// Leading the workout (src/coach/workout.js) on a fake clock: "gotowe" moves
// through warm-up, sets and rests, the rest is timed in code, a session break
// stops the rest timer, an announcement waits while someone is talking —
// and in a conversation "gotowe" never reaches the model.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createWorkoutRunner, advanceIntent } = require("../src/coach/workout");
const { createCoach } = require("../src/coach");
const { buildCatalog } = require("../src/coach/exercises");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const plan = {
  exercises: [
    { id: "Barbell_Squat", name: "przysiad ze sztangą", sets: 2, reps: 10, restS: 90 },
    { id: "Plank", name: "deska", sets: 1, seconds: 30, restS: 60 },
  ],
};

function setup({ busy = () => false } = {}) {
  let clock = 0;
  const timers = [];
  const said = [];
  const published = [];
  const runner = createWorkoutRunner(plan, {
    speak: (text) => said.push(text),
    publish: () => published.push(runner.snapshot()),
    canSpeakNow: () => !busy(),
    now: () => clock,
    setTimer: (fn, ms) => { const timer = { fn, at: clock + ms }; timers.push(timer); return timer; },
    clearTimer: (timer) => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
  });
  // Moves the clock on, firing due timers in order.
  const wait = (ms) => {
    const until = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > until) break;
      timers.shift();
      clock = next.at;
      next.fn();
    }
    clock = until;
  };
  return { runner, said, published, wait };
}

test("Intencja: krótkie „gotowe”, „dalej”, „zrobiłem 8” kończą krok; pytanie i „nie” idą do modelu", () => {
  assert.deepEqual(advanceIntent("Gotowe!"), { reps: null, kg: null });
  assert.deepEqual(advanceIntent("Dobra, zrobiłem 8."), { reps: 8, kg: null });
  assert.deepEqual(advanceIntent("zrobiłam dziesięć"), { reps: 10, kg: null });
  assert.deepEqual(advanceIntent("Lecimy dalej"), { reps: null, kg: null });
  assert.equal(advanceIntent("Nie jestem jeszcze gotowy"), null);
  assert.equal(advanceIntent("Jak mam ustawić kolana w przysiadzie, kiedy schodzę nisko?"), null);
  assert.equal(advanceIntent("Mam pytanie"), null);
});

test("Prowadzenie: rozgrzewka → seria → przerwa z odliczaniem → seria → następne ćwiczenie → koniec", () => {
  const { runner, said, wait } = setup();
  assert.equal(runner.snapshot().phase, "ready");

  runner.advance();
  assert.equal(runner.snapshot().phase, "warmup");
  assert.match(said.at(-1), /^Zaczynamy od rozgrzewki/);

  runner.advance();
  assert.deepEqual([runner.snapshot().phase, runner.snapshot().exerciseIndex, runner.snapshot().setIndex], ["set", 0, 0]);
  assert.equal(said.at(-1), "Ćwiczenie 1 z 2: przysiad ze sztangą. Seria pierwsza z 2, 10 powtórzeń. Powiedz „gotowe” po serii.");

  runner.advance({ reps: 8 });
  assert.equal(runner.snapshot().phase, "rest");
  assert.equal(runner.snapshot().restLeftMs, 90000);
  assert.equal(said.at(-1), "Seria zaliczona. Przerwa 90 sekund.");
  assert.equal(runner.progress.completed[0].reps, 8, "zapisuje, ile powiedział użytkownik");

  wait(89000);
  assert.equal(runner.snapshot().phase, "rest");
  assert.equal(runner.snapshot().restLeftMs, 1000);
  wait(1000);
  assert.deepEqual([runner.snapshot().phase, runner.snapshot().setIndex], ["set", 1]);
  assert.equal(said.at(-1), "Koniec przerwy. przysiad ze sztangą, seria druga z 2, 10 powtórzeń.");

  runner.advance();
  assert.equal(said.at(-1), "Seria zaliczona. Przerwa 90 sekund, potem deska.");
  runner.advance(); // ready before the timer: the rest is skipped
  assert.equal(said.at(-1), "Ćwiczenie 2 z 2: deska. Seria pierwsza z 1, 30 sekund. Powiedz „gotowe” po serii.");

  runner.advance();
  assert.equal(runner.snapshot().phase, "done");
  assert.equal(said.at(-1), "Trening zrobiony: 2 ćwiczenia, 3 serie, razem 18 powtórzeń. Świetna robota!");
  assert.equal(runner.snapshot().completed, 3);
  assert.equal(runner.advance(), false);
});

test("Prowadzenie: przerwa w sesji zatrzymuje odliczanie, powrót je wznawia", () => {
  const { runner, said, wait } = setup();
  runner.advance();
  runner.advance();
  runner.advance();
  wait(30000);
  runner.pause();
  assert.deepEqual([runner.snapshot().restLeftMs, runner.snapshot().restPaused], [60000, true]);

  wait(600000);
  assert.equal(runner.snapshot().phase, "rest", "w przerwie sesji przerwa między seriami stoi");

  runner.resume();
  wait(59000);
  assert.equal(runner.snapshot().phase, "rest");
  wait(1000);
  assert.equal(runner.snapshot().phase, "set");
  assert.match(said.at(-1), /^Koniec przerwy/);
});

test("Prowadzenie: zapowiedź po przerwie czeka, aż trener skończy odpowiadać (najwyżej 8 s)", () => {
  let busy = false;
  const { runner, said, wait } = setup({ busy: () => busy });
  runner.advance();
  runner.advance();
  runner.advance();
  wait(80000);
  busy = true;
  const before = said.length;
  wait(10000);
  assert.equal(said.length, before, "trener mówi — zapowiedź czeka");
  wait(2000);
  busy = false;
  wait(500);
  assert.match(said.at(-1), /^Koniec przerwy/);

  busy = true;
  runner.advance();
  runner.advance();
  const waiting = said.length;
  wait(8500);
  assert.equal(said.length, waiting + 1, "po 8 s mówi mimo wszystko");
});

test("Rozmowa: „gotowe” przesuwa trening bez modelu, a pytanie idzie do modelu z bieżącą serią w prompcie", async () => {
  const calls = [];
  const replies = ["Dobrze! [PLAN goal=muscle level=intermediate equipment=gym minutes=30]", "Kolana nad palcami stóp."];
  const llm = {
    streamChat(args) {
      calls.push(args.messages);
      return fakeLlm(replies.shift() || "OK.").streamChat(args);
    },
  };
  const coach = createCoach({ voiceId: "v", catalog: buildCatalog(), engine });
  const { session, events } = await liveSession({ llm, coach });
  const settle = async () => { for (let i = 0; i < 10; i += 1) await tick(); };

  await runTurn(session, "Pół godziny na siłowni, masa.");
  await settle();
  await runTurn(session, "Gotowe");
  await settle();
  await runTurn(session, "gotowe");
  await settle();

  assert.equal(calls.length, 1, "„gotowe” nie idzie do modelu");
  assert.equal(session.coachState.runner.snapshot().phase, "set");
  const last = events.filter((event) => event.stage === "workout").at(-1);
  assert.equal(last.workout.progress.phase, "set");
  assert.ok(events.some((event) => event.stage === "avatar_transcription" && event.text.startsWith("Ćwiczenie 1 z")));

  await runTurn(session, "Jak ustawić kolana?");
  await settle();
  assert.equal(calls.length, 2);
  assert.match(calls[1][1].content, /Teraz: trwa seria — .+, seria 1 z 3\./);
  session.coachState.runner.stop();
  await endSession(session);
});

test("Koniec serii: słowa przekręcone przez Whispera też działają, pytania nadal nie", () => {
  for (const text of ["Gotowo.", "Gotowa.", "Dobra zrubiona pierwsza serja.", "Dobrze, zrobiłem.", "skończone"]) {
    assert.ok(advanceIntent(text), text);
  }
  for (const text of ["Zrobimy to razem?", "Co teraz robimy?", "Nie jestem gotowy."]) {
    assert.equal(advanceIntent(text), null, text);
  }
});

test("Wynik serii: powtórzenia i ciężar z „zrobiłem 8 na 60 kilo”, także przez [NEXT reps=… kg=…]", async () => {
  assert.deepEqual(advanceIntent("zrobiłem 8 na 60 kilo"), { reps: 8, kg: 60 });
  assert.deepEqual(advanceIntent("Zrobiłem osiem, 62,5 kg"), { reps: 8, kg: 62.5 });
  assert.deepEqual(advanceIntent("gotowe"), { reps: null, kg: null });

  const replies = ["Dobrze! [PLAN goal=strength level=intermediate equipment=gym minutes=30]", "Świetna seria! [NEXT reps=6 kg=80]"];
  const llm = { streamChat: (args) => fakeLlm(replies.shift() || "OK.").streamChat(args) };
  const coach = createCoach({ voiceId: "v", catalog: buildCatalog(), engine });
  const { session, events } = await liveSession({ llm, coach });
  const say = async (text) => { await runTurn(session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  await say("Pół godziny, siła.");
  await say("gotowe");
  await say("gotowe");
  await say("Zrobiłem 5 na 100 kilo");
  await say("gotowe");
  await say("No to była ciężka, sześć razy osiemdziesiąt, ledwo co.");
  const sets = session.coachState.runner.progress.completed;
  assert.deepEqual(sets.map(({ reps, kg }) => ({ reps, kg })), [{ reps: 5, kg: 100 }, { reps: 6, kg: 80 }]);
  assert.deepEqual(events.filter((event) => event.stage === "workout").at(-1).workout.progress.lastSet.kg, 80);
  session.coachState.runner.stop();
  await endSession(session);
});
