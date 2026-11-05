// The server's "workout" event ({ plan, progress }: src/coach/index.js, workoutEvent)
// as the props of the design system's PlanCard, LiveWorkout and WorkoutSummary.
// Plain functions, so the mapping is tested without a browser (test/plan-view.test.js).

const GOAL_TITLES = { strength: "Siła", muscle: "Masa mięśniowa", endurance: "Wytrzymałość", general: "Ogólna sprawność" };
// From src/coach/planner.js (FOCUS_MUSCLES, FOCUS_GROUPS): the names the coach says.
const FOCUS_NAMES = {
  legs: "nogi", back: "plecy", arms: "ramiona", core: "brzuch i core",
  abdominals: "brzuch", abductors: "odwodziciele ud", adductors: "przywodziciele ud", biceps: "biceps",
  calves: "łydki", chest: "klatka piersiowa", forearms: "przedramiona", glutes: "pośladki",
  hamstrings: "tył uda", lats: "najszersze grzbietu", lower_back: "dolny odcinek pleców", middle_back: "środek pleców",
  neck: "szyja", quadriceps: "przód uda", shoulders: "barki", traps: "kaptury", triceps: "triceps",
};
const LIVE_PHASES = { set: "set", rest: "rest", ready_set: "ready" };

const number = (value) => String(value).replace(".", ",");
const parseNumber = (text) => Number(text.replace(",", "."));

// interview (no plan yet) | plan (before the first set) | workout | summary
export function workoutPhase(workout) {
  const phase = workout?.plan && workout.progress?.phase;
  if (!phase) return "interview";
  if (phase === "done") return "summary";
  return LIVE_PHASES[phase] ? "workout" : "plan";
}

// The badge for today's step up, from the progression sentence (src/coach/progression.js):
// "Ostatnio 60 kg i wszystkie powtórzenia — dziś spróbuj 62,5 kg." → "+2,5 kg".
export function progressionBadge(item) {
  const text = item.progress;
  if (!text) return undefined;
  const kg = text.match(/Ostatnio ([\d,.]+) kg.*dziś spróbuj ([\d,.]+) kg/);
  if (kg) return `+${number(Math.round((parseNumber(kg[2]) - parseNumber(kg[1])) * 100) / 100)} kg`;
  if (/dziś \d+ sekund/.test(text)) return `${item.seconds} s`;
  if (/dziś \d+\.?$/.test(text)) return `${item.reps} powt.`;
  return undefined;
}

function stateOf(index, progress) {
  if (progress.phase === "done") return "done";
  if (!LIVE_PHASES[progress.phase]) return "todo";
  if (index < progress.exerciseIndex) return "done";
  return index === progress.exerciseIndex ? "current" : "todo";
}

export function toPlan({ plan, progress }) {
  const profile = plan.profile || {};
  return {
    title: GOAL_TITLES[profile.goal] || "Plan na dziś",
    minutes: profile.minutes,
    focus: profile.focus ? [FOCUS_NAMES[profile.focus] || profile.focus.replace(/_/g, " ")] : [],
    warmup: `~${Math.round((plan.warmup?.durationS || 0) / 60)} min`,
    warmupState: ["ready", "warmup"].includes(progress.phase) ? "todo" : "done",
    exercises: plan.exercises.map((item, index) => ({
      id: item.id,
      name: item.name,
      sets: item.sets,
      reps: item.reps,
      seconds: item.seconds,
      kg: item.kg,
      restS: item.restS,
      progression: progressionBadge(item),
      state: stateOf(index, progress),
    })),
  };
}

export function toLive({ plan, progress }, restLeftMs) {
  const phase = LIVE_PHASES[progress.phase];
  if (!phase) return null;
  const exercise = plan.exercises[progress.exerciseIndex];
  if (!exercise) return null;
  const last = progress.lastSet;
  return {
    exercise,
    exerciseIndex: progress.exerciseIndex,
    exerciseCount: plan.exercises.length,
    setIndex: progress.setIndex,
    phase,
    restLeft: Math.ceil((restLeftMs ?? 0) / 1000),
    restTotal: exercise.restS,
    restPaused: Boolean(progress.restPaused),
    previous: last && last.id === exercise.id && last.set <= progress.setIndex ? [{ reps: last.reps ?? last.seconds, kg: last.kg }] : [],
    next: plan.exercises[progress.exerciseIndex + 1],
    doneSets: progress.completed,
    totalSets: plan.exercises.reduce((sum, item) => sum + item.sets, 0),
  };
}

export function toSummary({ plan, progress }, now = new Date()) {
  return {
    date: now.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" }),
    stats: [
      { label: "Serie", value: String(progress.completed) },
      { label: "Ćwiczenia", value: String(plan.exercises.length) },
      { label: "Czas", value: String(plan.profile?.minutes ?? "—"), unit: "min" },
    ],
    rows: plan.exercises.map((item) => ({
      name: item.name,
      reps: item.reps ? `${item.sets} × ${item.reps}` : `${item.sets} × ${item.seconds} s`,
      kg: item.kg ? `${number(item.kg)} kg` : "—",
    })),
  };
}
