// Pain and injuries: the Supabase store (src/coach/injury-store.js) on a fake
// fetch, and the coach — [PAIN ...] stops the exercise at once, the rest of
// the plan leaves the body part alone, the report is saved for next time, and
// injuries from earlier sessions shape the plan and the prompt.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createInjuryStore } = require("../src/coach/injury-store");
const { advanceIntent } = require("../src/coach/workout");
const { createCoach } = require("../src/coach");
const { buildCatalog } = require("../src/coach/exercises");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const catalog = buildCatalog();
const quiet = { warn() {} };

function fakeSupabase(respond = () => new Response("[]", { status: 200 })) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options, body: options.body ? JSON.parse(options.body) : undefined });
    return respond(url, options);
  };
  return { calls, store: createInjuryStore({ url: "https://db.example/", serviceKey: "key", userId: "u 1", fetchImpl, log: quiet }) };
}

test("Magazyn: bez SUPABASE_* nie ma magazynu", () => {
  assert.equal(createInjuryStore({ url: "", serviceKey: "", userId: "x" }), null);
});

test("Magazyn: odczyt aktywnych kontuzji użytkownika i zapis z upsertem po partii ciała", async () => {
  const { calls, store } = fakeSupabase((url) => new Response(url.includes("select=") ? '[{"body_part":"knee_left","severity":"medium","note":"boli"}]' : "", { status: url.includes("select=") ? 200 : 201 }));

  assert.deepEqual(await store.active(), [{ body_part: "knee_left", severity: "medium", note: "boli" }]);
  assert.equal(calls[0].url, "https://db.example/rest/v1/user_injuries?user_id=eq.u%201&status=eq.active&select=body_part,severity,note&order=reported_at.desc");
  assert.equal(calls[0].headers.Authorization, "Bearer key");

  assert.equal(await store.report({ bodyPart: "shoulder_right", severity: "huge", note: "x".repeat(500), sessionId: "s1" }), true);
  const write = calls[1];
  assert.equal(write.method, "POST");
  assert.equal(write.url, "https://db.example/rest/v1/user_injuries?on_conflict=user_id,body_part");
  assert.match(write.headers.Prefer, /resolution=merge-duplicates/);
  assert.equal(write.body[0].user_id, "u 1");
  assert.equal(write.body[0].body_part, "shoulder_right");
  assert.equal(write.body[0].severity, null, "spoza listy → null");
  assert.equal(write.body[0].note.length, 300);
  assert.equal(write.body[0].resolved_at, null);
});

test("Magazyn: awaria bazy nie zatrzymuje sesji — pusty odczyt, nieudany zapis", async () => {
  const { store } = fakeSupabase(() => new Response("down", { status: 503 }));
  assert.deepEqual(await store.active(), []);
  assert.equal(await store.report({ bodyPart: "neck" }), false);
});

test("„Boli mnie kolano, gotowe” to zgłoszenie bólu, nie koniec serii", () => {
  assert.equal(advanceIntent("boli mnie kolano, gotowe"), null);
  assert.equal(advanceIntent("kłuje w barku, dalej"), null);
});

