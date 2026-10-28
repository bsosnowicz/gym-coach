// Injuries named without the model's marker (src/coach/body-mentions.js) and
// no duplicates: "chcę potrenować stabilizację na kontuzjowanym lewym kolanie"
// (test 28.10) used to save nothing; a part already known is written again
// only when the pain is stronger.

const test = require("node:test");
const assert = require("node:assert/strict");

const { findInjuryMentions } = require("../src/coach/body-mentions");
const { createCoach } = require("../src/coach");
const { buildCatalog } = require("../src/coach/exercises");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

test("Wzmianki: kontuzja bez bólu, ból, ostry ból, strona przy partii; bez urazu albo bez strony — nic", () => {
  assert.deepEqual(findInjuryMentions("chcę dzisiaj potrenować stabilizację na moim kontuzjowanym lewym kolanie"), [{ part: "knee_left", severity: "low" }]);
  assert.deepEqual(findInjuryMentions("odczuwam ból w prawym nadgarstku"), [{ part: "wrist_right", severity: "medium" }]);
  assert.deepEqual(findInjuryMentions("Boli mnie strasznie lewe kolano"), [{ part: "knee_left", severity: "high" }]);
  assert.deepEqual(findInjuryMentions("miałem operację prawego barku"), [{ part: "shoulder_right", severity: "low" }]);
  assert.deepEqual(findInjuryMentions("boli mnie w krzyżu"), [{ part: "lower_back", severity: "medium" }]);
  assert.deepEqual(findInjuryMentions("boli mnie kolano"), [], "bez strony dopytuje model");
  assert.deepEqual(findInjuryMentions("chcę wzmocnić mięśnie dwugłowe uda"), [], "cel treningu to nie uraz");
  assert.deepEqual(findInjuryMentions("lewe kolano już nie boli"), []);
  assert.deepEqual(findInjuryMentions("Zrobiłem 8 powtórzeń"), []);
});

async function session(replies, { stored = [] } = {}) {
  const reports = [];
  const store = { report: async (report) => { reports.push(report); return true; } };
  const llm = { streamChat: (args) => fakeLlm(replies.shift() || "OK.").streamChat(args) };
  const coach = createCoach({ voiceId: "v", catalog: buildCatalog(), engine, injuries: store });
  const live = await liveSession({ llm, coach });
  live.session.coachState = coach.createState({ injuries: stored });
  const say = async (text) => { await runTurn(live.session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  return { ...live, say, reports };
}

test("Zapas: model nie dopisał znacznika — kontuzja i tak zapisana, a plan ją omija", async () => {
  const { session: live, say, reports, events } = await session([
    "Super, popracujemy nad stabilizacją.",
    "Dobrze! [PLAN goal=general level=intermediate equipment=gym minutes=45]",
  ]);
  await say("Chcę dzisiaj potrenować stabilizację na moim kontuzjowanym lewym kolanie.");
  assert.deepEqual(reports.map(({ bodyPart, severity }) => ({ bodyPart, severity })), [{ bodyPart: "knee_left", severity: "low" }]);
  assert.ok(events.some((event) => event.stage === "injury_saved" && event.part === "knee_left"));
  await say("45 minut, siłownia.");
  const catalog = buildCatalog();
  assert.ok(live.coachState.plan.exercises.every((item) => !catalog.get(item.id).hard.includes("knee_left")));
  live.coachState.runner.stop();
  await endSession(live);
});

test("Bez duplikatów: ta sama partia drugi raz — bez zapisu; mocniej boli — zapis z nowym nasileniem", async () => {
  const { session: live, say, reports, events } = await session([
    "Rozumiem. [PAIN part=knee_left severity=medium]",
    "Rozumiem. [PAIN part=knee_left severity=medium]",
    "Ojej. [PAIN part=knee_left severity=high]",
  ]);
  await say("Boli mnie lewe kolano.");
  await say("Dalej boli mnie lewe kolano.");
  await say("Teraz boli mnie bardzo mocno lewe kolano!");
  await tick();
  assert.deepEqual(reports.map((report) => report.severity), ["medium", "high"]);
  assert.deepEqual(events.filter((event) => event.stage === "injury_saved").map((event) => event.saved), [true, "known", true]);
  await endSession(live);
});

test("Bez duplikatów: kontuzja aktywna w bazie od poprzedniej sesji nie jest zapisywana jeszcze raz", async () => {
  const { session: live, say, reports } = await session(
    ["Pamiętam o kolanie."],
    { stored: [{ body_part: "knee_left", severity: "medium", note: "po biegu" }] },
  );
  await say("Pamiętaj, że mam kontuzjowane lewe kolano.");
  assert.deepEqual(reports, []);
  await endSession(live);
});
