// Stage 05: reps from the camera. The scenario files say which exercise the
// camera watches and from which side (src/coach/camera-scenarios.js); the
// page counts reps from one angle (public/camera/rep-counter.js).

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadCameraScenarios, cameraFor } = require("../src/coach/camera-scenarios");
const { buildCatalog } = require("../src/coach/exercises");

const catalog = buildCatalog();
const scenarios = loadCameraScenarios();

test("Scenariusze kamery: przysiady i wyciskanie po wzorcu ruchu, pompki po liście, ławka bez kamery", () => {
  assert.deepEqual(scenarios.map((item) => item.scenario).sort(), ["overhead_press", "pushup", "squat"]);
  const camera = (id) => cameraFor(catalog.get(id), scenarios);
  assert.equal(camera("Goblet_Squat").scenario, "squat");
  assert.equal(camera("Goblet_Squat").view, "side");
  assert.equal(camera("Pushups").scenario, "pushup");
  assert.equal(camera("Standing_Military_Press").view, "front");
  assert.equal(camera("Barbell_Bench_Press_-_Medium_Grip"), null, "ten sam wzorzec co pompki, ale nie na liście");
  assert.equal(camera("Barbell_Curl"), null);
  assert.equal(cameraFor(undefined, scenarios), null);
});

test("Każde ćwiczenie ze scenariusza istnieje w katalogu", () => {
  for (const item of scenarios) {
    for (const id of item.exercises) assert.ok(catalog.get(id), `${item.scenario}: ${id}`);
  }
});

async function counter(options = {}) {
  const { createRepCounter } = await import("../public/camera/rep-counter.js");
  let clock = 0;
  const reps = createRepCounter({ rule: "knee_angle", start: "high", low: 110, high: 155, now: () => clock, ...options });
  // One frame every 170 ms (YOLO sends about 6 a second).
  const frames = (...angles) => {
    for (const value of angles) {
      clock += 170;
      reps.handle({ measurements: [{ id: options.rule || "knee_angle", visible: value !== null, value }] });
    }
  };
  return { reps, frames };
}

test("Licznik: stanie → dół → stanie to jedno powtórzenie, wahanie przy progu nie liczy się drugi raz", async () => {
  const { reps, frames } = await counter();
  frames(175, 150, 120, 95, 90, 100, 130, 160, 172);
  assert.equal(reps.count, 1);
  frames(160, 150, 158, 152, 160, 175);
  assert.equal(reps.count, 1, "bez zejścia poniżej 110 nie ma powtórzenia");
  frames(140, 105, 140, 165, 130, 100, 150, 170);
  assert.equal(reps.count, 3);
});

test("Licznik: klatki bez kąta nic nie zmieniają, zbyt szybki skok to szum", async () => {
  const { reps, frames } = await counter();
  frames(170, null, null, 95, null, 165);
  assert.equal(reps.count, 1, "niewidoczne klatki pominięte");
  // Up at once after the rep (170 ms each): faster than 600 ms is not a rep.
  frames(100, 165);
  assert.equal(reps.count, 1);
  reps.reset();
  assert.equal(reps.count, 0);
  frames(170, 95, 100, 120, 165);
  assert.equal(reps.count, 1, "po resecie liczy od nowa");
});

test("Licznik: wyciskanie zaczyna nisko (start: low) — przy barkach → ręce proste → przy barkach", async () => {
  const { reps, frames } = await counter({ rule: "elbow_angle", start: "low", low: 110, high: 150 });
  frames(85, 120, 160, 170, 140, 90);
  assert.equal(reps.count, 1);
  frames(95, 130, 165, 120, 100);
  assert.equal(reps.count, 2);
  frames(90, 165);
  assert.equal(reps.count, 2, "ręce w górze bez powrotu to jeszcze nie powtórzenie");
});

const { createCoach } = require("../src/coach");
const { buildWeekPlan } = require("../src/coach/week-plan");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const goblet = { id: "Goblet_Squat", name: "przysiad goblet", pattern: "squat", equipment: "kettlebell", sets: 2, reps: 10, restS: 60 };
const press = { id: "Standing_Military_Press", name: "wyciskanie żołnierskie", pattern: "vertical_push", equipment: "barbell", sets: 1, reps: 10, restS: 60 };

