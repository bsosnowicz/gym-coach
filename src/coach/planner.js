// The workout plan, built in code from the catalogue (src/coach/exercises.js).
// The model only runs the interview and reports the answers with a marker
// (src/coach/index.js); what the user does today is decided here, so it is the
// same for the same answers and can be tested — as planner.js in yoga-startup.
//
// One full-body session: warm-up, then exercises in slots of movement
// patterns (legs, push, hips, pull, shoulders, core). Each slot takes the
// first exercise that fits the equipment, the gear, the level and the
// injured body parts; a slot with nothing that fits is skipped.

const GOALS = ["strength", "muscle", "endurance", "general"];
const EQUIPMENT_PRESETS = {
  gym: {
    equipment: ["body_only", "dumbbell", "barbell", "kettlebell", "cable", "machine", "band"],
    gear: ["bench", "rack", "pullup_bar", "dip_bars", "box", "ab_wheel"],
  },
  home_dumbbells: { equipment: ["body_only", "dumbbell", "kettlebell", "band"], gear: [] },
  bodyweight: { equipment: ["body_only"], gear: [] },
};

// Sets × reps and the rest between sets, per goal.
const PRESCRIPTIONS = {
  strength: { sets: 4, reps: 5, restS: 150 },
  muscle: { sets: 3, reps: 10, restS: 90 },
  endurance: { sets: 3, reps: 15, restS: 45 },
  general: { sets: 3, reps: 10, restS: 75 },
};
// A beginner does fewer sets and no heavy fives: technique before load.
const BEGINNER = { maxSets: 3, minReps: 8 };
const HOLD_SECONDS = { beginner: 20, intermediate: 30, expert: 45 };
const STATIC_PATTERNS = new Set(["core_static"]);

// In order of importance: a short session keeps the first slots.
const SLOTS = [
  ["squat", "lunge"],
  ["horizontal_push"],
  ["hinge", "hip_extension"],
  ["horizontal_pull", "vertical_pull"],
  ["vertical_push", "shoulder_raise"],
  ["core_static", "core_flexion", "core_rotation"],
  ["lunge", "knee_flexion", "calf_raise"],
  ["elbow_flexion", "elbow_extension"],
];

const WARMUP_S = 300;
// Rough time per set including the change-over, for fitting the session length.
const WORK_PER_SET_S = 45;

function exercisesFor(minutes, prescription) {
  const perExercise = prescription.sets * (WORK_PER_SET_S + prescription.restS);
  const available = Math.max(0, minutes * 60 - WARMUP_S);
  return Math.max(2, Math.min(SLOTS.length, Math.floor(available / perExercise)));
}

function prescriptionFor(goal, level) {
  const base = PRESCRIPTIONS[goal];
  if (level !== "beginner") return { ...base };
  return { ...base, sets: Math.min(base.sets, BEGINNER.maxSets), reps: Math.max(base.reps, BEGINNER.minReps) };
}

// One plan entry: the exercise with the prescription (a hold in seconds for static core work).
function toPlanItem(exercise, { sets, reps, restS }, level) {
  return {
    id: exercise.id,
    name: exercise.name,
    pattern: exercise.pattern,
    sets,
    ...(STATIC_PATTERNS.has(exercise.pattern)
      ? { seconds: HOLD_SECONDS[level] || HOLD_SECONDS.intermediate }
      : { reps: reps || PRESCRIPTIONS.general.reps }),
    restS,
  };
}

// What the catalogue may offer this user: the equipment preset minus what turned
// out to be missing, the injured body parts, the level.
function filtersFor({ equipment, level }, { avoid = [], missing = [] } = {}) {
  const preset = EQUIPMENT_PRESETS[equipment];
  return {
    equipment: preset.equipment.filter((item) => !missing.includes(item)),
    gear: preset.gear.filter((item) => !missing.includes(item)),
    avoid,
    level,
  };
}

// profile: { goal, level, equipment, minutes } from the interview; avoid: injured body parts.
function planWorkout(catalog, { goal, level, equipment, minutes }, { avoid = [] } = {}) {
  if (!GOALS.includes(goal)) throw new Error(`Plan: nieznany cel „${goal}”`);
  if (!EQUIPMENT_PRESETS[equipment]) throw new Error(`Plan: nieznany sprzęt „${equipment}”`);
  const prescription = prescriptionFor(goal, level);
  const filters = filtersFor({ equipment, level }, { avoid });
  const candidates = catalog.available(filters);
  const wanted = exercisesFor(minutes, prescription);

  const chosen = [];
  for (const patterns of SLOTS) {
    if (chosen.length >= wanted) break;
    const pick = candidates
      .filter((exercise) => patterns.includes(exercise.pattern) && !chosen.some((item) => item.id === exercise.id))
      // Within a slot: the slot's first pattern, then compound before isolation.
      .sort((a, b) => patterns.indexOf(a.pattern) - patterns.indexOf(b.pattern)
        || (a.mechanic === "compound" ? 0 : 1) - (b.mechanic === "compound" ? 0 : 1))[0];
    if (pick) chosen.push(pick);
  }

  return {
    profile: { goal, level, equipment, minutes },
    avoid,
    warmup: { durationS: WARMUP_S },
    exercises: chosen.map((exercise) => toPlanItem(exercise, prescription, level)),
  };
}

const SETS_WORD = (n) => (n === 1 ? "seria" : n < 5 ? "serie" : "serii");

// What the coach says once the plan is ready; fixed text, no second model call.
function describePlan(plan) {
  const items = plan.exercises.map((item) =>
    `${item.name}, ${item.sets} ${SETS_WORD(item.sets)} po ${item.reps ? `${item.reps} powtórzeń` : `${item.seconds} sekund`}`);
  return `Mam plan na dziś. Najpierw pięć minut rozgrzewki, potem: ${items.join("; ")}. `
    + "Plan widzisz na ekranie. Powiedz „gotowe”, kiedy zaczynamy rozgrzewkę.";
}

module.exports = { planWorkout, describePlan, toPlanItem, filtersFor, GOALS, EQUIPMENT_PRESETS, PRESCRIPTIONS };
