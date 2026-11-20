// The equipment the user said wins over the marker (src/coach/equipment-mentions.js):
// the model once wrote home_dumbbells after "trenuję na siłowni".

const test = require("node:test");
const assert = require("node:assert/strict");

const { equipmentFromWords } = require("../src/coach/equipment-mentions");
const { createCoach } = require("../src/coach");
const { buildCatalog } = require("../src/coach/exercises");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const catalog = buildCatalog();

test("Sprzęt ze słów: jedno miejsce wygrywa, dwa albo żadne — decyduje model", () => {
  assert.equal(equipmentFromWords(["Trenuję na siłowni od roku."]), "gym");
  assert.equal(equipmentFromWords(["chodzę na siłkę"]), "gym");
  assert.equal(equipmentFromWords(["Ćwiczę w domu, mam hantle."]), "home_dumbbells");
  assert.equal(equipmentFromWords(["Nie mam nic, bez sprzętu."]), "bodyweight");
  assert.equal(equipmentFromWords(["Na siłowni, ale czasem w domu."]), null);
  assert.equal(equipmentFromWords(["Nie będę nic robił na siłę."]), null);
  assert.equal(equipmentFromWords(["Mam hantle."]), null);
});

async function talk(replies, setup) {
  const llm = { streamChat: (args) => fakeLlm(replies.shift() || "OK.").streamChat(args) };
  const coach = createCoach({ voiceId: "v", catalog, engine });
  const live = await liveSession({ llm, coach });
  live.session.coachState = coach.createState(setup);
  const say = async (text) => { await runTurn(live.session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const spoken = () => live.events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  return { ...live, say, spoken };
}

test("Wywiad: „trenuję na siłowni”, a znacznik mówi dom — podsumowanie i plan na siłownię", async () => {
  const { session, say, spoken } = await talk([
    "Ile dni w tygodniu?",
    "Mam wszystko. [PROFILE goal=muscle level=intermediate equipment=home_dumbbells days=3 minutes=60]",
  ], { mode: "interview" });
  await say("Chcę masy, trenuję na siłowni od dwóch lat.");
  await say("Trzy dni po godzinie.");
  assert.match(spoken().at(-1), /poziom średniozaawansowany, siłownia, 3 treningi/);
  await say("Tak.");
  assert.equal(session.coachState.weekPlan.profile.equipment, "gym");
  await endSession(session);
});

test("Jeden trening: [PLAN] z equipment=home_dumbbells po „na siłce” — siłownia", async () => {
  const { session, say, spoken } = await talk([
    "Dobrze. [PLAN goal=strength level=intermediate equipment=home_dumbbells minutes=45]",
  ], {});
  await say("Siła, średnio zaawansowany, jestem na siłce, 45 minut.");
  assert.match(spoken().at(-1), /siłownia, 45 minut/);
  assert.equal(session.coachState.pendingProfile.equipment, "gym");
  await endSession(session);
});
