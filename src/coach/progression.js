// Progression between sessions, from the workout journal (workout_sessions):
// for each exercise of today's plan, the last session that had it decides.
//   all sets with all reps → a bit more today (weight, or reps, or seconds);
//   something missed       → the same as last time.
// Weights go up in steps that exist on that equipment.

const WEIGHT_STEP_KG = { barbell: 2.5, dumbbell: 2, kettlebell: 4, cable: 2.5, machine: 5, band: 0, body_only: 0 };
const REPS_STEP = 2;
const MAX_REPS = 20;
const SECONDS_STEP = 10;
const MAX_SECONDS = 90;

const kgText = (kg) => `${String(Math.round(kg * 10) / 10).replace(".", ",")} kg`;

// What the user did with this exercise last time: { planned, sets } or null.
function lastTimeOf(id, history = []) {
  for (const session of history) {
    const sets = (session.sets || []).filter((set) => set.id === id);
    const planned = (session.exercises || []).find((item) => item.id === id);
    if (sets.length && planned) return { planned, sets };
  }
  return null;
}

// The plan entry with today's target, and `progress`: a sentence for the coach.
function applyProgression(item, exercise, history) {
  const last = lastTimeOf(item.id, history);
  if (!last) return item;
  const { planned, sets } = last;
  const target = planned.reps || null;
  const full = sets.length >= (planned.sets || 1)
    && sets.every((set) => !target || set.reps == null || set.reps >= target);
  const weights = sets.map((set) => set.kg).filter((kg) => typeof kg === "number" && kg > 0);
  const kg = weights.length ? Math.max(...weights) : null;
  const step = WEIGHT_STEP_KG[exercise.equipment] || 0;

  if (kg) {
    if (full && step) {
      const next = kg + step;
      return { ...item, kg: next, progress: `Ostatnio ${kgText(kg)} i wszystkie powtórzenia — dziś spróbuj ${kgText(next)}.` };
    }
    return { ...item, kg, progress: `Ostatnio ${kgText(kg)} — zostajemy przy tym ciężarze.` };
  }
  if (!full) return item;
  if (item.seconds) {
    const seconds = Math.min(MAX_SECONDS, (planned.seconds || item.seconds) + SECONDS_STEP);
    return seconds > item.seconds ? { ...item, seconds, progress: `Ostatnio cała seria — dziś ${seconds} sekund.` } : item;
  }
  const reps = Math.min(MAX_REPS, (target || item.reps) + REPS_STEP);
  return reps > item.reps ? { ...item, reps, progress: `Ostatnio wszystkie powtórzenia — dziś ${reps}.` } : item;
}

module.exports = { applyProgression, lastTimeOf, WEIGHT_STEP_KG };
