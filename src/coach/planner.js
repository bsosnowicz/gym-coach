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

// The muscles of free-exercise-db (primaryMuscles), as the marker writes them
// (underscore instead of space), with the name the coach says.
const FOCUS_MUSCLES = {
  abdominals: "brzuch", abductors: "odwodziciele ud", adductors: "przywodziciele ud", biceps: "biceps",
  calves: "łydki", chest: "klatka piersiowa", forearms: "przedramiona", glutes: "pośladki",
  hamstrings: "tył uda", lats: "najszersze grzbietu", lower_back: "dolny odcinek pleców", middle_back: "środek pleców",
  neck: "szyja", quadriceps: "przód uda", shoulders: "barki", traps: "kaptury", triceps: "triceps",
};
// Groups as people say them ("trening nóg", "plecy"): muscles of the source.
const FOCUS_GROUPS = {
  legs: { name: "nogi", muscles: ["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"] },
  back: { name: "plecy", muscles: ["lats", "middle back", "lower back", "traps"] },
  arms: { name: "ramiona", muscles: ["biceps", "triceps", "forearms"] },
  core: { name: "brzuch i core", muscles: ["abdominals", "lower back"] },
};
// What a focus value means: its name and the muscles that count as "on focus".
const focusOf = (focus) => FOCUS_GROUPS[focus] || (FOCUS_MUSCLES[focus] ? { name: FOCUS_MUSCLES[focus], muscles: [focus.replace("_", " ")] } : null);
// The focus takes about two thirds of the plan (at least two exercises): "trening
// nóg" should be mostly legs; the rest keeps the session balanced.
const FOCUS_SHARE = 2 / 3;
const FOCUS_MIN_EXERCISES = 2;
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

const { applyProgression } = require("./progression");

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

// profile: { goal, level, equipment, minutes } from the interview; avoid: injuries,
// body part ids or { part, severity } (src/coach/exercises.js, excludedBy).
// history: earlier workouts from the journal, newest first (progression).
function planWorkout(catalog, { goal, level, equipment, minutes, focus = null }, { avoid = [], history = [] } = {}) {
  if (!GOALS.includes(goal)) throw new Error(`Plan: nieznany cel „${goal}”`);
  if (!EQUIPMENT_PRESETS[equipment]) throw new Error(`Plan: nieznany sprzęt „${equipment}”`);
  const prescription = prescriptionFor(goal, level);
  const filters = filtersFor({ equipment, level }, { avoid });
  const candidates = catalog.available(filters);
  const wanted = exercisesFor(minutes, prescription);

  // Variety like an A/B split: an exercise of the last session gives way to
  // another one of the same slot, so plans alternate — and progression still
  // has a "last time" for each exercise (src/coach/progression.js).
  const lastSession = new Set((history[0]?.exercises || []).map((item) => item.id));
  const chosen = [];
  for (const patterns of SLOTS) {
    if (chosen.length >= wanted) break;
    const pick = candidates
      .filter((exercise) => patterns.includes(exercise.pattern) && !chosen.some((item) => item.id === exercise.id))
      // Within a slot: the slot's first pattern, not done last time, compound before isolation.
      .sort((a, b) => patterns.indexOf(a.pattern) - patterns.indexOf(b.pattern)
        || (lastSession.has(a.id) ? 1 : 0) - (lastSession.has(b.id) ? 1 : 0)
        || (a.mechanic === "compound" ? 0 : 1) - (b.mechanic === "compound" ? 0 : 1))[0];
    if (pick) chosen.push(pick);
  }

  // Focus: about two thirds of the plan on the muscle or group, first (worked
  // while fresh), each with a different movement pattern where possible; the
  // least important slots make room. Only what fits the injuries and the gear.
  let focusAvailable = true;
  let focusLimited = false;
  const target = focusOf(focus);
  if (target) {
    const onFocus = (exercise) => exercise.primaryMuscles.some((muscle) => target.muscles.includes(muscle));
    const want = Math.min(wanted, Math.max(FOCUS_MIN_EXERCISES, Math.ceil(wanted * FOCUS_SHARE)));
    // Only strength patterns of the slots: mountain climbers hit the quads, but are no leg day.
    const slotOf = (pattern) => SLOTS.findIndex((patterns) => patterns.includes(pattern));
    const pool = candidates.filter((exercise) => onFocus(exercise) && slotOf(exercise.pattern) >= 0);
    const picked = [];
    while (picked.length < want) {
      const usedPatterns = new Set(picked.map((exercise) => exercise.pattern));
      const next = pool
        .filter((exercise) => !picked.includes(exercise))
        .sort((a, b) => (usedPatterns.has(a.pattern) ? 1 : 0) - (usedPatterns.has(b.pattern) ? 1 : 0)
          || slotOf(a.pattern) - slotOf(b.pattern)
          || (lastSession.has(a.id) ? 1 : 0) - (lastSession.has(b.id) ? 1 : 0)
          || (a.mechanic === "compound" ? 0 : 1) - (b.mechanic === "compound" ? 0 : 1))[0];
      if (!next) break;
      picked.push(next);
    }
    focusAvailable = picked.length > 0;
    focusLimited = picked.length > 0 && picked.length < want;
    const rest = chosen.filter((exercise) => !onFocus(exercise)).slice(0, Math.max(0, wanted - picked.length));
    chosen.splice(0, chosen.length, ...picked, ...rest);
  }

  return {
    profile: { goal, level, equipment, minutes, focus },
    focusAvailable,
    focusLimited,
    avoid,
    warmup: { durationS: WARMUP_S },
    exercises: chosen.map((exercise) => applyProgression(toPlanItem(exercise, prescription, level), exercise, history)),
  };
}

const SETS_WORD = (n) => (n === 1 ? "seria" : n < 5 ? "serie" : "serii");

// What the coach says once the plan is ready; fixed text, no second model call.
function describePlan(plan) {
  const items = plan.exercises.map((item) =>
    `${item.name}, ${item.sets} ${SETS_WORD(item.sets)} po ${item.reps ? `${item.reps} powtórzeń` : `${item.seconds} sekund`}`);
  const { focus } = plan.profile;
  const name = focusOf(focus)?.name;
  const reason = plan.avoid.length ? "przy Twojej kontuzji" : "na Twój sprzęt";
  const focusText = !focus ? ""
    : !plan.focusAvailable ? `Na ${name} nie mam dziś ćwiczenia ${reason === "na Twój sprzęt" ? "na Twój sprzęt" : `bezpiecznego ${reason}`}, więc robimy trening ogólny. `
      : plan.focusLimited ? `Skupiamy się na: ${name}, ale ${reason} mniej ćwiczeń z tej partii niż zwykle. `
        : `Skupiamy się na: ${name}. `;
  return `Mam plan na dziś. ${focusText}Najpierw pięć minut rozgrzewki, potem: ${items.join("; ")}. `
    + "Plan widzisz na ekranie. Powiedz „gotowe”, kiedy zaczynamy rozgrzewkę.";
}

module.exports = { planWorkout, describePlan, toPlanItem, filtersFor, focusOf, GOALS, EQUIPMENT_PRESETS, PRESCRIPTIONS, FOCUS_MUSCLES, FOCUS_GROUPS };
