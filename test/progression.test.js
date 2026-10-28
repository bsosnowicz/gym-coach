// Progression between sessions (src/coach/progression.js): the last session
// with the exercise decides — all sets and reps done means a bit more today,
// anything missed means the same; the coach says it when the exercise starts.

const test = require("node:test");
const assert = require("node:assert/strict");

const { applyProgression } = require("../src/coach/progression");
const { buildCatalog } = require("../src/coach/exercises");
const { planWorkout } = require("../src/coach/planner");
const { createCoach } = require("../src/coach");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const catalog = buildCatalog();
const squat = catalog.get("Barbell_Squat");
const item = { id: "Barbell_Squat", name: squat.name, pattern: "squat", sets: 3, reps: 10, restS: 90 };
const session = (sets, planned = { id: "Barbell_Squat", sets: 3, reps: 10 }) => [{ exercises: [planned], sets }];
const sets = (...results) => results.map(([reps, kg]) => ({ id: "Barbell_Squat", reps, kg }));

test("Progresja: komplet na 60 kg → dziś 62,5 kg; brakujące powtórzenia → zostaje 60 kg", () => {
  const up = applyProgression(item, squat, session(sets([10, 60], [10, 60], [10, 60])));
  assert.equal(up.kg, 62.5);
  assert.equal(up.progress, "Ostatnio 60 kg i wszystkie powtórzenia — dziś spróbuj 62,5 kg.");

  const same = applyProgression(item, squat, session(sets([10, 60], [8, 60], [6, 60])));
  assert.equal(same.kg, 60);
  assert.equal(same.progress, "Ostatnio 60 kg — zostajemy przy tym ciężarze.");

  const fewerSets = applyProgression(item, squat, session(sets([10, 60], [10, 60])));
  assert.equal(fewerSets.kg, 60, "dwie serie z trzech to nie komplet");
});

test("Progresja: bez ciężaru +2 powtórzenia (do 20), deska +10 s; nic nie zrobione — plan bez zmian", () => {
  const pushups = catalog.get("Pushups");
  const pushItem = { id: "Pushups", name: "pompki", sets: 3, reps: 10, restS: 75 };
  const history = [{ exercises: [{ id: "Pushups", sets: 3, reps: 10 }], sets: [1, 2, 3].map(() => ({ id: "Pushups", reps: 10 })) }];
  assert.equal(applyProgression(pushItem, pushups, history).reps, 12);
  const capped = [{ exercises: [{ id: "Pushups", sets: 3, reps: 20 }], sets: [1, 2, 3].map(() => ({ id: "Pushups", reps: 20 })) }];
  assert.equal(applyProgression({ ...pushItem, reps: 20 }, pushups, capped).progress, undefined);

  const plank = { id: "Plank", name: "deska", sets: 3, seconds: 30, restS: 60 };
  const held = [{ exercises: [{ id: "Plank", sets: 3, seconds: 30 }], sets: [1, 2, 3].map(() => ({ id: "Plank", reps: null, seconds: 30 })) }];
  assert.equal(applyProgression(plank, catalog.get("Plank"), held).seconds, 40);

  assert.deepEqual(applyProgression(item, squat, []), item);
  assert.deepEqual(applyProgression(item, squat, [{ exercises: [], sets: [] }]), item);
});

test("Progresja: liczy się ostatnia sesja z tym ćwiczeniem, nie po prostu ostatnia", () => {
  const history = [
    { exercises: [{ id: "Pushups", sets: 3, reps: 10 }], sets: [{ id: "Pushups", reps: 10 }] },
    ...session(sets([5, 100], [5, 100], [5, 100]), { id: "Barbell_Squat", sets: 3, reps: 5 }),
  ];
  assert.equal(applyProgression({ ...item, reps: 5 }, squat, history).kg, 102.5);
});

test("Plan i rozmowa: planer bierze historię, a trener mówi o progresji przy pierwszej serii", async () => {
  // Session B (the newest) had the full squat; session A, before it, the back squat at 60 kg.
  const history = [
    { exercises: [{ id: "Barbell_Full_Squat", sets: 3, reps: 10 }], sets: [{ id: "Barbell_Full_Squat", reps: 10 }] },
    ...session(sets([10, 60], [10, 60], [10, 60])),
  ];
  const plan = planWorkout(catalog, { goal: "muscle", level: "intermediate", equipment: "gym", minutes: 30 }, { history });
  assert.equal(plan.exercises[0].id, "Barbell_Squat");
  assert.equal(plan.exercises[0].kg, 62.5);

  const coach = createCoach({ voiceId: "v", catalog, engine });
  const { session: live, events } = await liveSession({ llm: fakeLlm("Dobrze! [PLAN goal=muscle level=intermediate equipment=gym minutes=30]"), coach });
  live.coachState = coach.createState({ history });
  const say = async (text) => { await runTurn(live, text); for (let i = 0; i < 12; i += 1) await tick(); };
  await say("Pół godziny, siłownia.");
  await say("tak");
  await say("gotowe");
  await say("gotowe");
  const spoken = events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  assert.equal(spoken.at(-1), "Ćwiczenie 1 z 3: przysiad ze sztangą. Ostatnio 60 kg i wszystkie powtórzenia — dziś spróbuj 62,5 kg. Seria pierwsza z 3, 10 powtórzeń na 62,5 kg. Powiedz „gotowe” po serii.");
  live.coachState.runner.stop();
  await endSession(live);
});

test("Różnorodność: plany przeplatają się A/B, a progresja liczy od ostatniego razu z danym ćwiczeniem", () => {
  const profile = { goal: "muscle", level: "intermediate", equipment: "gym", minutes: 45 };
  let history = [];
  const plans = [];
  for (let i = 0; i < 3; i += 1) {
    const plan = planWorkout(catalog, profile, { history });
    plans.push(plan);
    const done = plan.exercises.flatMap((item) => Array.from({ length: item.sets }, () => ({ id: item.id, reps: item.reps, kg: 60 })));
    history = [{ exercises: plan.exercises, sets: done }, ...history];
  }
  const ids = plans.map((plan) => plan.exercises.map((item) => item.id));
  assert.ok(ids[0].every((id) => !ids[1].includes(id)), `A i B bez wspólnych ćwiczeń: ${ids[1].join(", ")}`);
  assert.deepEqual(ids[2], ids[0], "trzecia sesja wraca do A");
  assert.equal(plans[2].exercises[0].kg, 62.5, "z progresją od sesji A");
  assert.deepEqual(plans[2].exercises.map((item) => item.pattern), plans[0].exercises.map((item) => item.pattern), "te same wzorce ruchu");
});
