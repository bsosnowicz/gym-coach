// Signals during a workout (stage 12 audit, src/coach/workout.js and the
// markers in src/coach/index.js): "za ciężko" first lowers the weight (an
// exercise without one gets an easier exercise), a weight on demand, one set
// more, longer or shorter rests (also the one running now), and a swap to a
// named equipment ("zamień na hantle").

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

function runnerFor(exercises) {
  let clock = 0;
  const timers = [];
  const said = [];
  const plan = { exercises: exercises.map((item) => ({ ...item })) };
  const runner = createWorkoutRunner(plan, {
    speak: (text) => said.push(text),
    publish: () => {},
    now: () => clock,
    setTimer: (fn, ms) => { const timer = { fn, at: clock + ms }; timers.push(timer); return timer; },
    clearTimer: (timer) => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
  });
  const wait = (ms) => { clock += ms; };
  return { runner, said, plan, wait, now: () => clock };
}

const squat = { id: "Barbell_Squat", name: "przysiad ze sztangą", equipment: "barbell", sets: 3, reps: 10, restS: 120, kg: 60 };
const pushups = { id: "Pushups", name: "pompki", equipment: "body_only", sets: 3, reps: 10, restS: 90 };

test("Ciężar na żądanie: o ~10% w dół, konkretna liczba w górę, bez ciężaru w planie — „weź lżej”", () => {
  const { runner, said, plan } = runnerFor([squat]);
  assert.equal(runner.changeWeight({ up: false }), true);
  assert.equal(plan.exercises[0].kg, 55);
  assert.equal(said.at(-1), "Dobrze, przysiad ze sztangą: zmniejszamy do 55 kg.");
  runner.changeWeight({ up: false, kg: 70 });
  assert.equal(plan.exercises[0].kg, 70);
  assert.equal(said.at(-1), "Dobrze, przysiad ze sztangą: zwiększamy do 70 kg.");

  const fresh = runnerFor([{ ...squat, kg: undefined }]);
  fresh.runner.changeWeight({ up: true });
  assert.equal(fresh.said.at(-1), "Dobrze, weź więcej i po serii powiedz, ile było.");
  assert.equal(runnerFor([pushups]).runner.changeWeight({ up: false }), false, "pompki bez ciężaru");
});

test("Seria więcej, najwyżej 6", () => {
  const { runner, said, plan } = runnerFor([{ ...squat, sets: 5 }]);
  assert.equal(runner.moreSets(), true);
  assert.equal(plan.exercises[0].sets, 6);
  assert.equal(said.at(-1), "Dobrze, przysiad ze sztangą: robimy 6 serii.");
  assert.equal(runner.moreSets(), false);
});

test("Przerwy: dłuższa o 30 s także ta, która trwa; krótsza nie mniej niż 30 s; podana liczba", () => {
  const { runner, said, plan, wait, now } = runnerFor([squat]);
  runner.advance({});
  runner.advance({});
  runner.advance({ reps: 10 });
  assert.equal(runner.progress.phase, "rest");
  wait(20000);
  const before = runner.progress.restEndsAt - now();
  runner.changeRest({ longer: true });
  assert.equal(plan.exercises[0].restS, 150);
  assert.equal(runner.progress.restEndsAt - now(), before + 30000);
  assert.equal(said.at(-1), "Dobrze, przerwy po 150 sekund.");
  runner.changeRest({ seconds: 10 });
  assert.equal(plan.exercises[0].restS, 30);
  runner.changeRest({ seconds: 180 });
  assert.equal(said.at(-1), "Dobrze, przerwy po 3 minuty.");
});

async function training(replies, exercises) {
  const llm = { streamChat: (args) => fakeLlm(replies.shift() || "OK.").streamChat(args) };
  const coach = createCoach({ voiceId: "v", catalog, engine });
  const live = await liveSession({ llm, coach });
  live.session.coachState = coach.createState({});
  const say = async (text) => { await runTurn(live.session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const state = live.session.coachState;
  state.plan = {
    profile: { goal: "muscle", level: "intermediate", equipment: "gym", minutes: 45, focus: null },
    avoid: [], warmup: { durationS: 300 }, exercises: exercises.map((item) => ({ ...item, pattern: catalog.get(item.id).pattern })),
  };
  state.runner = createWorkoutRunner(state.plan, { speak: () => {}, publish: () => {} });
  return { ...live, say, state };
}

test("Rozmowa: „za ciężko” zmniejsza ciężar, na pompkach daje łatwiejsze ćwiczenie; „zamień na hantle” — na hantle", async () => {
  const { session, say, state } = await training([
    "Zmniejszamy. [LIGHTER]", "Jasne. [SWAP equipment=dumbbell]", "Jasne. [MORE_SETS]", "Dobrze. [REST seconds=90]",
  ], [squat, pushups]);
  await say("Za ciężko mi.");
  assert.equal(state.plan.exercises[0].kg, 55);
  assert.equal(state.plan.exercises[0].id, "Barbell_Squat", "ciężar, nie zamiana");
  await say("Zamień na hantle.");
  assert.equal(catalog.get(state.plan.exercises[0].id).equipment, "dumbbell");
  await say("Zróbmy jeszcze jedną serię.");
  assert.equal(state.plan.exercises[0].sets, 4);
  await say("Przerwy półtorej minuty.");
  assert.equal(state.plan.exercises[0].restS, 90);
  state.runner.stop();
  await endSession(session);

  const push = await training(["Dobrze. [LIGHTER]"], [pushups]);
  await push.say("Za ciężko.");
  assert.notEqual(push.state.plan.exercises[0].id, "Pushups", "pompki bez ciężaru — łatwiejsze ćwiczenie");
  push.state.runner.stop();
  await endSession(push.session);
});
