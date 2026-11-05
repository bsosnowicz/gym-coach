const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/workout/plan-view.js");

const plan = {
  profile: { goal: "strength", level: "intermediate", equipment: "gym", minutes: 45, focus: "hamstrings" },
  warmup: { durationS: 300 },
  exercises: [
    { id: "squat", name: "Przysiad", sets: 3, reps: 8, restS: 120, kg: 62.5, progress: "Ostatnio 60 kg i wszystkie powtórzenia — dziś spróbuj 62,5 kg." },
    { id: "plank", name: "Deska", sets: 2, seconds: 40, restS: 60, progress: "Ostatnio cała seria — dziś 40 sekund." },
    { id: "row", name: "Wiosłowanie", sets: 3, reps: 10, restS: 90, kg: 20, progress: "Ostatnio 20 kg — zostajemy przy tym ciężarze." },
  ],
};
const progress = (fields) => ({ phase: "set", exerciseIndex: 0, setIndex: 0, restLeftMs: null, restPaused: false, completed: 0, lastSet: null, ...fields });

test("workoutPhase: interview without a plan, then plan, workout and summary", async () => {
  const { workoutPhase } = await load();
  assert.equal(workoutPhase(null), "interview");
  assert.equal(workoutPhase({ plan: null }), "interview");
  assert.equal(workoutPhase({ plan, progress: progress({ phase: "ready" }) }), "plan");
  assert.equal(workoutPhase({ plan, progress: progress({ phase: "warmup" }) }), "plan");
  for (const phase of ["set", "rest", "ready_set"]) assert.equal(workoutPhase({ plan, progress: progress({ phase }) }), "workout");
  assert.equal(workoutPhase({ plan, progress: progress({ phase: "done" }) }), "summary");
});

test("toPlan: title, focus and warm-up from the profile, states from the position", async () => {
  const { toPlan } = await load();
  const before = toPlan({ plan, progress: progress({ phase: "warmup" }) });
  assert.equal(before.title, "Siła");
  assert.deepEqual(before.focus, ["tył uda"]);
  assert.equal(before.warmup, "~5 min");
  assert.equal(before.warmupState, "todo");
  assert.deepEqual(before.exercises.map((item) => item.state), ["todo", "todo", "todo"]);

  const during = toPlan({ plan, progress: progress({ phase: "rest", exerciseIndex: 1 }) });
  assert.equal(during.warmupState, "done");
  assert.deepEqual(during.exercises.map((item) => item.state), ["done", "current", "todo"]);
  assert.deepEqual(toPlan({ plan, progress: progress({ phase: "done" }) }).exercises.map((item) => item.state), ["done", "done", "done"]);
});

test("progressionBadge: only a step up gets a badge", async () => {
  const { toPlan } = await load();
  const badges = toPlan({ plan, progress: progress({}) }).exercises.map((item) => item.progression);
  assert.deepEqual(badges, ["+2,5 kg", "40 s", undefined]);
});

test("toLive: the current exercise, rest in seconds, the last set of this exercise only", async () => {
  const { toLive } = await load();
  assert.equal(toLive({ plan, progress: progress({ phase: "warmup" }) }), null);
  const live = toLive({ plan, progress: progress({ phase: "rest", setIndex: 1, completed: 1, lastSet: { id: "squat", set: 1, reps: 8, kg: 62.5 } }) }, 84200);
  assert.equal(live.exercise.name, "Przysiad");
  assert.equal(live.phase, "rest");
  assert.equal(live.restLeft, 85);
  assert.equal(live.restTotal, 120);
  assert.deepEqual(live.previous, [{ reps: 8, kg: 62.5 }]);
  assert.equal(live.next.name, "Deska");
  assert.equal(live.doneSets, 1);
  assert.equal(live.totalSets, 8);
  assert.equal(toLive({ plan, progress: progress({ phase: "ready_set" }) }).phase, "ready");
  const nextExercise = toLive({ plan, progress: progress({ exerciseIndex: 1, lastSet: { id: "squat", set: 3, reps: 8, kg: 62.5 } }) }, null);
  assert.deepEqual(nextExercise.previous, []);
});

test("toSummary: Polish date, sets and weights with a decimal comma", async () => {
  const { toSummary } = await load();
  const summary = toSummary({ plan, progress: progress({ phase: "done", completed: 8 }) }, new Date(2026, 10, 4));
  assert.equal(summary.date, "środa, 4 listopada");
  assert.deepEqual(summary.stats.map((stat) => stat.value), ["8", "3", "45"]);
  assert.deepEqual(summary.rows.map((row) => [row.reps, row.kg]), [["3 × 8", "62,5 kg"], ["2 × 40 s", "—"], ["3 × 10", "20 kg"]]);
});
