// Fixes after the first manual tests (2026-10-28):
// - "5 minut" left the session without a plan; a rejected marker now asks again;
// - "Gotowo", "Dobra zrubiona pierwsza serja" did not end the set, so the model
//   made up the next announcement and the plan and the speech drifted apart;
// - pain that changed nothing in the plan got no answer from the app;
// - Supabase settings: the key name from yoga-startup, a publishable key, a URL with /rest/v1.

const test = require("node:test");
const assert = require("node:assert/strict");

const { advanceIntent } = require("../src/coach/workout");
const { checkSupabaseEnv, explainSupabaseError, createSupabase } = require("../src/coach/supabase");
const { createCoach } = require("../src/coach");
const { buildCatalog } = require("../src/coach/exercises");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

test("Koniec serii: słowa przekręcone przez Whispera też działają, pytania nadal nie", () => {
  for (const text of ["Gotowo.", "Gotowa.", "Dobra zrubiona pierwsza serja.", "Dobrze, zrobiłem.", "skończone"]) {
    assert.ok(advanceIntent(text), text);
  }
  for (const text of ["Zrobimy to razem?", "Co teraz robimy?", "Nie jestem gotowy."]) {
    assert.equal(advanceIntent(text), null, text);
  }
});

async function session(replies) {
  const llm = { streamChat: (args) => fakeLlm(replies.shift() || "OK.").streamChat(args) };
  const coach = createCoach({ voiceId: "v", catalog: buildCatalog(), engine, injuries: { report: async () => true } });
  const live = await liveSession({ llm, coach });
  const say = async (text) => { await runTurn(live.session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const spoken = () => live.events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  return { ...live, say, spoken };
}

test("Plan: „5 minut” daje najkrótszy plan; błędny znacznik — trener prosi o powtórzenie zamiast milczeć", async () => {
  const short = await session(["Dobrze! [PLAN goal=muscle level=beginner equipment=gym minutes=5]"]);
  await short.say("5 minut.");
  assert.equal(short.session.coachState.plan.profile.minutes, 10);
  short.session.coachState.runner.stop();
  await endSession(short.session);

  const broken = await session(["Dobrze! [PLAN goal=muscle level=beginner equipment=gimnastic minutes=20]"]);
  await broken.say("20 minut.");
  assert.equal(broken.session.coachState.plan, null);
  assert.match(broken.spoken().at(-1), /^Nie udało mi się ułożyć planu\. Powiedz jeszcze raz/);
  await endSession(broken.session);
});

test("Ból, który nie zmienia planu: trener mówi, że zapamiętał i można kontynuować", async () => {
  const { session: live, say, spoken } = await session([
    "Dobrze! [PLAN goal=general level=intermediate equipment=bodyweight minutes=15]",
    "Rozumiem. [PAIN part=ankle_left severity=low]",
  ]);
  await say("15 minut bez sprzętu.");
  await say("gotowe");
  await say("gotowe");
  live.coachState.plan.exercises.splice(1); // only the current exercise is left, then the change is about nothing ahead
  live.coachState.runner.advance();
  live.coachState.plan.exercises[0] = { ...live.coachState.plan.exercises[0], id: "Pushups", name: "pompki", pattern: "horizontal_push" };
  await say("Trochę boli mnie lewa kostka.");
  assert.equal(spoken().at(-1), "Zapamiętałem: lewa kostka. Kolejne ćwiczenia nie obciążają tego miejsca, możemy kontynuować.");
  live.coachState.runner.stop();
  await endSession(live);
});

test("Supabase: nazwa klucza z jogi działa, publishable i anon nie, /rest/v1 w adresie nie psuje zapytań", async () => {
  assert.deepEqual(checkSupabaseEnv({ SUPABASE_URL: "https://a.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_abc", GYM_COACH_USER_ID: "b" }).problems, []);
  const anon = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.sig`;
  const texts = (env) => checkSupabaseEnv({ SUPABASE_URL: "https://a.supabase.co", GYM_COACH_USER_ID: "b", ...env }).problems.map((problem) => problem.text).join(" ");
  assert.match(texts({ SUPABASE_SECRET_KEY: "sb_publishable_abc" }), /publishable/);
  assert.match(texts({ SUPABASE_SERVICE_ROLE_KEY: anon }), /rolą „anon”/);
  assert.match(texts({ SUPABASE_KEY: "sb_secret_abc" }), /pod nazwą, której serwer nie czyta/);
  assert.match(texts({ SUPABASE_SECRET_KEY: "sb_secret_abc", SUPABASE_URL: "https://a.supabase.co/project/x" }), /ma ścieżkę/);

  assert.match(explainSupabaseError(404, '{"code":"PGRST205","message":"Could not find the table public.user_injuries"}'), /uruchom migracje/);
  assert.match(explainSupabaseError(401, '{"message":"Invalid API key"}'), /nie przyjmuje klucza/);

  const urls = [];
  const client = createSupabase({ url: "https://a.supabase.co/rest/v1/", serviceKey: "k", fetchImpl: async (url) => { urls.push(url); return new Response("[]"); } });
  await client.request("user_injuries");
  assert.deepEqual(urls, ["https://a.supabase.co/rest/v1/user_injuries"]);
});
