// Coaching rules for a week (src/coach/programming.js): the split follows the
// days and the level, the same muscles rest 48 h, intensity sets reps and
// rest, weekly volume per major group, and every 5th week is a deload.

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCatalog } = require("../src/coach/exercises");
const {
  chooseSplit, weekDays, chooseWeekdays, recoveryConflicts, intensityFor, restFor,
  weeklyVolume, weekOfPlan, isDeloadWeek, deloadSets,
} = require("../src/coach/programming");

test("Split: dni i poziom wybierają układ; początkujący najwyżej 4 dni", () => {
  assert.deepEqual(chooseSplit({ daysPerWeek: 2, level: "beginner" }), { split: "full_body", days: 2 });
  assert.deepEqual(chooseSplit({ daysPerWeek: 3, level: "beginner" }), { split: "full_body", days: 3 });
  assert.deepEqual(chooseSplit({ daysPerWeek: 6, level: "beginner" }), { split: "upper_lower", days: 4 });
  assert.deepEqual(chooseSplit({ daysPerWeek: 3, level: "intermediate" }), { split: "full_body", days: 3 });
  assert.deepEqual(chooseSplit({ daysPerWeek: 3, level: "expert" }), { split: "push_pull_legs", days: 3 });
  assert.deepEqual(chooseSplit({ daysPerWeek: 4, level: "intermediate" }), { split: "upper_lower", days: 4 });
  assert.deepEqual(chooseSplit({ daysPerWeek: 5, level: "intermediate" }), { split: "ppl_upper_lower", days: 5 });
  assert.deepEqual(chooseSplit({ daysPerWeek: 5, level: "expert" }), { split: "body_part", days: 5 });
  assert.deepEqual(chooseSplit({ daysPerWeek: 6, level: "intermediate" }), { split: "push_pull_legs", days: 6 });
  assert.deepEqual(chooseSplit({ daysPerWeek: 9, level: "expert" }), { split: "push_pull_legs", days: 6 });
  assert.deepEqual(chooseSplit({ daysPerWeek: 1, level: "intermediate" }), { split: "full_body", days: 2 });
});

test("Tydzień: dni splitu się powtarzają", () => {
  assert.deepEqual(weekDays("upper_lower", 4), ["upper", "lower", "upper", "lower"]);
  assert.deepEqual(weekDays("push_pull_legs", 6), ["push", "pull", "legs", "push", "pull", "legs"]);
  assert.deepEqual(weekDays("full_body", 3), ["full_body", "full_body", "full_body"]);
});

test("Dni tygodnia: własne, gdy wystarczy, w kolejności tygodnia; inaczej rozłożone", () => {
  assert.deepEqual(chooseWeekdays(3, ["fri", "mon", "wed", "sat"]), ["mon", "wed", "fri"]);
  assert.deepEqual(chooseWeekdays(3, ["mon"]), ["mon", "wed", "fri"]);
  assert.deepEqual(chooseWeekdays(4), ["mon", "tue", "thu", "fri"]);
});

test("Regeneracja 48 h: full body dzień po dniu to konflikt, góra/dół nie", () => {
  const conflicts = recoveryConflicts([{ weekday: "mon", type: "full_body" }, { weekday: "tue", type: "full_body" }]);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].groups, ["legs", "push", "pull"]);
  assert.deepEqual(recoveryConflicts([
    { weekday: "mon", type: "upper" }, { weekday: "tue", type: "lower" },
    { weekday: "thu", type: "upper" }, { weekday: "fri", type: "lower" },
  ]), []);
  assert.deepEqual(recoveryConflicts([{ weekday: "mon", type: "full_body" }, { weekday: "wed", type: "full_body" }]), []);
});

test("Intensywność: cel daje powtórzenia, a przerwa zależy od rodzaju ćwiczenia", () => {
  assert.equal(intensityFor("strength"), "heavy");
  assert.equal(intensityFor("endurance"), "light");
  assert.equal(intensityFor("unknown"), "moderate");
  assert.equal(restFor("heavy", "compound"), 180);
  assert.equal(restFor("heavy", "isolation"), 90);
  assert.equal(restFor("light", undefined), 60);
  assert.ok(restFor("moderate", "isolation") < restFor("moderate", "compound"));
});

test("Objętość: serie tygodniowo na główne partie z katalogu", () => {
  const catalog = buildCatalog();
  const squat = catalog.all.find((exercise) => exercise.primaryMuscles.includes("quadriceps"));
  const bench = catalog.all.find((exercise) => exercise.primaryMuscles.includes("chest"));
  const volume = weeklyVolume([
    { exercises: [{ id: squat.id, sets: 3 }, { id: bench.id, sets: 4 }] },
    { exercises: [{ id: squat.id, sets: 3 }] },
  ], catalog);
  assert.equal(volume.quads, 6);
  assert.equal(volume.chest, 4);
  assert.equal(volume.back, 0);
});

test("Deload: co 5. tydzień planu około 60% serii", () => {
  const start = "2026-10-05T08:00:00Z";
  assert.equal(weekOfPlan(start, Date.parse("2026-10-06T08:00:00Z")), 1);
  assert.equal(weekOfPlan(start, Date.parse("2026-11-03T08:00:00Z")), 5);
  assert.equal(isDeloadWeek(4), false);
  assert.equal(isDeloadWeek(5), true);
  assert.equal(isDeloadWeek(10), true);
  assert.equal(deloadSets(4), 2);
  assert.equal(deloadSets(5), 3);
  assert.equal(deloadSets(3), 2);
});
