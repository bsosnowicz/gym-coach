// Coaching rules for a week of training, in one place so a plan follows them
// the same way every time. They follow the common guidance on resistance
// training (ACSM position stand on progression models, NSCA basics):
//
// 1. The split follows the days and the level: 2–3 days full body; 4 days
//    upper/lower; 5 days push/pull/legs + upper/lower; 6 days push/pull/legs
//    twice. An experienced lifter on 5 days may take a body-part split. A
//    beginner trains at most 4 days a week, full body or upper/lower.
// 2. The same muscles get about 48 h before they are trained again.
// 3. Weekly volume per major muscle group: beginner ~8–10 hard sets,
//    intermediate ~10–15, advanced ~15–20.
// 4. Multi-joint exercises before single-joint ones; pushing and pulling
//    balanced within a week.
// 5. Intensity sets reps and rest: heavy (strength) 3–6 reps, 2–3 min rest;
//    moderate (muscle) 8–12 reps, 60–120 s; light (endurance) 15–20 reps, 30–60 s.
//    Single-joint exercises rest less than multi-joint ones.
//    A beginner who wants strength starts moderate: technique before load.
// 6. Every 5th week is lighter (deload): about 60% of the sets.

const SPLITS = {
  full_body: { name: "full body", days: ["full_body"] },
  upper_lower: { name: "góra / dół", days: ["upper", "lower"] },
  push_pull_legs: { name: "push / pull / nogi", days: ["push", "pull", "legs"] },
  ppl_upper_lower: { name: "push / pull / nogi + góra / dół", days: ["push", "pull", "legs", "upper", "lower"] },
  body_part: { name: "split na partie", days: ["chest", "back", "legs", "shoulders", "arms"] },
};

// What a day trains, as a planner focus (src/coach/planner.js); full body has none.
const DAY_FOCUS = {
  full_body: null, upper: "upper", lower: "legs", push: "push", pull: "pull", legs: "legs",
  chest: "chest", back: "back", shoulders: "shoulders", arms: "arms",
};
const DAY_NAMES = {
  full_body: "całe ciało", upper: "góra", lower: "dół", push: "push (klatka, barki, triceps)",
  pull: "pull (plecy, biceps)", legs: "nogi", chest: "klatka", back: "plecy", shoulders: "barki", arms: "ramiona",
};

const BEGINNER_MAX_DAYS = 4;
const MAX_DAYS = 6;
const RECOVERY_HOURS = 48;

// Rule 1: the split for this many days and this level.
function chooseSplit({ daysPerWeek, level }) {
  // A 7th day is always rest; one day a week is a full body day.
  const days = Math.max(1, Math.min(MAX_DAYS, Math.round(daysPerWeek) || 3));
  if (level === "beginner") return { split: days <= 3 ? "full_body" : "upper_lower", days: Math.min(days, BEGINNER_MAX_DAYS) };
  if (days <= 3) return { split: level === "expert" && days === 3 ? "push_pull_legs" : "full_body", days };
  if (days === 4) return { split: "upper_lower", days };
  if (days === 5) return { split: level === "expert" ? "body_part" : "ppl_upper_lower", days };
  return { split: "push_pull_legs", days };
}

