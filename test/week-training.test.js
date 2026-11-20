// A training session with a weekly plan (src/coach/index.js, week-plan.js):
// its own prompt with the week and today's day, [TODAY] starts the day
// (shorter, or another day of the week), [NEW_PLAN] goes back to the
// interview — but not in the middle of a workout.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createCoach, SYSTEM_PROMPT } = require("../src/coach");
const { INTERVIEW_PROMPT } = require("../src/coach/interview");
const { buildCatalog } = require("../src/coach/exercises");
const { buildWeekPlan, weekdayOf } = require("../src/coach/week-plan");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const catalog = buildCatalog();
const profile = { goal: "muscle", level: "intermediate", equipment: "gym", minutes: 60, daysPerWeek: 4 };
const weekPlan = { ...buildWeekPlan(catalog, profile), id: "p1", variant: "A", parentId: null, startedAt: new Date().toISOString() };

async function training(replies, setup = {}) {
  const calls = [];
  const llm = { streamChat: (args) => { calls.push(args.messages); return fakeLlm(replies.shift() || "OK.").streamChat(args); } };
  const coach = createCoach({ voiceId: "v", catalog, engine });
  const live = await liveSession({ llm, coach });
  live.session.coachState = coach.createState({ mode: "training", weekPlan, profile, ...setup });
  const say = async (text) => { await runTurn(live.session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const spoken = () => live.events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  return { ...live, calls, say, spoken };
}

test("Trening z planu: prompt z tygodniem i dniem na dziś, [TODAY minutes=30] — krótszy dzień", async () => {
  const { session, calls, say, spoken } = await training(["Super, zaczynamy. [TODAY minutes=30]"]);
  await say("Dobrze się czuję, ale mam tylko pół godziny.");
  assert.notEqual(calls[0][0].content, SYSTEM_PROMPT);
  assert.match(calls[0][0].content, /Użytkownik ma już plan na cały tydzień/);
  assert.match(calls[0][1].content, /^Plan tygodnia \(góra \/ dół, wariant A\): poniedziałek: góra; wtorek: dół; czwartek: góra; piątek: dół\. Dziś/);
  const { plan } = session.coachState;
  assert.ok(plan.day);
  const full = weekPlan.days.find((day) => day.weekday === plan.day.weekday);
  assert.ok(plan.exercises.length < full.exercises.length, "30 minut — mniej ćwiczeń");
  assert.equal(plan.profile.minutes, 30);
  assert.match(spoken().at(-1), /^Dziś w planie: (góra|dół)\. .*Najpierw pięć minut rozgrzewki/);
  session.coachState.runner.stop();
  await endSession(session);
});

test("Trening z planu: inny dzień tygodnia na prośbę", async () => {
  const { session, say } = await training(["Dobrze, robimy dół. [TODAY day=tue]"]);
  await say("Wolę dziś nogi.");
  assert.deepEqual(session.coachState.plan.day, { weekday: "tue", type: "lower" });
  assert.equal(session.coachState.plan.exercises[0].id, weekPlan.days[1].exercises[0].id);
  session.coachState.runner.stop();
  await endSession(session);
});

test("Nowy plan głosem: przed treningiem wraca wywiad; w trakcie serii — nie", async () => {
  const { session, events, calls, say, spoken } = await training(["Jasne. [NEW_PLAN]", "Jaki masz teraz cel?"]);
  await say("Chcę zupełnie nowy plan, trenuję teraz trzy razy w tygodniu.");
  assert.equal(session.coachState.mode, "interview");
  assert.equal(spoken().at(-1), "Dobrze, układamy nowy plan. Co się zmieniło: cel, dni treningowe, czas czy sprzęt?");
  assert.equal(events.filter((event) => event.stage === "week_plan").at(-1).mode, "interview");
  await say("Trzy dni.");
  assert.match(calls[1][0].content, new RegExp(`^${INTERVIEW_PROMPT.slice(0, 40)}`));
  await endSession(session);

  const busy = await training(["Zaczynamy. [TODAY]", "Najpierw skończmy trening. [NEW_PLAN]"]);
  await busy.say("Gotowy.");
  busy.session.coachState.runner.advance({});
  busy.session.coachState.runner.advance({});
  assert.equal(busy.session.coachState.runner.progress.phase, "set");
  await busy.say("Ułóż mi nowy plan.");
  assert.equal(busy.session.coachState.mode, "training");
  assert.equal(busy.session.coachState.runner.progress.phase, "set");
  busy.session.coachState.runner.stop();
  await endSession(busy.session);
});

test("Dzień tygodnia z daty", () => {
  assert.equal(weekdayOf(new Date("2026-11-01T12:00:00")), "sun");
});