async function painSession(replies, { setup = {} } = {}) {
  const reports = [];
  const store = { report: async (report) => { reports.push(report); return true; } };
  const llm = { streamChat: (args) => fakeLlm(replies.shift() || "OK.").streamChat(args) };
  const coach = createCoach({ voiceId: "v", catalog, engine, injuries: store });
  const { session, events } = await liveSession({ llm, coach });
  session.coachState = coach.createState(setup);
  const say = async (text) => { await runTurn(session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const spoken = () => events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  return { session, say, spoken, reports, events };
}

const loadsKnee = (item) => catalog.get(item.id).loads.includes("knee_right");

test("Ból w trakcie serii: przerwanie, zamiennik bez obciążania kolana, reszta planu też, zapis z wypowiedzią", async () => {
  const { session, say, spoken, reports } = await painSession([
    "Dobrze! [PLAN goal=muscle level=intermediate equipment=gym minutes=60]",
    "Rozumiem, nie forsujemy. [PAIN part=knee_right severity=medium]",
  ]);
  await say("Godzina, siłownia.");
  await say("gotowe");
  await say("gotowe");
  const first = session.coachState.plan.exercises[0];
  assert.ok(loadsKnee(first), "zaczynamy od nóg");

  await say("Boli mnie prawe kolano przy schodzeniu.");
  const { plan, avoid, injuries } = session.coachState;
  assert.ok(!plan.exercises.some(loadsKnee), plan.exercises.map((item) => item.id).join(", "));
  assert.deepEqual(avoid, [{ part: "knee_right", severity: "medium" }]);
  assert.equal(injuries[0].body_part, "knee_right");
  assert.equal(spoken().at(-2), "Rozumiem, nie forsujemy.");
  assert.match(spoken().at(-1), new RegExp(`^Przerywamy, nie obciążamy: prawe kolano\\. Zmieniamy: zamiast ${first.name} robimy`));
  assert.deepEqual(reports, [{ bodyPart: "knee_right", severity: "medium", note: "Boli mnie prawe kolano przy schodzeniu.", sessionId: session.id }]);
  session.coachState.runner.stop();
  await endSession(session);
});

test("Ostry ból: ta sama zmiana plus rada, żeby dziś skończyć", async () => {
  const { session, say, spoken } = await painSession([
    "Dobrze! [PLAN goal=muscle level=intermediate equipment=gym minutes=60]",
    "Stop. [PAIN part=knee_left severity=high]",
  ]);
  await say("Godzina, siłownia.");
  await say("gotowe");
  await say("gotowe");
  await say("Bardzo mnie zakłuło w lewym kolanie!");
  assert.match(spoken().at(-1), /Przy ostrym bólu lepiej dziś skończyć: powiedz „kończymy”/);
  session.coachState.runner.stop();
  await endSession(session);
});

test("Kontuzja z wywiadu: zapisana, a plan od razu ją omija", async () => {
  const { session, say, reports } = await painSession([
    "Dobrze, uważamy na bark. [PAIN part=shoulder_left severity=low]",
    "Super! [PLAN goal=strength level=intermediate equipment=gym minutes=45]",
  ]);
  await say("Kiedyś naderwałem lewy bark.");
  await say("45 minut na siłowni, siła.");
  assert.equal(reports[0].bodyPart, "shoulder_left");
  // Mild pain: only exercises hard on the shoulder are out (soft ones like rows may stay).
  assert.ok(session.coachState.plan.exercises.every((item) => !catalog.get(item.id).hard.includes("shoulder_left")));
  session.coachState.runner.stop();
  await endSession(session);
});

test("Kontuzje z poprzednich sesji: w prompcie i w filtrze planu; „już nie boli” zapisuje status resolved", async () => {
  const calls = [];
  const replies = ["Jak kolano? ", "Super! [PLAN goal=muscle level=intermediate equipment=gym minutes=45]", "Świetnie. [PAIN_RESOLVED part=knee_left]"];
  const reports = [];
  const coach = createCoach({ voiceId: "v", catalog, engine, injuries: { report: async (report) => { reports.push(report); return true; } } });
  const llm = { streamChat: (args) => { calls.push(args.messages); return fakeLlm(replies.shift() || "OK.").streamChat(args); } };
  const { session } = await liveSession({ llm, coach });
  session.coachState = coach.createState({ injuries: [{ body_part: "knee_left", severity: "medium", note: "po biegu" }, { body_part: "made_up" }] });
  const say = async (text) => { await runTurn(session, text); for (let i = 0; i < 12; i += 1) await tick(); };

  await say("Cześć.");
  assert.equal(calls[0][1].content, "Zgłoszone dolegliwości (aktywne): lewe kolano (medium): „po biegu”. Plan omija ćwiczenia obciążające te miejsca. Na początku zapytaj krótko, jak się teraz czują.");
  await say("45 minut, siłownia, masa.");
  assert.ok(session.coachState.plan.exercises.every((item) => !catalog.get(item.id).loads.includes("knee_left")));

  await say("Kolano już nie boli.");
  assert.deepEqual(reports, [{ bodyPart: "knee_left", status: "resolved", sessionId: session.id }]);
  assert.deepEqual(session.coachState.injuries, []);
  session.coachState.runner.stop();
  await endSession(session);
});

test("Znacznik bólu z partią spoza listy jest pomijany", async () => {
  const { session, say, reports } = await painSession(["Hmm. [PAIN part=brzuch severity=low]"]);
  await say("Brzuch mnie boli.");
  assert.deepEqual(reports, []);
  assert.deepEqual(session.coachState.injuries, []);
  await endSession(session);
});

test("Ból, który nie zmienia planu: trener mówi, że zapamiętał; strona dostaje wynik zapisu", async () => {
  const { session, say, spoken, events } = await painSession([
    "Dobrze! [PLAN goal=general level=intermediate equipment=bodyweight minutes=15]",
    "Rozumiem. [PAIN part=neck severity=low]",
  ]);
  await say("15 minut bez sprzętu.");
  await say("gotowe");
  await say("gotowe");
  await say("Trochę ciągnie mnie szyja.");
  assert.equal(spoken().at(-1), "Zapamiętałem: szyja. Kolejne ćwiczenia nie obciążają tego miejsca, możemy kontynuować.");
  await tick();
  assert.deepEqual(events.filter((event) => event.stage === "injury_saved").map(({ part, saved }) => ({ part, saved })), [{ part: "neck", saved: true }]);
  session.coachState.runner.stop();
  await endSession(session);
});
