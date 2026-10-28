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
const NUMBER_WORDS = {
  jeden: 1, jedno: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, piec: 5, szesc: 6, siedem: 7, osiem: 8, dziewiec: 9,
  dziesiec: 10, jedenascie: 11, dwanascie: 12, trzynascie: 13, czternascie: 14, pietnascie: 15, dwadziescia: 20,
};

// A short utterance that ends the step, e.g. "gotowe", "zrobiłem 8"; null when
// it is anything else (a question, "nie jestem gotowy") — that goes to the model.
function advanceIntent(text) {
  const words = normalizeWords(text);
  if (!words.length || words.length > MAX_ADVANCE_WORDS || words.includes("nie")) return null;
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

  return {
    progress,

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
