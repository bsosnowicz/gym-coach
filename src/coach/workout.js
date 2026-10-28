// Leading the workout: where the user is in the plan and what the coach says
// at each step. The model never moves the workout on its own; it only reports
// with [NEXT] that the user is done, and code decides what comes next.
//
//   ready → warmup → set → rest → set → … → done
//
// "Gotowe" / "dalej" (or [NEXT]) ends the warm-up or a set; the rest between
// sets is timed here, and saying "gotowe" during a rest skips the rest of it.
// Without a camera this is the rep counter: the user says when the set is
// done ("zrobiłem 8" keeps the 8). Stage 05 can drive advance() from YOLO.

const { normalizeWords } = require("../engine/words");

// Said briefly, these end the current step. Diacritics are stripped (normalizeWords).
const ADVANCE_WORDS = new Set([
  "gotowe", "gotowy", "gotowa", "dalej", "zrobione", "zrobilem", "zrobilam", "skonczylem", "skonczylam",
  "skonczone", "nastepne", "nastepna", "nastepny", "lecimy", "jedziemy", "zaczynamy",
]);
const MAX_ADVANCE_WORDS = 5;
// "Boli mnie kolano, gotowe" is a pain report for the model, not the end of a set.
const PAIN_WORDS = /\b(?:bol[iąaeęoy]\w*|ból\w*|bolesn\w*|uraz\w*|kontuzj\w*|naderw\w*|skręcon\w*|skręcił\w*|zwichn\w*|kłuj\w*|strzyk\w*|ciągnie)/iu;
const NUMBER_WORDS = {
  jeden: 1, jedno: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, piec: 5, szesc: 6, siedem: 7, osiem: 8, dziewiec: 9,
  dziesiec: 10, jedenascie: 11, dwanascie: 12, trzynascie: 13, czternascie: 14, pietnascie: 15, dwadziescia: 20,
};

// A short utterance that ends the step, e.g. "gotowe", "zrobiłem 8"; null when
// it is anything else (a question, "nie jestem gotowy") — that goes to the model.
function advanceIntent(text) {
  const words = normalizeWords(text);
  if (!words.length || words.length > MAX_ADVANCE_WORDS || words.includes("nie") || PAIN_WORDS.test(text)) return null;
  if (!words.some((word) => ADVANCE_WORDS.has(word))) return null;
  const digits = String(text).match(/\d+/);
  const spoken = words.map((word) => NUMBER_WORDS[word]).find(Boolean);
  const reps = digits ? Number(digits[0]) : spoken || null;
  return { reps: reps && reps <= 100 ? reps : null };
}

const ORDINAL = ["pierwsza", "druga", "trzecia", "czwarta", "piąta", "szósta"];
const target = (item) => (item.reps ? `${item.reps} powtórzeń` : `${item.seconds} sekund`);
const restText = (seconds) => (seconds >= 120 && seconds % 60 === 0 ? `${seconds / 60} minuty` : `${seconds} sekund`);

// Fixed texts: what the coach says at each step, without a model call.
const SAY = {
  warmup: () => "Zaczynamy od rozgrzewki: pięć minut lekkiego ruchu, krążenia ramion i bioder, kilka przysiadów bez obciążenia. Powiedz „gotowe”, kiedy skończysz.",
  firstSet: (item, number, total) =>
    `Ćwiczenie ${number} z ${total}: ${item.name}. Seria pierwsza z ${item.sets}, ${target(item)}. Powiedz „gotowe” po serii.`,
  rest: (item, seconds, next) =>
    `Seria zaliczona. Przerwa ${restText(seconds)}${next ? `, potem ${next}` : ""}.`,
  nextSet: (item, setIndex) =>
    `Koniec przerwy. ${item.name}, seria ${ORDINAL[setIndex] || setIndex + 1} z ${item.sets}, ${target(item)}.`,
  done: () => "To ostatnia seria, trening zrobiony. Świetna robota!",
  skipped: (item) => `Dobrze, pomijamy: ${item.name}.`,
  shortened: (item) => `Dobrze, kończymy: ${item.name}.`,
  lastSkipped: (item) => `Dobrze, pomijamy: ${item.name}. To był ostatni punkt, trening zrobiony.`,
  fewerSets: (item, sets) => `Dobrze, ${item.name}: zostaje ${sets} ${sets === 1 ? "seria" : sets < 5 ? "serie" : "serii"}.`,
  replaced: (old, item, setText) => `Zmieniamy: zamiast ${old.name} ${setText ? "robimy" : "będzie"} ${item.name}, ${target(item)}.${setText ? ` ${setText}` : ""}`,
  setReminder: (item, setIndex) => `Seria ${ORDINAL[setIndex] || setIndex + 1} z ${item.sets}. Powiedz „gotowe” po serii.`,
};

