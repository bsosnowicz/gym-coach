// The interview (src/coach/interview.js and the interview mode of the
// coach): its own prompt with the pain rules, [PROFILE …] read back as a
// summary, "tak" builds the weekly plan in code, which is spoken, sent to
// the calendar and saved (profile + plan, variant A); a correction goes back
// to the model; an earlier profile is confirmed instead of asked again.

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseProfileMarker, describeInterview, weekProfile, INTERVIEW_PROMPT } = require("../src/coach/interview");
const { createCoach, PAIN_RULES } = require("../src/coach");
const { buildCatalog } = require("../src/coach/exercises");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const engine = require("../src/engine");
const { fakeLlm, liveSession, tick } = require("./helpers");

const catalog = buildCatalog();
const FULL = "goal=muscle level=intermediate equipment=gym days=4 minutes=60 weekdays=mon,tue,thu,fri age=31 sex=male height=182 weight=84,5 priorities=chest,made_up";

test("Znacznik profilu: pola obowiązkowe, opcjonalne i odrzucone", () => {
  assert.deepEqual(parseProfileMarker(FULL), {
    goal: "muscle", level: "intermediate", equipment: "gym", daysPerWeek: 4, minutes: 60,
    weekdays: ["mon", "tue", "thu", "fri"], age: 31, sex: "male", heightCm: 182, weightKg: 84.5,
    priorities: ["chest"], intensity: null,
  });
  const minimal = parseProfileMarker("goal=strength level=beginner equipment=home_dumbbells days=3 minutes=5 intensity=light");
  assert.equal(minimal.minutes, 10);
  assert.deepEqual(minimal.weekdays, []);
  assert.equal(minimal.age, null);
  assert.equal(minimal.intensity, "light");
  assert.equal(parseProfileMarker("goal=muscle level=intermediate equipment=gym minutes=60"), null, "bez liczby dni");
  assert.equal(parseProfileMarker("goal=fun level=intermediate equipment=gym days=3 minutes=60"), null);
  assert.equal(parseProfileMarker(FULL.replace("age=31", "age=300")).age, null);
});

test("Podsumowanie wywiadu i ostrożniej po 60. roku życia", () => {
  assert.equal(describeInterview(parseProfileMarker(FULL)),
    "Podsumuję: cel masa mięśniowa, poziom średniozaawansowany, siłownia, 4 treningi w tygodniu "
    + "(poniedziałek, wtorek, czwartek, piątek), po 60 minut, priorytet: klatka piersiowa; 31 lat, 182 cm, 84,5 kg, mężczyzna. "
    + "Układam plan na tydzień?");
  const short = parseProfileMarker("goal=general level=beginner equipment=bodyweight days=2 minutes=30 age=22");
  assert.equal(describeInterview(short), "Podsumuję: cel ogólna sprawność, poziom początkujący, bez sprzętu, 2 treningi w tygodniu, po 30 minut; 22 lata. Układam plan na tydzień?");
  assert.equal(weekProfile({ goal: "strength", age: 64, intensity: null }).intensity, "moderate");
  assert.equal(weekProfile({ goal: "strength", age: 30, intensity: null }).intensity, null);
});

function fakePlans() {
  const saved = { profiles: [], plans: [] };
  return {
    saved,
    saveProfile: async (profile) => { saved.profiles.push(profile); return true; },
    savePlan: async (plan) => { saved.plans.push(plan); return { ...plan, id: "p1", variant: "A", parentId: null, startedAt: "2026-10-28T10:00:00Z" }; },
  };
}

async function interview(replies, { setup = {}, plans = fakePlans() } = {}) {
  const calls = [];
  const llm = { streamChat: (args) => { calls.push(args.messages); return fakeLlm(replies.shift() || "OK.").streamChat(args); } };
  const coach = createCoach({ voiceId: "v", catalog, engine, plans });
  const live = await liveSession({ llm, coach });
  live.session.coachState = coach.createState({ mode: "interview", ...setup });
  const say = async (text) => { await runTurn(live.session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const spoken = () => live.events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  return { ...live, calls, say, spoken, plans, coach };
}

test("Wywiad: znacznik → podsumowanie → „tak” → plan tygodnia powiedziany, w kalendarzu i zapisany", async () => {
  const { session, events, calls, say, spoken, plans, coach } = await interview([
    "Ile dni w tygodniu chcesz trenować?",
    `Dzięki, mam wszystko. [PROFILE ${FULL}]`,
  ]);
  await say("Chcę zbudować masę.");
  assert.equal(calls[0][0].content, `${INTERVIEW_PROMPT}\n${PAIN_RULES}`);
  await say("Cztery dni: poniedziałek, wtorek, czwartek i piątek, godzina, siłownia, 31 lat, 182 cm, 84 i pół kilo, klatka.");
  assert.match(spoken().at(-1), /^Podsumuję: cel masa mięśniowa.*Układam plan na tydzień\?$/);
  assert.equal(session.coachState.weekPlan, null, "bez planu przed zgodą");

  await say("Tak.");
  assert.equal(calls.length, 2, "„tak” bez modelu");
  assert.match(spoken().at(-1), /^Gotowe\. Twój plan to góra \/ dół, 4 treningi w tygodniu, intensywność umiarkowana: poniedziałek — góra, wtorek — dół, czwartek — góra, piątek — dół\./);
  const week = events.filter((event) => event.stage === "week_plan").at(-1);
  assert.equal(week.mode, "interview");
  assert.equal(week.week.days.length, 4);
  assert.equal(plans.saved.profiles[0].weightKg, 84.5);
  assert.equal(plans.saved.plans[0].split, "upper_lower");
  assert.equal(session.coachState.weekPlan.id, "p1", "id z bazy — pod warianty");
  assert.deepEqual(coach.weekEvent(session).week.days, week.week.days);
  await endSession(session);
});

test("Wywiad: poprawka po podsumowaniu idzie do modelu; profil z poprzedniego wywiadu w prompcie", async () => {
  const profile = parseProfileMarker(FULL);
  const { session, calls, say, spoken } = await interview([
    `Jasne. [PROFILE ${FULL}]`,
    `Poprawiam. [PROFILE ${FULL.replace("days=4", "days=3").replace("weekdays=mon,tue,thu,fri ", "")}]`,
  ], { setup: { profile } });
  await say("To samo co ostatnio.");
  assert.match(calls[0][1].content, /^Profil z poprzedniego wywiadu: goal=muscle level=intermediate equipment=gym days=4 minutes=60 weekdays=mon,tue,thu,fri age=31 sex=male height=182 weight=84.5 priorities=chest\./);
  await say("Nie, jednak trzy dni.");
  assert.equal(calls.length, 2);
  assert.match(spoken().at(-1), /3 treningi w tygodniu, po 60 minut/);
  await say("Tak, układaj.");
  assert.equal(session.coachState.weekPlan.split, "full_body");
  await endSession(session);
});

test("Wywiad: kontuzja kolana z wywiadu omija kolano w całym tygodniu, bez zapisu bez bazy", async () => {
  const { session, say } = await interview([
    "Rozumiem, uważamy na kolano. [PAIN part=knee_left severity=medium]",
    `Mam wszystko. [PROFILE ${FULL}]`,
  ], { plans: null });
  await say("Mam kontuzję lewego kolana.");
  await say("Reszta jak mówiłem.");
  await say("Tak.");
  const exercises = session.coachState.weekPlan.days.flatMap((day) => day.exercises);
  assert.ok(exercises.every((item) => !catalog.get(item.id).loads.includes("knee_left")));
  assert.equal(session.coachState.weekPlan.id, null);
  await endSession(session);
});
