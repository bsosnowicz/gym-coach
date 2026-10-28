// Leading the workout: where the user is in the plan and what the coach says
// at each step. The model never moves the workout on its own; it only reports
// with [NEXT] that the user is done, and code decides what comes next.
//
//   ready → warmup → set → rest → ready_set → set → … → done
//
// "Gotowe" / "dalej" (or [NEXT]) ends the warm-up or a set; the rest between
// sets is timed here, and saying "gotowe" during a rest skips the rest of it.
// When the rest runs out the coach asks whether the user is ready (ready_set)
// and the set starts on a "tak" — the user may still be drinking water.
// Without a camera this is the rep counter: the user says when the set is
// done ("zrobiłem 8" keeps the 8). Stage 05 can drive advance() from YOLO.

const { normalizeWords } = require("../engine/words");
const { WEIGHT_STEP_KG } = require("./progression");

// A set far off the target says the weight is wrong: ask whether to change it
// for the next set (the answer comes during the rest, see adjust()).
const TOO_FEW_REPS = 3;
const TOO_MANY_REPS = 4;
// Further off than this: about 10% instead of one step.
const FAR_OFF_REPS = 5;
const hasWeight = (item) => Boolean(item.reps) && Boolean(WEIGHT_STEP_KG[item.equipment]);

// Said briefly, these end the current step. Diacritics are stripped (normalizeWords).
// Prefixes catch what Whisper makes of tired speech: "gotowo", "zrubiona", "skończone".
const ADVANCE_WORDS = new Set(["dalej", "lecimy", "jedziemy", "zaczynamy"]);
const ADVANCE_PREFIXES = ["gotow", "zrobil", "zrobion", "zrubil", "zrubion", "skonczyl", "skonczon", "nastepn"];
const isAdvanceWord = (word) => ADVANCE_WORDS.has(word) || ADVANCE_PREFIXES.some((prefix) => word.startsWith(prefix));
const MAX_ADVANCE_WORDS = 5;
// "Boli mnie kolano, gotowe" is a pain report for the model, not the end of a set.
const PAIN_WORDS = /\b(?:bol[iąaeęoy]\w*|ból\w*|bolesn\w*|uraz\w*|kontuzj\w*|naderw\w*|skręcon\w*|skręcił\w*|zwichn\w*|kłuj\w*|strzyk\w*|ciągnie)/iu;
const NUMBER_WORDS = {
  jeden: 1, jedno: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, piec: 5, szesc: 6, siedem: 7, osiem: 8, dziewiec: 9,
  dziesiec: 10, jedenascie: 11, dwanascie: 12, trzynascie: 13, czternascie: 14, pietnascie: 15, dwadziescia: 20,
};

// A short utterance that ends the step, e.g. "gotowe", "zrobiłem 8"; null when
// it is anything else (a question, "nie jestem gotowy") — that goes to the model.
// "na 60 kilo", "60 kg", "62,5 kilograma": the weight of the set.
const WEIGHT = /(\d+(?:[.,]\d+)?)\s*(?:kg|kilo\w*)/i;
// "zrobiłem 8 na 60 kilo" is longer than a bare "gotowe" but still just a result.
const MAX_RESULT_WORDS = 9;

// Reps and weight from what the user said, e.g. "zrobiłem 8 na 60 kilo".
function parseResult(text) {
  const raw = String(text);
  const weight = raw.match(WEIGHT);
  const kg = weight ? Number(weight[1].replace(",", ".")) : null;
  const rest = weight ? raw.replace(weight[0], " ") : raw;
  const digits = rest.match(/\b\d+\b/);
  const spoken = normalizeWords(rest).map((word) => NUMBER_WORDS[word]).find(Boolean);
  const reps = digits ? Number(digits[0]) : spoken || null;
  return { reps: reps && reps <= 100 ? reps : null, kg: kg && kg > 0 && kg <= 500 ? kg : null };
}

function advanceIntent(text) {
  const words = normalizeWords(text);
  const limit = /\d/.test(String(text)) ? MAX_RESULT_WORDS : MAX_ADVANCE_WORDS;
  if (!words.length || words.length > limit || words.includes("nie") || PAIN_WORDS.test(text)) return null;
  if (!words.some(isAdvanceWord)) return null;
  return parseResult(text);
}

// Polish plural: 1 seria, 2–4 serie, 5+ serii (12–14 too).
function plural(n, [one, few, many]) {
  if (n === 1) return one;
  const tens = n % 100;
  return n % 10 >= 2 && n % 10 <= 4 && (tens < 12 || tens > 14) ? few : many;
}

// What was done, said at the end: exercises, sets and the reps the user counted.
function summary(completed) {
  if (!completed.length) return "Na dziś kończymy.";
  const exercises = new Set(completed.map((set) => set.id)).size;
  const reps = completed.reduce((sum, set) => sum + (set.reps || 0), 0);
  return `Trening zrobiony: ${exercises} ${plural(exercises, ["ćwiczenie", "ćwiczenia", "ćwiczeń"])}, `
    + `${completed.length} ${plural(completed.length, ["seria", "serie", "serii"])}`
    + `${reps ? `, razem ${reps} ${plural(reps, ["powtórzenie", "powtórzenia", "powtórzeń"])}` : ""}. Świetna robota!`;
}