// Today's day of a weekly plan, so the runner is the one the coach builds
// (with its camera note); its exercises are then set to a squat and a press.
async function cameraWorkout() {
  const profile = { goal: "muscle", level: "intermediate", equipment: "gym", minutes: 60, daysPerWeek: 4 };
  const weekPlan = { ...buildWeekPlan(catalog, profile), id: "p1", variant: "A", parentId: null, startedAt: new Date().toISOString() };
  const replies = ["Robimy dół. [TODAY day=tue]"];
  const llm = { streamChat: (args) => fakeLlm(replies.shift() || "OK.").streamChat(args) };
  const coach = createCoach({ voiceId: "v", catalog, engine });
  const live = await liveSession({ llm, coach });
  live.session.coachState = coach.createState({ mode: "training", weekPlan, profile });
  const say = async (text) => { await runTurn(live.session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const spoken = () => live.events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  await say("Czuję się dobrze.");
  const state = live.session.coachState;
  state.plan.exercises.splice(0, state.plan.exercises.length, { ...goblet }, { ...press });
  return { ...live, coach, state, say, spoken };
}

test("Kamera w treningu: prośba o ustawienie z boku i z przodu, „gotowe” bierze liczbę z kamery, „zrobiłem 9” wygrywa", async () => {
  const { session, coach, state, say, spoken } = await cameraWorkout();
  coach.cameraSwitched(session, true);
  await say("Gotowe.");
  assert.equal(state.runner.progress.phase, "warmup");
  await say("Gotowe.");
  assert.match(spoken().at(-1), /^Ustaw kamerę z boku, tak żeby było widać całą sylwetkę\. Ćwiczenie 1 z 2: przysiad goblet\./);
  assert.deepEqual(coach.workoutEvent(session).workout.camera, { scenario: "squat", view: "side", rep: { rule: "knee_angle", start: "high", low: 110, high: 155 } });

  assert.equal(coach.cameraReps(session, { count: 9, exerciseIndex: 0, setIndex: 1 }), false, "nie ta seria");
  assert.equal(coach.cameraReps(session, { count: 9, exerciseIndex: 0, setIndex: 0 }), true);
  await say("Gotowe.");
  assert.deepEqual(state.runner.progress.completed[0], { id: "Goblet_Squat", set: 1, reps: 9, seconds: null, kg: null, source: "camera" });
  assert.match(spoken().at(-1), /^Seria zaliczona, kamera naliczyła 9\. Przerwa 60 sekund\.$/);

  await say("Gotowe.");
  assert.equal(state.runner.progress.setIndex, 1);
  assert.doesNotMatch(spoken().at(-1), /Ustaw kamerę/, "ta sama strona — bez prośby");
  coach.cameraReps(session, { count: 6, exerciseIndex: 0, setIndex: 1 });
  await say("Zrobiłem 9.");
  assert.equal(state.runner.progress.completed[1].reps, 9);
  assert.equal(state.runner.progress.completed[1].source, undefined, "liczba powiedziana wygrywa nad kamerą");
  assert.match(spoken().at(-1), /^Seria zaliczona\. Przerwa 60 sekund, potem wyciskanie żołnierskie\. Ustaw kamerę z przodu/);
  assert.equal(coach.workoutEvent(session).workout.camera.scenario, "overhead_press", "w przerwie już następne ćwiczenie");
  state.runner.stop();
  await endSession(session);
});

test("Kamera wyłączona: bez prośby o ustawienie; zgaszona w serii — liczba z kamery przepada", async () => {
  const { session, coach, state, say, spoken } = await cameraWorkout();
  await say("Gotowe.");
  await say("Gotowe.");
  assert.match(spoken().at(-1), /^Ćwiczenie 1 z 2: przysiad goblet\./);
  coach.cameraSwitched(session, true);
  coach.cameraReps(session, { count: 4, exerciseIndex: 0, setIndex: 0 });
  coach.cameraSwitched(session, false);
  await say("Gotowe.");
  assert.equal(state.runner.progress.completed[0].reps, 10, "4 to tylko część serii: zostaje liczba z planu");
  assert.equal(state.runner.progress.completed[0].source, undefined);
  state.runner.stop();
  await endSession(session);
});