// deps: speak(text), publish(), record(type, payload), canSpeakNow() — false
// while the coach or the user is talking; timers and clock for the tests.
function createWorkoutRunner(plan, {
  speak, publish, record = () => {}, canSpeakNow = () => true,
  now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  const progress = { phase: "ready", exerciseIndex: 0, setIndex: 0, restEndsAt: null, completed: [] };
  let restTimer = null;
  let restRemainingMs = null;
  let pending = null;
  let pendingTimer = null;

  const current = () => plan.exercises[progress.exerciseIndex];

  // A step announcement waits until nobody talks (up to a limit), so the rest
  // timer does not cut off the coach answering a question.
  const SAY_WAIT_STEP_MS = 500;
  const SAY_WAIT_MAX_MS = 8000;
  function say(text) {
    clearTimer(pendingTimer);
    pending = { text, since: now() };
    const attempt = () => {
      pendingTimer = null;
      if (!pending) return;
      if (!canSpeakNow() && now() - pending.since < SAY_WAIT_MAX_MS) {
        pendingTimer = setTimer(attempt, SAY_WAIT_STEP_MS);
        return;
      }
      const { text: line } = pending;
      pending = null;
      speak(line);
    };
    attempt();
  }

  function startSet() {
    progress.phase = "set";
    progress.restEndsAt = null;
    publish();
  }

  function endRest() {
    restTimer = null;
    restRemainingMs = null;
    const item = current();
    say(progress.setIndex === 0
      ? SAY.firstSet(item, progress.exerciseIndex + 1, plan.exercises.length)
      : SAY.nextSet(item, progress.setIndex));
    startSet();
  }

  function startRest(ms) {
    progress.phase = "rest";
    progress.restEndsAt = now() + ms;
    restTimer = setTimer(endRest, ms);
    publish();
  }

  function finishSet(reps) {
    const item = current();
    progress.completed.push({ id: item.id, set: progress.setIndex + 1, reps: reps ?? item.reps ?? null, seconds: item.seconds ?? null });
    record("workout.set_done", { id: item.id, set: progress.setIndex + 1, reps: reps ?? null });
    const lastSet = progress.setIndex + 1 >= item.sets;
    if (lastSet && progress.exerciseIndex + 1 >= plan.exercises.length) {
      progress.phase = "done";
      progress.restEndsAt = null;
      say(SAY.done());
      publish();
      return;
    }
    if (lastSet) {
      progress.exerciseIndex += 1;
      progress.setIndex = 0;
    } else {
      progress.setIndex += 1;
    }
    say(SAY.rest(item, item.restS, lastSet ? current().name : null));
    startRest(item.restS * 1000);
  }

  // Leaves the current exercise for the next one (or the end); how: "skip" or
  // "shorten"; lead: said before it.
  function moveToNextExercise(how, item, lead = "") {
    clearTimer(restTimer);
    restTimer = null;
    restRemainingMs = null;
    if (progress.exerciseIndex + 1 >= plan.exercises.length) {
      progress.phase = "done";
      progress.restEndsAt = null;
      say(`${lead}${how === "skip" ? SAY.lastSkipped(item) : `${SAY.shortened(item)} ${SAY.done()}`}`);
      publish();
      return;
    }
    progress.exerciseIndex += 1;
    progress.setIndex = 0;
    const started = progress.phase === "set" || progress.phase === "rest";
    if (!started) {
      // Before the first set: the plan just loses the exercise, the warm-up goes on.
      say(`${lead}${SAY.skipped(item)}`);
      publish();
      return;
    }
    say(`${lead}${how === "skip" ? SAY.skipped(item) : SAY.shortened(item)} ${SAY.firstSet(current(), progress.exerciseIndex + 1, plan.exercises.length)}`);
    startSet();
  }

  return {
    progress,

    // The exercise a change ("za ciężko", "nie mam ławki") applies to: the one
    // in progress, or during a rest the one the next set belongs to.
    targetIndex: () => (progress.phase === "done" ? null : progress.exerciseIndex),

    // Puts another exercise in the plan; the sets done so far still count.
    // lead: said first, in the same breath (a second speak would cut this one off).
    // Returns whether anything was said.
    replace(index, item, { lead = "" } = {}) {
      const old = plan.exercises[index];
      plan.exercises[index] = item;
      record("workout.replaced", { from: old.id, to: item.id });
      const inSet = progress.phase === "set" && index === progress.exerciseIndex;
      const upcoming = index === progress.exerciseIndex && progress.phase === "rest";
      publish();
      if (!inSet && !upcoming) return false;
      say(`${lead}${SAY.replaced(old, item, inSet ? SAY.setReminder(item, progress.setIndex) : null)}`);
      return true;
    },

    skip({ lead = "" } = {}) {
      if (progress.phase === "done") return false;
      const item = current();
      record("workout.skipped", { id: item.id });
      moveToNextExercise("skip", item, lead);
      return true;
    },

    // Drops an entry not started yet (nothing to replace it with); nothing is said.
    remove(index) {
      const started = ["set", "rest", "done"].includes(progress.phase);
      if (started ? index <= progress.exerciseIndex : index < progress.exerciseIndex) return;
      record("workout.removed", { id: plan.exercises[index].id });
      plan.exercises.splice(index, 1);
      publish();
    },

    // One set fewer for the current exercise; when that leaves nothing to do, move on.
    fewerSets() {
      if (progress.phase === "done") return false;
      const item = current();
      // Sets already done; during a set the current one still counts as to do.
      const done = ["set", "rest"].includes(progress.phase) ? progress.setIndex : 0;
      const sets = item.sets - 1;
      if (sets < Math.max(1, done)) return false;
      record("workout.fewer_sets", { id: item.id, sets });
      if (sets === done && progress.phase === "rest") {
        item.sets = sets;
        moveToNextExercise("shorten", item);
        return true;
      }
      item.sets = sets;
      say(SAY.fewerSets(item, sets));
      publish();
      return true;
    },

    // The user is done with the current step; reps: what they said ("zrobiłem 8").
    // Returns false when there is nothing to move on from (no plan step, done).
    advance({ reps = null } = {}) {
      if (progress.phase === "ready") {
        progress.phase = "warmup";
        record("workout.warmup", {});
        say(SAY.warmup());
        publish();
        return true;
      }
      if (progress.phase === "warmup") {
        say(SAY.firstSet(current(), 1, plan.exercises.length));
        startSet();
        return true;
      }
      if (progress.phase === "set") {
        finishSet(reps);
        return true;
      }
      if (progress.phase === "rest") {
        // Ready before the timer: skip the rest of the break.
        clearTimer(restTimer);
        endRest();
        return true;
      }
      return false;
    },

    // A break of the whole session stops the rest timer; resume() restarts what was left.
    pause() {
      clearTimer(pendingTimer);
      pendingTimer = null;
      pending = null;
      if (progress.phase !== "rest" || !restTimer) return;
      clearTimer(restTimer);
      restTimer = null;
      restRemainingMs = Math.max(0, progress.restEndsAt - now());
      progress.restEndsAt = null;
      publish();
    },
    resume() {
      if (progress.phase !== "rest" || restRemainingMs === null) return;
      const ms = restRemainingMs;
      restRemainingMs = null;
      startRest(ms);
    },

    stop() {
      clearTimer(restTimer);
      clearTimer(pendingTimer);
      restTimer = null;
      pending = null;
    },

    // For the page: the plan position, and the rest left (ms) so it can count down
    // on its own clock.
    snapshot() {
      return {
        phase: progress.phase,
        exerciseIndex: progress.exerciseIndex,
        setIndex: progress.setIndex,
        restLeftMs: progress.restEndsAt ? Math.max(0, progress.restEndsAt - now()) : restRemainingMs,
        restPaused: progress.phase === "rest" && !progress.restEndsAt,
        completed: progress.completed.length,
      };
    },
  };
}

module.exports = { createWorkoutRunner, advanceIntent, SAY };
