// The weekly plan (src/coach/week-plan.js): split and days by the coaching
// rules, other exercises on the second day of a type, no other muscles on a
// split day, rest by intensity and exercise type, priority muscles first with
// a set more, weekly volume within the level's range, injuries respected; the
// day for today and the workout from it (progression, deload, new injury).

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCatalog } = require("../src/coach/exercises");
const { focusOf } = require("../src/coach/planner");
const { weeklyVolume } = require("../src/coach/programming");
const { buildWeekPlan, planFromDay, dayFor, weekdayOf, describeWeek } = require("../src/coach/week-plan");

const catalog = buildCatalog();
const base = { goal: "muscle", level: "intermediate", equipment: "gym", minutes: 60 };
const ids = (day) => day.exercises.map((item) => item.id);
const timeS = (day) => 300 + day.exercises.reduce((sum, item) => sum + item.sets * (45 + item.restS), 0);

test("Tydzień 4 dni: góra/dół w rozłożone dni, drugi dzień góry z innymi ćwiczeniami, mieści się w czasie", () => {
  const plan = buildWeekPlan(catalog, { ...base, daysPerWeek: 4 });
  assert.equal(plan.split, "upper_lower");
  assert.equal(plan.intensity, "moderate");
  assert.deepEqual(plan.days.map((day) => `${day.weekday}:${day.type}`), ["mon:upper", "tue:lower", "thu:upper", "fri:lower"]);
  assert.deepEqual(plan.conflicts, []);
  const [upperA, , upperB] = plan.days;
  assert.ok(ids(upperA).every((id) => !ids(upperB).includes(id)), "drugi dzień góry — inne ćwiczenia");
  for (const day of plan.days) assert.ok(timeS(day) <= 60 * 60, `${day.type}: ${timeS(day)} s`);
  for (const item of plan.days.flatMap((day) => day.exercises)) {
    assert.equal(item.restS, catalog.get(item.id).mechanic === "isolation" ? 75 : 120, item.name);
    assert.equal(item.kg, undefined, "ciężar ustala progresja w dniu treningu");
  }
  const volume = weeklyVolume(plan.days, catalog);
  for (const group of ["chest", "back", "quads", "posterior"]) assert.ok(volume[group] >= 10 && volume[group] <= 15, `${group}: ${volume[group]}`);
});

test("Dzień splitu: na pull same plecy i biceps, bez przysiadu na dopełnienie", () => {
  const pull = focusOf("pull").muscles;
  for (const equipment of ["gym", "home_dumbbells"]) {
    const plan = buildWeekPlan(catalog, { ...base, equipment, daysPerWeek: 6 });
    assert.equal(plan.split, "push_pull_legs");
    for (const day of plan.days.filter((candidate) => candidate.type === "pull")) {
      assert.ok(day.exercises.length >= 2);
      assert.ok(day.exercises.every((item) => catalog.get(item.id).primaryMuscles.some((muscle) => pull.includes(muscle))), `${equipment}: ${day.exercises.map((item) => item.name)}`);
    }
  }
});

test("Priorytet klatki: ćwiczenia na klatkę pierwsze i z serią więcej", () => {
  const plan = buildWeekPlan(catalog, { ...base, daysPerWeek: 4, priorities: ["chest"] });
  const upper = plan.days[0];
  assert.ok(upper.exercises[0].priority);
  assert.ok(catalog.get(upper.exercises[0].id).primaryMuscles.includes("chest"));
  assert.equal(upper.exercises[0].sets, 4);
});

test("Początkujący: najwyżej 4 dni, siła zaczyna od umiarkowanej, bez 5 serii", () => {
  const plan = buildWeekPlan(catalog, { ...base, goal: "strength", level: "beginner", minutes: 45, daysPerWeek: 6 });
  assert.equal(plan.days.length, 4);
  assert.equal(plan.intensity, "moderate");
  assert.ok(plan.days.flatMap((day) => day.exercises).every((item) => item.sets <= 4 && (item.seconds || item.reps >= 8)));
  const heavy = buildWeekPlan(catalog, { ...base, goal: "strength", daysPerWeek: 3 });
  assert.equal(heavy.intensity, "heavy");
  assert.ok(heavy.days[0].exercises.every((item) => item.reps === 5 && [180, 90].includes(item.restS)));
});

