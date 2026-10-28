// One scheme instead of a new plan every time (src/coach/schedule.js, the
// planner): the same goal, gear and focus bring back the last session's
// exercises with progression; a new injury replaces only what it hits; "ułóż
// nowy plan" (fresh) gives different exercises; muscles trained less than
// 48 h ago get a warning and no step up; a returning user is not asked about
// experience again.

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCatalog } = require("../src/coach/exercises");
const { planWorkout, describePlan, focusOf } = require("../src/coach/planner");
const { findScheme, recoveryFor, agoText } = require("../src/coach/schedule");
const { createCoach } = require("../src/coach");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const catalog = buildCatalog();
const legs = { goal: "muscle", level: "intermediate", equipment: "gym", minutes: 45, focus: "legs" };
const DAY = 24 * 3600 * 1000;

function sessionOf(profile, plan, startedAt, kg = 40) {
  const sets = plan.exercises.flatMap((item) => Array.from({ length: item.sets }, () => ({ id: item.id, reps: item.reps, kg })));
  return { started_at: new Date(startedAt).toISOString(), finished: true, profile, exercises: plan.exercises, sets };
}

test("Schemat: ten sam cel, sprzęt i partia — te same ćwiczenia z progresją; inny focus — inny plan", () => {
  const first = planWorkout(catalog, legs);
  const history = [sessionOf(legs, first, Date.now() - 4 * DAY)];
  const again = planWorkout(catalog, legs, { history });
  assert.deepEqual(again.exercises.map((item) => item.id), first.exercises.map((item) => item.id));
  assert.ok(again.schemeFrom);
  assert.equal(again.exercises[0].kg, 42.5);
  assert.match(describePlan(again), /Robimy Twój stały schemat/);

  assert.equal(findScheme({ ...legs, focus: "back" }, history), null);
  assert.equal(planWorkout(catalog, { ...legs, focus: "back" }, { history }).schemeFrom, null);
});

test("Schemat: nowa kontuzja wymienia tylko to, co obciąża — bez trzech wspięć na palce", () => {
  const first = planWorkout(catalog, legs);
  const history = [sessionOf(legs, first, Date.now() - 4 * DAY)];
  const sore = planWorkout(catalog, legs, { history, avoid: [{ part: "knee_left", severity: "high" }] });
  assert.ok(sore.exercises.every((item) => !catalog.get(item.id).loads.includes("knee_left")));
  const patterns = sore.exercises.map((item) => item.pattern);
  assert.equal(new Set(patterns).size, patterns.length, patterns.join(", "));
});

test("Nowy plan na żądanie (fresh): inne ćwiczenia niż w schemacie, te same wzorce", () => {
  const first = planWorkout(catalog, legs);
  const history = [sessionOf(legs, first, Date.now() - 4 * DAY)];
  const fresh = planWorkout(catalog, legs, { history, fresh: true });
  assert.equal(fresh.schemeFrom, null);
  assert.ok(fresh.exercises.every((item) => !first.exercises.some((old) => old.id === item.id)), fresh.exercises.map((item) => item.name).join(", "));
});

test("Regeneracja: nogi 20 h temu — ostrzeżenie i bez podnoszenia ciężarów; po 3 dniach — nic", () => {
  const first = planWorkout(catalog, legs);
  const now = Date.now();
  const recent = [sessionOf(legs, first, now - 20 * 3600 * 1000)];
  assert.deepEqual(recoveryFor(legs, recent, { catalog, focusOf, now }), { hours: 20 });
  assert.equal(recoveryFor(legs, [sessionOf(legs, first, now - 3 * DAY)], { catalog, focusOf, now }), null);
  assert.equal(recoveryFor({ ...legs, focus: "arms" }, recent, { catalog, focusOf, now }), null, "ramiona po treningu nóg — bez czekania");

  const tired = planWorkout(catalog, legs, { history: recent, tired: true });
  assert.equal(tired.exercises[0].kg, 40);
  assert.match(tired.exercises[0].progress, /Mięśnie jeszcze się regenerują/);
  assert.equal(agoText(20), "20 godzin temu");
  assert.equal(agoText(22), "22 godziny temu");
});

test("Rozmowa: kolejny trening — bez pytania o poziom, ostrzeżenie o regeneracji w podsumowaniu, „nowy plan” przez fresh=yes", async () => {
  const first = planWorkout(catalog, legs);
  const history = [sessionOf(legs, first, Date.now() - 20 * 3600 * 1000)];
  const calls = [];
  const replies = ["Jak się dziś czujesz?", "Dobrze. [PLAN goal=muscle level=intermediate equipment=gym minutes=45 focus=legs fresh=yes]"];
  const llm = { streamChat: (args) => { calls.push(args.messages); return fakeLlm(replies.shift() || "OK.").streamChat(args); } };
  const coach = createCoach({ voiceId: "v", catalog, engine });
  const { session, events } = await liveSession({ llm, coach });
  session.coachState = coach.createState({ history });
  const say = async (text) => { await runTurn(session, text); for (let i = 0; i < 12; i += 1) await tick(); };

  await say("Cześć.");
  assert.match(calls[0][1].content, /Znane z poprzedniego treningu: goal=muscle level=intermediate equipment=gym focus=legs\. To kolejny trening: nie pytaj o doświadczenie/);
  await say("Dobrze się czuję, siłownia, 45 minut, ale ułóż mi nowy plan na nogi.");
  const spoken = events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  assert.match(spoken.at(-1), /skupiamy się na: nogi, nowy plan\. Uwaga: te mięśnie trenowałeś 20 godzin temu, a regeneracja trwa około 48 godzin\. .* Układam plan\?$/);

  await say("Tak.");
  const { plan } = session.coachState;
  assert.equal(plan.schemeFrom, null, "nowy plan, nie schemat");
  assert.ok(plan.tired);
  session.coachState.runner.stop();
  await endSession(session);
});