const ORDINAL = ["pierwsza", "druga", "trzecia", "czwarta", "piąta", "szósta"];
const kgText = (kg) => `${String(kg).replace(".", ",")} kg`;
const target = (item) => `${item.reps ? `${item.reps} powtórzeń` : `${item.seconds} sekund`}${item.kg ? ` na ${kgText(item.kg)}` : ""}`;
const restText = (seconds) => (seconds >= 120 && seconds % 60 === 0 ? `${seconds / 60} minuty` : `${seconds} sekund`);

// Fixed texts: what the coach says at each step, without a model call.
const SAY = {
  warmup: () => "Zaczynamy od rozgrzewki: pięć minut lekkiego ruchu, krążenia ramion i bioder, kilka przysiadów bez obciążenia. Powiedz „gotowe”, kiedy skończysz.",
  // item.progress: what changed since last time (src/coach/progression.js).
  // item.progress: what changed since last time (src/coach/progression.js); no weight
  // known yet: how to pick one, and to say it after the set.
  firstSet: (item, number, total) =>
    `Ćwiczenie ${number} z ${total}: ${item.name}.${item.progress ? ` ${item.progress}` : ""} Seria pierwsza z ${item.sets}, ${target(item)}.`
    + (hasWeight(item) && !item.kg
      ? ` Weź ciężar, z którym zrobisz ${item.reps} powtórzeń z zapasem dwóch, i po serii powiedz, ile było, na przykład „zrobiłem ${item.reps} na 40 kilo”.`
      : " Powiedz „gotowe” po serii."),
  adjustDown: (done, item, kg) => `Tylko ${done} z ${item.reps} — ciężar wydaje się za duży. ${kg ? `Zmniejszyć do ${kgText(kg)}` : "Zmniejszyć ciężar"} na następną serię?`,
  adjustUp: (done, item, kg) => `${done} powtórzeń to sporo. ${kg ? `Zwiększyć do ${kgText(kg)}` : "Zwiększyć ciężar"} na następną serię?`,
  adjusted: (kg, up) => (kg ? `Dobrze, następna seria na ${kgText(kg)}.` : `Dobrze, weź ${up ? "więcej" : "lżej"} i po serii powiedz, ile było.`),
  kept: (kg) => (kg ? `Dobrze, zostajemy przy ${kgText(kg)}.` : "Dobrze, zostajemy przy tym ciężarze."),
  rest: (item, seconds, next, question = "") =>
    `Seria zaliczona.${question ? ` ${question}` : ""} Przerwa ${restText(seconds)}${next ? `, potem ${next}` : ""}.`,
  nextSet: (item, setIndex) =>
    `Koniec przerwy. ${item.name}, seria ${ORDINAL[setIndex] || setIndex + 1} z ${item.sets}, ${target(item)}.`,
  // Rest over: what comes next, and a question; the set starts on the answer.
  restOver: (item, setIndex, number, total) =>
    `Koniec przerwy. ${setIndex === 0 ? `Ćwiczenie ${number} z ${total}: ${item.name}.${item.progress ? ` ${item.progress}` : ""}` : `${item.name},`} `
    + `seria ${ORDINAL[setIndex] || setIndex + 1} z ${item.sets}, ${target(item)}. Jesteś gotowy?`,
  readyReminder: () => "Daj znać, kiedy będziesz gotowy na kolejną serię.",
  go: () => "Zaczynamy. Powiedz „gotowe” po serii.",
  done: (completed) => summary(completed),
  skipped: (item) => `Dobrze, pomijamy: ${item.name}.`,
  shortened: (item) => `Dobrze, kończymy: ${item.name}.`,
  lastSkipped: (item, completed) => `Dobrze, pomijamy: ${item.name}. To był ostatni punkt. ${summary(completed)}`,
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

  // A weight question asked after a set, answered during the rest.
  let pendingAdjust = null;

  function startSet() {
    pendingAdjust = null;
    progress.phase = "set";
    progress.restEndsAt = null;
    publish();
  }

  // The user said they are ready before the rest ran out: straight into the set.
  function endRest() {
    restTimer = null;
    restRemainingMs = null;
    const item = current();
    say(progress.setIndex === 0
      ? SAY.firstSet(item, progress.exerciseIndex + 1, plan.exercises.length)
      : SAY.nextSet(item, progress.setIndex));
    startSet();
  }

  // The rest ran out: ask, and remind once if no answer comes.
  const READY_REMINDER_MS = 45000;
  let reminderTimer = null;
  function restRunOut() {
    pendingAdjust = null;
    restTimer = null;
    restRemainingMs = null;
    progress.phase = "ready_set";
    progress.restEndsAt = null;
    say(SAY.restOver(current(), progress.setIndex, progress.exerciseIndex + 1, plan.exercises.length));
    reminderTimer = setTimer(() => {
      reminderTimer = null;
      if (progress.phase === "ready_set") say(SAY.readyReminder());
    }, READY_REMINDER_MS);
    publish();
  }

  function startRest(ms) {
    progress.phase = "rest";
    progress.restEndsAt = now() + ms;
    restTimer = setTimer(restRunOut, ms);
    publish();
  }

  // The weight for the next set when this one was far off the target, or null.
  function weightQuestion(item, reps, kg) {
    if (!hasWeight(item) || reps == null) return null;
    const down = reps <= item.reps - TOO_FEW_REPS;
    const up = reps >= item.reps + TOO_MANY_REPS;
    if (!down && !up) return null;
    const step = WEIGHT_STEP_KG[item.equipment];
    const far = Math.abs(reps - item.reps) >= FAR_OFF_REPS;
    const change = kg ? Math.max(step, far ? Math.round((kg * 0.1) / step) * step : step) : 0;
    const next = kg ? Math.max(step, kg + (up ? change : -change)) : null;
    return { up, kg: next, current: kg, text: up ? SAY.adjustUp(reps, item, next) : SAY.adjustDown(reps, item, next) };
  }

  function finishSet(reps, kg) {
    const item = current();
    // No weight said: the one planned (or said earlier) — the journal needs it for progression.
    const weight = kg ?? item.kg ?? null;
    if (kg) item.kg = kg;
    progress.completed.push({ id: item.id, set: progress.setIndex + 1, reps: reps ?? item.reps ?? null, seconds: item.seconds ?? null, kg: weight });
    record("workout.set_done", { id: item.id, set: progress.setIndex + 1, reps: reps ?? null, kg: weight });
    const lastSet = progress.setIndex + 1 >= item.sets;
    // Only between sets of the same exercise; across sessions progression decides.
    const question = lastSet ? null : weightQuestion(item, reps, weight);
    pendingAdjust = question ? { index: progress.exerciseIndex, ...question } : null;
    if (lastSet && progress.exerciseIndex + 1 >= plan.exercises.length) {
      progress.phase = "done";
      progress.restEndsAt = null;
      say(SAY.done(progress.completed));
      publish();
      return;
    }
    if (lastSet) {
      progress.exerciseIndex += 1;
      progress.setIndex = 0;
    } else {
      progress.setIndex += 1;
    }
    say(SAY.rest(item, item.restS, lastSet ? current().name : null, question?.text));
    startRest(item.restS * 1000);
  }

  // Leaves the current exercise for the next one (or the end); how: "skip" or
  // "shorten"; lead: said before it.
  function moveToNextExercise(how, item, lead = "") {
    clearTimer(restTimer);
    clearTimer(reminderTimer);
    reminderTimer = null;
    restTimer = null;
    restRemainingMs = null;
    if (progress.exerciseIndex + 1 >= plan.exercises.length) {
      progress.phase = "done";
      progress.restEndsAt = null;
      say(`${lead}${how === "skip" ? SAY.lastSkipped(item, progress.completed) : `${SAY.shortened(item)} ${SAY.done(progress.completed)}`}`);
      publish();
      return;
    }
    progress.exerciseIndex += 1;
    progress.setIndex = 0;
    const started = ["set", "rest", "ready_set"].includes(progress.phase);
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

    get pendingAdjust() { return pendingAdjust; },

    // The answer to the weight question: accept changes the weight of the next sets.
    adjust(accept) {
      if (!pendingAdjust) return false;
      const { index, up, kg, current: was } = pendingAdjust;
      pendingAdjust = null;
      const item = plan.exercises[index];
      if (accept && kg) item.kg = kg;
      record("workout.weight_adjusted", { id: item.id, accepted: accept, kg: accept ? kg : was });
      say(accept ? SAY.adjusted(kg, up) : SAY.kept(was));
      publish();
      return true;
    },

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
      const upcoming = index === progress.exerciseIndex && ["rest", "ready_set"].includes(progress.phase);
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
      const started = ["set", "rest", "ready_set", "done"].includes(progress.phase);
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
      const done = ["set", "rest", "ready_set"].includes(progress.phase) ? progress.setIndex : 0;
      const sets = item.sets - 1;
      if (sets < Math.max(1, done)) return false;
      record("workout.fewer_sets", { id: item.id, sets });
      if (sets === done && ["rest", "ready_set"].includes(progress.phase)) {
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
    advance({ reps = null, kg = null } = {}) {
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
        finishSet(reps, kg);
        return true;
      }
      if (progress.phase === "rest") {
        // Ready before the timer: skip the rest of the break.
        clearTimer(restTimer);
        endRest();
        return true;
      }
      if (progress.phase === "ready_set") {
        clearTimer(reminderTimer);
        reminderTimer = null;
        say(SAY.go());
        startSet();
        return true;
      }
      return false;
    },

    // A break of the whole session stops the rest timer; resume() restarts what was left.
    pause() {
      clearTimer(pendingTimer);
      clearTimer(reminderTimer);
      reminderTimer = null;
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
      clearTimer(reminderTimer);
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
        lastSet: progress.completed.at(-1) || null,
        adjustQuestion: pendingAdjust?.text || null,
      };
    },
  };
}

module.exports = { createWorkoutRunner, advanceIntent, parseResult, summary, SAY };