// The training day types for the week, in order: the split's days repeated.
function weekDays(split, days) {
  const cycle = SPLITS[split].days;
  return Array.from({ length: days }, (_, index) => cycle[index % cycle.length]);
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_NAMES = { mon: "poniedziałek", tue: "wtorek", wed: "środa", thu: "czwartek", fri: "piątek", sat: "sobota", sun: "niedziela" };
// Days spread across the week when the user named none.
const DEFAULT_WEEKDAYS = {
  1: ["wed"], 2: ["mon", "thu"], 3: ["mon", "wed", "fri"], 4: ["mon", "tue", "thu", "fri"],
  5: ["mon", "tue", "wed", "fri", "sat"], 6: ["mon", "tue", "wed", "thu", "fri", "sat"],
};

// The weekdays to train on: the user's own (as many as the split needs), else spread.
function chooseWeekdays(count, preferred = []) {
  const own = WEEKDAYS.filter((day) => preferred.includes(day));
  return own.length >= count ? own.slice(0, count) : DEFAULT_WEEKDAYS[count];
}

// Rule 2: day types that work the same muscles too soon after each other.
const DAY_MUSCLES = {
  full_body: ["legs", "push", "pull"], upper: ["push", "pull"], lower: ["legs"], push: ["push"], pull: ["pull"], legs: ["legs"],
  chest: ["push"], back: ["pull"], shoulders: ["push"], arms: ["push", "pull"],
};
function recoveryConflicts(schedule) {
  const conflicts = [];
  const order = schedule.map((day) => ({ ...day, at: WEEKDAYS.indexOf(day.weekday) }));
  for (const [i, day] of order.entries()) {
    for (const other of order.slice(i + 1)) {
      const hours = (other.at - day.at) * 24;
      const shared = DAY_MUSCLES[day.type].filter((group) => DAY_MUSCLES[other.type].includes(group));
      if (shared.length && hours < RECOVERY_HOURS) conflicts.push({ first: day.weekday, second: other.weekday, groups: shared });
    }
  }
  return conflicts;
}

// Rule 5: reps, rest and sets for the intensity; single-joint exercises rest less.
const INTENSITIES = {
  heavy: { name: "ciężka", reps: 5, sets: 4, restS: { compound: 180, isolation: 90 } },
  moderate: { name: "umiarkowana", reps: 10, sets: 3, restS: { compound: 120, isolation: 75 } },
  light: { name: "lekka", reps: 15, sets: 3, restS: { compound: 60, isolation: 45 } },
};
const GOAL_INTENSITY = { strength: "heavy", muscle: "moderate", general: "moderate", endurance: "light" };
// A beginner builds strength with moderate loads first: technique before heavy fives.
const intensityFor = (goal, level) => (level === "beginner" && goal === "strength" ? "moderate" : GOAL_INTENSITY[goal] || "moderate");
const restFor = (intensity, mechanic) => INTENSITIES[intensity].restS[mechanic === "isolation" ? "isolation" : "compound"];

// Rule 3: weekly hard sets per major muscle group, by level.
const WEEKLY_SETS = { beginner: [8, 10], intermediate: [10, 15], expert: [15, 20] };
// The major groups the volume rule checks, as free-exercise-db muscles.
const MAJOR_GROUPS = {
  chest: ["chest"],
  back: ["lats", "middle back"],
  // Legs as two groups: a squat and a hinge each count once, not three times.
  quads: ["quadriceps"],
  posterior: ["hamstrings", "glutes"],
  shoulders: ["shoulders"],
};

// Sets per major group in a week of days ({ exercises: [{ id, sets }] }).
function weeklyVolume(days, catalog) {
  const volume = Object.fromEntries(Object.keys(MAJOR_GROUPS).map((group) => [group, 0]));
  for (const day of days) {
    for (const item of day.exercises) {
      const muscles = catalog.get(item.id)?.primaryMuscles || [];
      for (const [group, members] of Object.entries(MAJOR_GROUPS)) {
        if (muscles.some((muscle) => members.includes(muscle))) volume[group] += item.sets;
      }
    }
  }
  return volume;
}

// Rule 6: every 5th week of a plan is a deload week.
const DELOAD_EVERY_WEEKS = 5;
const DELOAD_SETS = 0.6;
const WEEK_MS = 7 * 24 * 3600 * 1000;
function weekOfPlan(startedAt, now = Date.now()) {
  return Math.floor((now - Date.parse(startedAt)) / WEEK_MS) + 1;
}
const isDeloadWeek = (week) => week > 0 && week % DELOAD_EVERY_WEEKS === 0;
const deloadSets = (sets) => Math.max(2, Math.round(sets * DELOAD_SETS));

module.exports = {
  SPLITS, DAY_FOCUS, DAY_NAMES, WEEKDAYS, WEEKDAY_NAMES, INTENSITIES, WEEKLY_SETS, MAJOR_GROUPS,
  BEGINNER_MAX_DAYS, RECOVERY_HOURS, DELOAD_EVERY_WEEKS,
  chooseSplit, weekDays, chooseWeekdays, recoveryConflicts, intensityFor, restFor,
  weeklyVolume, weekOfPlan, isDeloadWeek, deloadSets,
};
