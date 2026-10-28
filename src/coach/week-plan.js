// The weekly plan from the interview profile, by the rules of
// src/coach/programming.js: the split and its day types, the weekdays, the
// exercises of each day (the one-day planner with the day's focus), reps and
// rest by intensity, more sets for priority muscles and for major groups
// under the weekly minimum. Weights are not stored here: progression from the
// journal sets them on the day (planFromDay).

const {
  SPLITS, DAY_FOCUS, DAY_NAMES, WEEKDAY_NAMES, INTENSITIES, WEEKLY_SETS, MAJOR_GROUPS,
  chooseSplit, weekDays, chooseWeekdays, recoveryConflicts, intensityFor, restFor,
  weeklyVolume, weekOfPlan, isDeloadWeek, deloadSets,
} = require("./programming");
const { planWorkout, focusOf, filtersFor } = require("./planner");
const { applyProgression } = require("./progression");

const MAX_SETS = { beginner: 4, intermediate: 5, expert: 5 };
const MIN_SETS = 2;
// Too much volume first drops redundant exercises, down to this many a day.
const MIN_EXERCISES = 4;
// As in the one-day planner: warm-up and rough work per set, to fit the session length.
const WARMUP_S = 300;
const WORK_PER_SET_S = 45;
const dayTimeS = (exercises) => WARMUP_S + exercises.reduce((sum, item) => sum + item.sets * (WORK_PER_SET_S + item.restS), 0);
const BEGINNER = { maxSets: 3, minReps: 8 };

// Sets and reps of the intensity, gentler for a beginner (technique before load).
function doseFor(intensity, level) {
  const { sets, reps } = INTENSITIES[intensity];
  return level === "beginner" ? { sets: Math.min(sets, BEGINNER.maxSets), reps: Math.max(reps, BEGINNER.minReps) } : { sets, reps };
}

const hits = (exercise, muscles) => (exercise?.primaryMuscles || []).some((muscle) => muscles.includes(muscle));
const isMajor = (exercise) => Object.values(MAJOR_GROUPS).some((muscles) => hits(exercise, muscles));

// profile: { goal, level, equipment, minutes, daysPerWeek, weekdays, priorities, intensity? };
// avoid: active injuries as for planWorkout.
function buildWeekPlan(catalog, profile, { avoid = [] } = {}) {
  const { goal, level, equipment, minutes } = profile;
  const { split, days: count } = chooseSplit({ daysPerWeek: profile.daysPerWeek, level });
  const intensity = INTENSITIES[profile.intensity] ? profile.intensity : intensityFor(goal, level);
  const dose = doseFor(intensity, level);
  const weekdays = chooseWeekdays(count, profile.weekdays || []);
  const priorityMuscles = (profile.priorities || []).flatMap((focus) => focusOf(focus)?.muscles || []);

  const days = [];
  for (const [index, type] of weekDays(split, count).entries()) {
    const focus = DAY_FOCUS[type];
    // A second day of the same type gets other exercises (as A/B in the one-day planner).
    const sameType = days.filter((day) => day.type === type).at(-1);
    const plan = planWorkout(catalog, { goal, level, equipment, minutes, focus }, {
      avoid,
      history: sameType ? [{ exercises: sameType.exercises }] : [],
      focusShare: focus ? 1 : undefined,
    });
    const exercises = plan.exercises.map((item) => {
      const exercise = catalog.get(item.id);
      const priority = priorityMuscles.length && hits(exercise, priorityMuscles);
      const sets = Math.min(MAX_SETS[level] || 5, dose.sets + (priority ? 1 : 0));
      const { kg, progress, ...rest } = item;
      return { ...rest, sets, ...(item.seconds ? {} : { reps: dose.reps }), restS: restFor(intensity, exercise.mechanic), ...(priority ? { priority: true } : {}) };
    });
    // Priority muscles first, while fresh; otherwise the planner's order stays.
    exercises.sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0));
    // Longer rests of the intensity: the least important exercises make room.
    while (exercises.length > 2 && dayTimeS(exercises) > minutes * 60) exercises.pop();
    days.push({ weekday: weekdays[index], type, focus, exercises });
  }

  balanceVolume(days, catalog, level, minutes);
  return {
    split, intensity, goal, level,
    profile: { goal, level, equipment, minutes },
    days,
    conflicts: recoveryConflicts(days),
  };
}

