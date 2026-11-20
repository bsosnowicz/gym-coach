// Variants of the weekly plan (src/coach/index.js, saveTodayVariant): a
// changed exercise in today's day makes variant B and A stays; a second
// change overwrites B; skipping is for today only; the summary at the end
// says so; [VARIANT name=A] goes back. With the database: B is saved with
// parent A, then overwritten, and switching moves the active flag.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createCoach } = require("../src/coach");
const { buildCatalog } = require("../src/coach/exercises");
const { buildWeekPlan } = require("../src/coach/week-plan");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const catalog = buildCatalog();
const profile = { goal: "muscle", level: "intermediate", equipment: "gym", minutes: 60, daysPerWeek: 4 };
const weekPlanA = () => ({ ...buildWeekPlan(catalog, profile), id: "p1", variant: "A", parentId: null, startedAt: new Date().toISOString() });

async function training(replies, { plans = null, weekPlan = weekPlanA() } = {}) {
  const llm = { streamChat: (args) => fakeLlm(replies.shift() || "OK.").streamChat(args) };
  const coach = createCoach({ voiceId: "v", catalog, engine, plans });
  const live = await liveSession({ llm, coach });
  live.session.coachState = coach.createState({ mode: "training", weekPlan, profile });
  const say = async (text) => { await runTurn(live.session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const spoken = () => live.events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  return { ...live, say, spoken, weekPlan };
}

// The runner waits for silence before it speaks: poll for what should be said.
async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(check(), "nie doczekałem się");
}

const finish = async (session) => {
  const { runner } = session.coachState;
  while (runner.progress.phase !== "done") runner.skip();
  for (let i = 0; i < 12; i += 1) await tick();
};

test("Wariant B: zamiana ćwiczenia w poniedziałek — B z nową listą, A bez zmian; druga zmiana nadpisuje B", async () => {
  const { session, events, say, spoken, weekPlan } = await training([
    "Robimy poniedziałek. [TODAY day=mon]", "Zmieniam. [SWAP]", "Pomijamy. [SKIP]", "Zmieniam. [SWAP]",
  ]);
  const mondayA = weekPlan.days[0].exercises.map((item) => item.id);
  await say("Zróbmy poniedziałek.");
  await say("Nie lubię tego ćwiczenia, daj inne.");
  const b = session.coachState.weekPlan;
  assert.equal(b.variant, "B");
  assert.equal(b.parentId, "p1");
  assert.notEqual(b.days[0].exercises[0].id, mondayA[0]);
  assert.deepEqual(b.days[0].exercises.slice(1).map((item) => item.id), mondayA.slice(1));
  assert.equal(b.days[0].exercises[0].kg, undefined, "w planie bez ciężaru z dzisiaj");
  assert.deepEqual(b.days.slice(1), weekPlan.days.slice(1));
  assert.deepEqual(weekPlan.days[0].exercises.map((item) => item.id), mondayA, "A zostaje");
  assert.equal(events.filter((event) => event.stage === "week_plan").at(-1).week.variant, "B");

  await say("Pomińmy to.");
  assert.equal(session.coachState.weekPlan, b, "pominięcie tylko na dziś");
  await say("To też zamień.");
  assert.equal(session.coachState.weekPlan.variant, "B", "bez wariantu C");
  assert.equal(session.coachState.variants.length, 2);

  await finish(session);
  await until(() => /wariant A zostaje/.test(spoken().at(-1)));
  assert.match(spoken().at(-1), /Zmiany z dzisiaj zapisałem w planie jako wariant B, a wariant A zostaje\. Jeśli wolisz poprzedni, powiedz: wróć do wariantu A\.$/);
  await endSession(session);
});

test("Powrót do wariantu A głosem; nieznany wariant — zostajemy; w trakcie serii — nie", async () => {
  const { session, say, spoken } = await training([
    "Dobrze. [TODAY day=mon]", "Zmieniam. [SWAP]", "Wracamy. [VARIANT name=A]", "Wracamy. [VARIANT name=A]",
    "Sprawdzam. [VARIANT name=Z]",
  ]);
  await say("Poniedziałek.");
  await say("Inne ćwiczenie.");
  const { runner } = session.coachState;
  runner.advance({});
  runner.advance({});
  assert.equal(runner.progress.phase, "set");
  await say("Wróć do wariantu A.");
  assert.equal(session.coachState.weekPlan.variant, "B", "w trakcie serii plan się nie zmienia");
  await finish(session);
  await say("Wróć do wariantu A.");
  assert.equal(session.coachState.weekPlan.variant, "A");
  await until(() => spoken().at(-1) === "Dobrze, wracamy do wariantu A.");
  await say("A wariant Z?");
  await until(() => spoken().at(-1) === "Nie mam wariantu Z tego planu. Zostajemy przy wariancie A.");
  await endSession(session);
});

test("Wariant w bazie: B z rodzicem A, potem nadpisanie B, powrót przez aktywację", async () => {
  const calls = [];
  const plans = {
    saveVariant: async (base, days) => {
      calls.push(["saveVariant", base.id, base.variant]);
      return base.parentId ? { ...base, days } : { ...base, id: "p2", variant: "B", parentId: base.id, days };
    },
    activateVariant: async (base, letter) => {
      calls.push(["activate", base.id, letter]);
      return letter === "A" ? weekPlanA() : null;
    },
  };
  const { session, say } = await training([
    "Dobrze. [TODAY day=mon]", "Zmieniam. [SWAP]", "Zmieniam. [SWAP]", "Wracamy. [VARIANT name=A]",
  ], { plans });
  await say("Poniedziałek.");
  await say("Inne.");
  await say("Jeszcze inne.");
  await session.coachState.variantSave;
  assert.deepEqual(calls, [["saveVariant", "p1", "A"], ["saveVariant", "p2", "B"]]);
  assert.equal(session.coachState.weekPlan.id, "p2");
  await finish(session);
  await say("Wróć do A.");
  assert.deepEqual(calls.at(-1), ["activate", "p2", "A"]);
  assert.equal(session.coachState.weekPlan.variant, "A");
  await endSession(session);
});
