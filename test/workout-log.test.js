// The workout journal (src/coach/workout-log.js) and the summary at the end:
// one row per session, upserted on every change so any ending keeps the
// work done, writes in order, the previous workout back in the next prompt.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createWorkoutLog } = require("../src/coach/workout-log");
const { summary } = require("../src/coach/workout");
const { createCoach } = require("../src/coach");
const { buildCatalog } = require("../src/coach/exercises");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const quiet = { warn() {} };

test("Podsumowanie: polska odmiana ćwiczeń, serii i powtórzeń", () => {
  assert.equal(summary([]), "Na dziś kończymy.");
  assert.equal(summary([{ id: "a", reps: 1 }]), "Trening zrobiony: 1 ćwiczenie, 1 seria, razem 1 powtórzenie. Świetna robota!");
  const sets = [
    ...Array.from({ length: 4 }, () => ({ id: "a", reps: 10 })),
    ...Array.from({ length: 8 }, () => ({ id: "b", reps: 10 })),
    { id: "c", reps: null, seconds: 30 },
  ];
  assert.equal(summary(sets), "Trening zrobiony: 3 ćwiczenia, 13 serii, razem 120 powtórzeń. Świetna robota!");
});

test("Dziennik: bez SUPABASE_* go nie ma; upsert po session_id, zapisy po kolei; odczyt ostatniego", async () => {
  assert.equal(createWorkoutLog({ userId: "x" }), null);
  const calls = [];
  let release;
  const slowFirst = new Promise((resolve) => { release = resolve; });
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (calls.length === 1) await slowFirst;
    if (url.includes("select=")) return new Response('[{"started_at":"2026-10-27T10:00:00Z","finished":true,"exercises":[],"sets":[]}]');
    return new Response("", { status: 201 });
  };
  const journal = createWorkoutLog({ url: "https://db.example", serviceKey: "k", userId: "u1", fetchImpl, log: quiet });

  const first = journal.save({ sessionId: "s1", startedAt: "t", finished: false, profile: {}, exercises: [], sets: [], changes: [] });
  const second = journal.save({ sessionId: "s1", startedAt: "t", finished: true, profile: {}, exercises: [], sets: [{ id: "a" }], changes: [] });
  await tick();
  assert.equal(calls.length, 1, "drugi zapis czeka na pierwszy");
  release();
  await Promise.all([first, second]);
  assert.equal(calls[0].url, "https://db.example/rest/v1/workout_sessions?on_conflict=session_id");
  assert.deepEqual(calls.map((call) => call.body[0].finished), [false, true]);
  assert.equal(calls[1].body[0].user_id, "u1");

  assert.equal((await journal.recent())[0].finished, true);
  assert.match(calls[2].url, /workout_sessions\?user_id=eq\.u1&.*order=started_at\.desc&limit=5$/);
});

test("Rozmowa: dziennik dostaje plan, serie, zmiany i koniec; poprzedni trening trafia do promptu", async () => {
  const rows = [];
  const workoutLog = { save: (entry) => rows.push(JSON.parse(JSON.stringify(entry))) };
  const calls = [];
  const replies = ["Cześć!", "Dobrze! [PLAN goal=general level=beginner equipment=bodyweight minutes=10]", "Ok. [SKIP]"];
  const llm = { streamChat: (args) => { calls.push(args.messages); return fakeLlm(replies.shift() || "OK.").streamChat(args); } };
  const coach = createCoach({ voiceId: "v", catalog: buildCatalog(), engine, workoutLog });
  const { session, events } = await liveSession({ llm, coach });
  session.coachState = coach.createState({
    history: [{ started_at: "2026-10-27T10:00:00Z", finished: false, exercises: [{ name: "pompki", sets: 3 }], sets: [{ id: "Pushups" }] }],
  });
  const say = async (text) => { await runTurn(session, text); for (let i = 0; i < 12; i += 1) await tick(); };

  await say("Hej.");
  assert.equal(calls[0][1].content, "Poprzedni trening (2026-10-27): pompki; zrobione serie: 1 z 3, nieukończony. Możesz krótko do niego nawiązać.");

  await say("Dziesięć minut, bez sprzętu.");
  const exercises = session.coachState.plan.exercises.length;
  assert.equal(exercises, 2, "10 minut to dwa ćwiczenia");
  await say("gotowe");
  await say("gotowe");
  await say("zrobiłem 9");
  await say("Pomińmy resztę tego ćwiczenia.");
  // Each set but the last: "gotowe" ends it, a second one skips the rest.
  for (let step = 0; step < 2 * session.coachState.plan.exercises[1].sets - 1; step += 1) await say("gotowe");

  const last = rows.at(-1);
  assert.equal(last.sessionId, session.id);
  assert.equal(last.finished, true);
  assert.equal(last.sets[0].reps, 9);
  assert.equal(last.sets.length, 1 + session.coachState.plan.exercises[1].sets);
  assert.deepEqual(last.changes.map((change) => change.type), ["workout.skipped"]);
  assert.ok(rows.length >= 5, "zapis po każdej zmianie, nie tylko na końcu");
  const spoken = events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  assert.match(spoken.at(-1), /^Trening zrobiony: 2 ćwiczenia, \d+ serie, razem \d+ powtórzeń\. Świetna robota!$/);
  session.coachState.runner.stop();
  await endSession(session);
});
