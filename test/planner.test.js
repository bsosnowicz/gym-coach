// The workout plan (src/coach/planner.js) and how it comes out of the
// interview: the model writes [PLAN ...], code builds the plan, the coach
// reads it out with fixed text and the page gets it over SSE.

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCatalog } = require("../src/coach/exercises");
const { planWorkout, describePlan } = require("../src/coach/planner");
const { createCoach, parsePlanMarker } = require("../src/coach");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const catalog = buildCatalog();
const profile = { goal: "muscle", level: "intermediate", equipment: "gym", minutes: 60 };

test("Plan: siłownia, 60 min — nogi, pchanie, biodra, ciąganie, barki w tej kolejności, bez powtórzeń", () => {
  const plan = planWorkout(catalog, profile);
  const patterns = plan.exercises.map((item) => item.pattern);
  assert.ok(plan.exercises.length >= 4 && plan.exercises.length <= 8);
  assert.deepEqual(patterns.slice(0, 4), ["squat", "horizontal_push", "hinge", "horizontal_pull"]);
  assert.equal(new Set(plan.exercises.map((item) => item.id)).size, plan.exercises.length);
  assert.ok(plan.exercises.every((item) => item.sets === 3 && (item.reps === 10 || item.seconds === 30) && item.restS === 90));
});

test("Plan: krótszy trening ma mniej ćwiczeń; cel zmienia serie, powtórzenia i przerwy", () => {
  assert.ok(planWorkout(catalog, { ...profile, minutes: 20 }).exercises.length < planWorkout(catalog, profile).exercises.length);
  const strength = planWorkout(catalog, { ...profile, goal: "strength" }).exercises[0];
  assert.deepEqual([strength.sets, strength.reps, strength.restS], [4, 5, 150]);
  const beginner = planWorkout(catalog, { ...profile, goal: "strength", level: "beginner" }).exercises[0];
  assert.deepEqual([beginner.sets, beginner.reps], [3, 8], "początkujący: mniej serii, bez ciężkich piątek");
});

test("Plan: bez sprzętu tylko masa ciała bez wyposażenia; deska w sekundach", () => {
  const plan = planWorkout(catalog, { ...profile, equipment: "bodyweight", minutes: 60 });
  for (const item of plan.exercises) {
    const exercise = catalog.get(item.id);
    assert.equal(exercise.equipment, "body_only", item.id);
    assert.deepEqual(exercise.needs, [], item.id);
  }
  const core = plan.exercises.find((item) => item.pattern === "core_static");
  if (core) assert.ok(core.seconds > 0 && !core.reps);
});

test("Plan: bolące kolano wyklucza przysiady i wykroki", () => {
  const plan = planWorkout(catalog, profile, { avoid: ["knee_left"] });
  assert.ok(plan.exercises.every((item) => !catalog.get(item.id).loads.includes("knee_left")));
  assert.ok(plan.exercises.length >= 3);
});

test("Plan: tekst ogłoszenia wymienia ćwiczenia i zaprasza do rozgrzewki", () => {
  const text = describePlan(planWorkout(catalog, { ...profile, minutes: 30 }));
  assert.match(text, /^Mam plan na dziś\. Najpierw pięć minut rozgrzewki/);
  assert.match(text, /3 serie po 10 powtórzeń/);
  assert.match(text, /Powiedz „gotowe”/);
});

test("Znacznik planu: tylko zamknięte wartości", () => {
  assert.deepEqual(parsePlanMarker("goal=strength level=beginner equipment=home_dumbbells minutes=45"),
    { goal: "strength", level: "beginner", equipment: "home_dumbbells", minutes: 45 });
  assert.equal(parsePlanMarker("goal=siła level=beginner equipment=gym minutes=45"), null);
  assert.equal(parsePlanMarker("goal=strength level=beginner equipment=gym minutes=5").minutes, 10, "„5 minut” to najkrótszy plan, nie brak planu");
  assert.equal(parsePlanMarker("goal=strength level=beginner equipment=gym"), null);
});

test("Rozmowa: znacznik [PLAN] — plan w stanie, zdarzenie dla strony, ogłoszenie stałym tekstem, plan w prompcie", async () => {
  const coach = createCoach({ voiceId: "v", catalog, engine });
  const calls = [];
  const llm = fakeLlm("Super, układam plan. [PLAN goal=muscle level=intermediate equipment=gym minutes=30]");
  const recording = { streamChat(args) { calls.push(args.messages); return llm.streamChat(args); } };
  const { session, events } = await liveSession({ llm: recording, coach });

  await runTurn(session, "Mam pół godziny na siłowni.");
  for (let i = 0; i < 10; i += 1) await tick();

  assert.ok(session.coachState.plan);
  const workout = events.find((event) => event.stage === "workout");
  assert.equal(workout.workout.plan.exercises.length, session.coachState.plan.exercises.length);
  const spoken = events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  assert.ok(spoken.some((text) => text.startsWith("Mam plan na dziś.")), spoken.join(" | "));
  assert.ok(spoken.every((text) => !text.includes("[PLAN")), "znacznik nie trafia do mowy");
  assert.deepEqual(coach.workoutEvent(session), workout);

  await runTurn(session, "Jakie jest pierwsze ćwiczenie?");
  for (let i = 0; i < 4; i += 1) await tick();
  assert.match(calls.at(-1)[1].content, /^Plan dzisiejszego treningu/);
  await endSession(session);
});

test("Rozmowa: znacznik z błędnymi polami nie tworzy planu", async () => {
  const coach = createCoach({ voiceId: "v", catalog, engine });
  const { session, events } = await liveSession({ llm: fakeLlm("Dobrze. [PLAN goal=yoga level=beginner equipment=gym minutes=30]"), coach });
  await runTurn(session, "Joga.");
  for (let i = 0; i < 4; i += 1) await tick();
  assert.equal(session.coachState.plan, null);
  assert.ok(!events.some((event) => event.stage === "workout"));
  await endSession(session);
});

test("Rozmowa: „5 minut” daje najkrótszy plan; błędny znacznik — trener prosi o powtórzenie zamiast milczeć", async () => {
  const say = async (session, text) => { await runTurn(session, text); for (let i = 0; i < 10; i += 1) await tick(); };
  const short = await liveSession({ llm: fakeLlm("Dobrze! [PLAN goal=muscle level=beginner equipment=gym minutes=5]"), coach: createCoach({ voiceId: "v", catalog, engine }) });
  await say(short.session, "5 minut.");
  assert.equal(short.session.coachState.plan.profile.minutes, 10);
  short.session.coachState.runner.stop();
  await endSession(short.session);

  const broken = await liveSession({ llm: fakeLlm("Dobrze! [PLAN goal=muscle level=beginner equipment=gimnastic minutes=20]"), coach: createCoach({ voiceId: "v", catalog, engine }) });
  await say(broken.session, "20 minut.");
  assert.equal(broken.session.coachState.plan, null);
  const spoken = broken.events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  assert.match(spoken.at(-1), /^Nie udało mi się ułożyć planu\. Powiedz jeszcze raz/);
  await endSession(broken.session);
});
