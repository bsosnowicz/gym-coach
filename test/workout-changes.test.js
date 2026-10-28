// Changes during the workout: "za ciężko" ([SWAP]), "nie mam ławki"
// ([NO_GEAR gear=bench]), "pomińmy to" ([SKIP]), "mniej serii" ([FEWER_SETS]).
// The model only marks the request; the runner (src/coach/workout.js) and the
// catalogue decide what changes, and the coach says it with fixed text.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createWorkoutRunner } = require("../src/coach/workout");
const { createCoach } = require("../src/coach");
const { buildCatalog } = require("../src/coach/exercises");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const catalog = buildCatalog();

function runner(exercises) {
  const said = [];
  const timers = [];
  const plan = { exercises: exercises.map((item) => ({ ...item })) };
  const run = createWorkoutRunner(plan, {
    speak: (text) => said.push(text),
    publish: () => {},
    now: () => 0,
    setTimer: (fn) => { const timer = { fn }; timers.push(timer); return timer; },
    clearTimer: (timer) => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
  });
  return { run, said, plan, timers };
}

const squat = { id: "Barbell_Squat", name: "przysiad ze sztangą", sets: 3, reps: 10, restS: 90 };
const bench = { id: "Dumbbell_Bench_Press", name: "wyciskanie hantli na ławce płaskiej", sets: 3, reps: 10, restS: 90 };
const goblet = { id: "Goblet_Squat", name: "przysiad goblet", sets: 3, reps: 10, restS: 90 };

test("Zmiany: wymiana w trakcie serii — nowe ćwiczenie, ta sama seria", () => {
  const { run, said, plan } = runner([squat, bench]);
  run.advance();
  run.advance();
  run.advance();
  run.advance(); // rest after set 1 → set 2 (skip the rest)
  run.replace(0, goblet);
  assert.equal(plan.exercises[0].id, "Goblet_Squat");
  assert.equal(said.at(-1), "Zmieniamy: zamiast przysiad ze sztangą robimy przysiad goblet, 10 powtórzeń. Seria druga z 3. Powiedz „gotowe” po serii.");
  assert.equal(run.snapshot().setIndex, 1);
});

test("Zmiany: pominięcie w serii przechodzi do następnego ćwiczenia; ostatnie kończy trening", () => {
  const { run, said } = runner([squat, bench]);
  run.advance();
  run.advance();
  run.skip();
  assert.deepEqual([run.snapshot().phase, run.snapshot().exerciseIndex, run.snapshot().setIndex], ["set", 1, 0]);
  assert.match(said.at(-1), /^Dobrze, pomijamy: przysiad ze sztangą\. Ćwiczenie 2 z 2: wyciskanie hantli/);
  run.skip();
  assert.equal(run.snapshot().phase, "done");
  assert.match(said.at(-1), /To był ostatni punkt, trening zrobiony\./);
  assert.equal(run.skip(), false);
});

test("Zmiany: mniej serii — w przerwie po ostatniej potrzebnej serii przechodzi dalej", () => {
  const { run, said, plan, timers } = runner([{ ...squat, sets: 2 }, bench]);
  run.advance();
  run.advance();
  assert.equal(run.fewerSets(), true);
  assert.equal(plan.exercises[0].sets, 1);
  assert.equal(said.at(-1), "Dobrze, przysiad ze sztangą: zostaje 1 seria.");
  assert.equal(run.fewerSets(), false, "nie mniej niż jedna seria");

  const { run: second, said: secondSaid, timers: secondTimers } = runner([squat, bench]);
  second.advance();
  second.advance();
  second.advance();
  second.advance();
  second.advance(); // two of three sets done, resting before the third
  assert.equal(second.snapshot().phase, "rest");
  second.fewerSets();
  assert.deepEqual([second.snapshot().phase, second.snapshot().exerciseIndex], ["set", 1]);
  assert.match(secondSaid.at(-1), /^Dobrze, kończymy: przysiad ze sztangą\. Ćwiczenie 2 z 2/);
  assert.equal(secondTimers.length, 0, "odliczanie przerwy nie wisi");
  assert.equal(timers.length, 0);
});

async function workoutSession(replies) {
  const llm = { streamChat: (args) => fakeLlm(replies.shift() || "OK.").streamChat(args) };
  const coach = createCoach({ voiceId: "v", catalog, engine });
  const { session, events } = await liveSession({ llm, coach });
  const say = async (text) => { await runTurn(session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const spoken = () => events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  return { session, say, spoken };
}

test("Rozmowa: „za ciężko” → [SWAP] → łatwiejszy zamiennik tego samego wzorca, ogłoszony po odpowiedzi modelu", async () => {
  const { session, say, spoken } = await workoutSession([
    "Dobrze! [PLAN goal=muscle level=intermediate equipment=gym minutes=45]",
    "Jasne, zmieniamy. [SWAP]",
  ]);
  await say("45 minut, siłownia, masa.");
  await say("gotowe");
  await say("gotowe");
  const before = session.coachState.plan.exercises[0];
  await say("To jest dla mnie za ciężkie, nie dam rady z tym ciężarem.");
  const after = session.coachState.plan.exercises[0];
  assert.notEqual(after.id, before.id);
  assert.equal(after.pattern, before.pattern);
  const lines = spoken();
  assert.equal(lines.at(-2), "Jasne, zmieniamy.");
  assert.match(lines.at(-1), new RegExp(`^Zmieniamy: zamiast ${before.name} robimy ${after.name}`));
  session.coachState.runner.stop();
  await endSession(session);
});

test("Rozmowa: „nie mam ławki” przed startem — wszystkie ćwiczenia z ławką wymienione, kolejne zamienniki też bez ławki", async () => {
  const { session, say, spoken } = await workoutSession([
    "Dobrze! [PLAN goal=muscle level=intermediate equipment=gym minutes=60]",
    "Rozumiem. [NO_GEAR gear=bench]",
  ]);
  await say("Godzina na siłowni.");
  const needsBench = (plan) => plan.exercises.filter((item) => catalog.get(item.id).needs.includes("bench"));
  assert.ok(needsBench(session.coachState.plan).length > 0, "plan z siłowni ma coś na ławce");
  await say("Nie mam tu ławki.");
  assert.deepEqual(needsBench(session.coachState.plan), []);
  assert.deepEqual(session.coachState.missing, ["bench"]);
  assert.equal(spoken().at(-1), "Zmieniłem plan pod Twój sprzęt, nowe ćwiczenia widzisz na ekranie.");
  session.coachState.runner.stop();
  await endSession(session);
});

test("Rozmowa: nieznany sprzęt w znaczniku niczego nie zmienia", async () => {
  const { session, say } = await workoutSession([
    "Dobrze! [PLAN goal=muscle level=intermediate equipment=gym minutes=30]",
    "Ok. [NO_GEAR gear=sofa]",
  ]);
  await say("Pół godziny.");
  const before = session.coachState.plan.exercises.map((item) => item.id);
  await say("Nie mam kanapy.");
  assert.deepEqual(session.coachState.plan.exercises.map((item) => item.id), before);
  assert.equal(session.coachState.change, null);
  session.coachState.runner.stop();
  await endSession(session);
});
