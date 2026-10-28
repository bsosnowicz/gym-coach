// Keeping one scheme instead of a new plan every time, and rest between
// sessions of the same muscles — both read from the journal (newest first).
//
// A scheme is the last session with the same goal, equipment and focus: its
// exercises come back (with progression), and only what no longer fits
// (a new injury, missing gear) is replaced. A fresh plan only when the user
// asks for one ("ułóż nowy plan").

const RECOVERY_HOURS = 48;
const HOUR_MS = 3600 * 1000;

const sameScheme = (a = {}, b = {}) =>
  a.goal === b.goal && a.equipment === b.equipment && (a.focus || null) === (b.focus || null);

// The newest session to repeat, or null.
function findScheme(profile, history = []) {
  return history.find((session) => session.profile && (session.exercises || []).length && sameScheme(session.profile, profile)) || null;
}

// The muscles a plan of this profile works most: the focus, or for a general
// plan the muscles of its scheme.
function targetMuscles(profile, scheme, catalog, focusOf) {
  const focus = focusOf(profile.focus);
  if (focus) return focus.muscles;
  return [...new Set((scheme?.exercises || []).flatMap((item) => catalog.get(item.id)?.primaryMuscles || []))];
}

// { hours } when these muscles were trained less than RECOVERY_HOURS ago, or null.
function recoveryFor(profile, history, { catalog, focusOf, now = Date.now() }) {
  const muscles = targetMuscles(profile, findScheme(profile, history), catalog, focusOf);
  if (!muscles.length) return null;
  const last = history.find((session) => (session.sets || []).some((set) =>
    (catalog.get(set.id)?.primaryMuscles || []).some((muscle) => muscles.includes(muscle))));
  if (!last?.started_at) return null;
  const hours = Math.floor((now - Date.parse(last.started_at)) / HOUR_MS);
  return hours >= 0 && hours < RECOVERY_HOURS ? { hours } : null;
}

// "18 godzin temu", "wczoraj": for the coach's warning.
function agoText(hours) {
  if (hours < 1) return "przed chwilą";
  if (hours < 24) return `${hours} ${hours === 1 ? "godzinę" : hours % 10 >= 2 && hours % 10 <= 4 && (hours < 12 || hours > 14) ? "godziny" : "godzin"} temu`;
  return "wczoraj";
}

module.exports = { findScheme, recoveryFor, agoText, RECOVERY_HOURS };