test("Własne dni i regeneracja: full body pon–wt–śr ma konflikt i ostrzeżenie w zapowiedzi", () => {
  const plan = buildWeekPlan(catalog, { ...base, daysPerWeek: 3, weekdays: ["mon", "tue", "wed"] });
  assert.equal(plan.split, "full_body");
  assert.deepEqual(plan.days.map((day) => day.weekday), ["mon", "tue", "wed"]);
  assert.ok(plan.conflicts.length >= 2);
  const text = describeWeek(plan);
  assert.match(text, /^Gotowe\. Twój plan to full body, 3 treningi w tygodniu, intensywność umiarkowana: poniedziałek — całe ciało, wtorek — całe ciało, środa — całe ciało\. Uwaga: .*48 godzinach/);
  assert.doesNotMatch(describeWeek(buildWeekPlan(catalog, { ...base, daysPerWeek: 3 })), /Uwaga/);
});

test("Kontuzja kolana: w żadnym dniu nic, co obciąża kolano", () => {
  const plan = buildWeekPlan(catalog, { ...base, daysPerWeek: 4 }, { avoid: [{ part: "knee_left", severity: "high" }] });
  for (const item of plan.days.flatMap((day) => day.exercises)) assert.ok(!catalog.get(item.id).loads.includes("knee_left"), item.name);
});

test("Dzień na dziś: zaplanowany albo następny w tygodniu, po niedzieli od początku", () => {
  const plan = buildWeekPlan(catalog, { ...base, daysPerWeek: 4 });
  assert.deepEqual(dayFor(plan, "thu"), { day: plan.days[2], index: 2, planned: true });
  assert.equal(dayFor(plan, "wed").index, 2);
  assert.equal(dayFor(plan, "wed").planned, false);
  assert.equal(dayFor(plan, "sat").index, 0);
  assert.equal(weekdayOf(new Date("2026-10-28T12:00:00")), "wed");
});

test("Trening z dnia planu: progresja z dziennika, lżejszy 5. tydzień, nowa kontuzja wymienia ćwiczenie", () => {
  const plan = { ...buildWeekPlan(catalog, { ...base, daysPerWeek: 4 }), startedAt: "2026-10-05T08:00:00Z" };
  const lower = plan.days[1];
  const first = lower.exercises[0];
  const history = [{ started_at: "2026-10-20T08:00:00Z", exercises: [first], sets: Array.from({ length: first.sets }, () => ({ id: first.id, reps: first.reps, kg: 60 })) }];

  const today = planFromDay(catalog, plan, lower, { history, now: Date.parse("2026-10-21T08:00:00Z") });
  assert.equal(today.deload, false);
  assert.equal(today.exercises[0].kg, 62.5);
  assert.equal(today.exercises[0].sets, first.sets);
  assert.equal(today.profile.focus, "legs");
  assert.deepEqual(today.day, { weekday: "tue", type: "lower" });

  const deload = planFromDay(catalog, plan, lower, { history, now: Date.parse("2026-11-03T08:00:00Z") });
  assert.equal(deload.deload, true);
  assert.equal(deload.exercises[0].kg, 60, "w tygodniu lżejszym bez podnoszenia ciężaru");
  assert.equal(deload.exercises[0].sets, 2);

  const sore = planFromDay(catalog, plan, lower, { avoid: [{ part: "knee_left", severity: "high" }], now: Date.parse("2026-10-21T08:00:00Z") });
  assert.ok(sore.exercises.length > 0);
  assert.ok(sore.exercises.every((item) => !catalog.get(item.id).loads.includes("knee_left")), sore.exercises.map((item) => item.name).join(", "));
});