// Rule 3: a major group under the weekly minimum for the level gets a set
// more on its exercises in turn (up to MAX_SETS, while the day still fits the
// session); a group over the maximum loses the last exercises of its longest
// days first, then sets, priority exercises last and never under MIN_SETS.
function balanceVolume(days, catalog, level, minutes) {
  const [minimum, maximum] = WEEKLY_SETS[level] || WEEKLY_SETS.intermediate;
  const maxSets = MAX_SETS[level] || 5;
  const dayOf = new Map(days.flatMap((day) => day.exercises.map((item) => [item, day])));
  for (const [group, muscles] of Object.entries(MAJOR_GROUPS)) {
    const items = days.flatMap((day) => day.exercises).filter((item) => !item.seconds && hits(catalog.get(item.id), muscles));
    const volume = () => weeklyVolume(days, catalog)[group];
    let changed = true;
    while (changed && volume() < minimum) {
      changed = false;
      for (const item of items) {
        if (volume() >= minimum) break;
        if (item.sets >= maxSets) continue;
        item.sets += 1;
        // No time left: the day's last accessory (arms, calves) gives way to a major group.
        const day = dayOf.get(item);
        const accessory = () => [...day.exercises].reverse().find((other) => !isMajor(catalog.get(other.id)));
        while (dayTimeS(day.exercises) > minutes * 60 && day.exercises.length > MIN_EXERCISES && accessory()) {
          day.exercises.splice(day.exercises.indexOf(accessory()), 1);
        }
        if (dayTimeS(day.exercises) > minutes * 60) item.sets -= 1;
        else changed = true;
      }
    }
    for (;;) {
      const over = volume() - maximum;
      const day = days.filter((candidate) => candidate.exercises.length > MIN_EXERCISES)
        .sort((a, b) => b.exercises.length - a.exercises.length)
        .find((candidate) => candidate.exercises.some((item) => !item.priority && items.includes(item)));
      const drop = day && [...day.exercises].reverse().find((item) => !item.priority && items.includes(item));
      if (over <= 0 || !drop || drop.sets > over) break;
      day.exercises.splice(day.exercises.indexOf(drop), 1);
      items.splice(items.indexOf(drop), 1);
    }
    // The last exercises of a day give sets first: the main lifts keep theirs.
    const byPriority = [...items].reverse().sort((a, b) => (a.priority ? 1 : 0) - (b.priority ? 1 : 0));
    changed = true;
    while (changed && volume() > maximum) {
      changed = false;
      for (const item of byPriority) {
        if (volume() <= maximum) break;
        if (item.sets > MIN_SETS) { item.sets -= 1; changed = true; }
      }
    }
  }
}

// The plan's day for this weekday, or the next one in the week (a missed day
// does not skip its training): { day, index, planned }.
function dayFor(plan, weekday) {
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const today = order.indexOf(weekday);
  const planned = plan.days.findIndex((day) => day.weekday === weekday);
  if (planned >= 0) return { day: plan.days[planned], index: planned, planned: true };
  const next = plan.days.findIndex((day) => order.indexOf(day.weekday) > today);
  const index = next >= 0 ? next : 0;
  return { day: plan.days[index], index, planned: false };
}

const weekdayOf = (date = new Date()) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()];

// Today's workout from a day of the weekly plan, in the shape of planWorkout:
// progression from the journal, fewer sets in a deload week, exercises an
// injury now forbids replaced by a safe substitute (or left out).
function planFromDay(catalog, plan, day, { history = [], avoid = [], tired = false, now = Date.now() } = {}) {
  const filters = filtersFor(plan.profile, { avoid });
  const deload = isDeloadWeek(weekOfPlan(plan.startedAt || new Date(now).toISOString(), now));
  const exercises = [];
  for (const item of day.exercises) {
    let exercise = catalog.get(item.id);
    if (!exercise) continue;
    if (avoid.length && !catalog.available(filters).includes(exercise)) {
      exercise = catalog.substitutes(item.id, filters)
        .find((candidate) => !exercises.some((other) => other.id === candidate.id)) || null;
      if (!exercise) continue;
    }
    const base = { ...item, id: exercise.id, name: exercise.name, pattern: exercise.pattern, equipment: exercise.equipment };
    if (deload) base.sets = deloadSets(item.sets);
    const progressed = applyProgression(base, exercise, history, { hold: tired || deload });
    exercises.push(deload && progressed.kg ? { ...progressed, progress: "Tydzień lżejszy: mniej serii, ciężar bez zmian." } : progressed);
  }
  return {
    profile: { ...plan.profile, focus: day.focus },
    focusAvailable: true,
    focusLimited: false,
    schemeFrom: null,
    tired,
    deload,
    avoid,
    day: { weekday: day.weekday, type: day.type },
    warmup: { durationS: 300 },
    exercises,
  };
}

const setsWord = (n) => (n === 1 ? "trening" : n < 5 ? "treningi" : "treningów");

// What the coach says about a new weekly plan: fixed text from code.
function describeWeek(plan) {
  const days = plan.days.map((day) => `${WEEKDAY_NAMES[day.weekday]} — ${DAY_NAMES[day.type]}`).join(", ");
  const conflict = plan.conflicts.length
    ? " Uwaga: w Twoje dni te same mięśnie wracają szybciej niż po 48 godzinach — jeśli możesz, rozsuń te treningi."
    : "";
  return `Gotowe. Twój plan to ${SPLITS[plan.split].name}, ${plan.days.length} ${setsWord(plan.days.length)} w tygodniu, `
    + `intensywność ${INTENSITIES[plan.intensity].name}: ${days}.${conflict} Co piąty tydzień będzie lżejszy, żeby ciało odpoczęło. `
    + "Plan widzisz w kalendarzu.";
}

module.exports = { buildWeekPlan, planFromDay, dayFor, weekdayOf, describeWeek, doseFor };
