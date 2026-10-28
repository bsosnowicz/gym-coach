// Pain said during a break (holdPainDuringBreak in src/coach/index.js): the
// engine drops everything but "wracamy" / "kończymy" then, so the coach keeps
// it — saved at once, the plan adapted on the way back, and what names no
// clear body part goes to the model after the break.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createCoach, holdPainDuringBreak } = require("../src/coach");
const { buildCatalog } = require("../src/coach/exercises");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const catalog = buildCatalog();

async function breakSession(replies) {
  const reports = [];
  const calls = [];
  const store = { report: async (report) => { reports.push(report); return true; } };
  const llm = { streamChat: (args) => { calls.push(args.messages); return fakeLlm(replies.shift() || "OK.").streamChat(args); } };
  const coach = holdPainDuringBreak(engine.withSessionControl(createCoach({ voiceId: "v", catalog, engine, injuries: store })));
  const live = await liveSession({ llm, coach });
  const say = async (text) => { await runTurn(live.session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const spoken = () => live.events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  return { ...live, coach, say, spoken, reports, calls };
}

test("Ból w przerwie: zapis od razu, plan bez zmian w przerwie, zmiana i zapowiedź po powrocie", async () => {
  const { session, coach, say, spoken, reports, calls } = await breakSession([
    "Dobrze! [PLAN goal=muscle level=intermediate equipment=gym minutes=60]",
  ]);
  await say("Godzina na siłowni.");
  await say("tak");
  await say("gotowe");
  await say("gotowe");
  const first = session.coachState.plan.exercises[0];
  assert.ok(catalog.get(first.id).hard.includes("knee_left"), "zaczynamy od przysiadu");

  coach.requestPause(session, { source: "button", confirmNow: true });
  for (let i = 0; i < 6; i += 1) await tick();
  const modelCalls = calls.length;
  await say("Wiesz co, boli mnie lewe kolano.");
  assert.deepEqual(reports.map(({ bodyPart, severity }) => ({ bodyPart, severity })), [{ bodyPart: "knee_left", severity: "medium" }]);
  assert.equal(session.coachState.plan.exercises[0].id, first.id, "w przerwie plan stoi");
  assert.equal(calls.length, modelCalls, "w przerwie nic nie idzie do modelu");

  coach.continueSession(session);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  for (let i = 0; i < 12; i += 1) await tick();
  assert.ok(!catalog.get(session.coachState.plan.exercises[0].id).loads.includes("knee_left"));
  assert.ok(spoken().some((text) => text.startsWith("Przerywamy, nie obciążamy: lewe kolano.")), spoken().join(" | "));
  session.coachState.runner.stop();
  await endSession(session);
});

test("Ból w przerwie bez strony: po powrocie i chwili ciszy wypowiedź idzie do modelu", async () => {
  const { session, coach, say, calls } = await breakSession([
    "Dobrze! [PLAN goal=muscle level=intermediate equipment=gym minutes=30]",
    "Które kolano? Lewe czy prawe?",
  ]);
  await say("Pół godziny, siłownia.");
  await say("tak");
  coach.requestPause(session, { source: "button", confirmNow: true });
  for (let i = 0; i < 6; i += 1) await tick();
  await say("Boli mnie kolano.");
  const before = calls.length;
  coach.continueSession(session);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  for (let i = 0; i < 12; i += 1) await tick();
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).at(-1).content, "Boli mnie kolano.");
  session.coachState.runner.stop();
  await endSession(session);
});
