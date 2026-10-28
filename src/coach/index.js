const { buildCatalog } = require("./exercises");
const { planWorkout, describePlan, toPlanItem, filtersFor, GOALS, EQUIPMENT_PRESETS } = require("./planner");
const { EQUIPMENT, GEAR, LEVELS } = require("./exercises");
const { createWorkoutRunner, advanceIntent } = require("./workout");
const { cueBlockedBy } = require("./cues");
const { BODY_PARTS } = require("./exercises");
const { SEVERITIES } = require("./injury-store");

// For speech and the prompt; code matches on the ids only.
const BODY_PART_NAMES = {
  shoulder_left: "lewy bark", shoulder_right: "prawy bark", elbow_left: "lewy łokieć", elbow_right: "prawy łokieć",
  knee_left: "lewe kolano", knee_right: "prawe kolano", wrist_left: "lewy nadgarstek", wrist_right: "prawy nadgarstek",
  ankle_left: "lewa kostka", ankle_right: "prawa kostka", hip_left: "lewe biodro", hip_right: "prawe biodro",
  lower_back: "dolny odcinek pleców", upper_back: "górny odcinek pleców", neck: "szyja",
  calf_left: "lewa łydka", calf_right: "prawa łydka", hamstring_left: "lewy tył uda", hamstring_right: "prawy tył uda",
  ribs: "żebra", groin: "pachwina", other: "inne miejsce",
};

const BODY_PART_IDS = BODY_PARTS.join(", ");

const SYSTEM_PROMPT = `Jesteś Gym Coachem, trenerem siłowym w aplikacji głosowej z awatarem.
Rozmawiasz po polsku, naturalnie i konkretnie. Odpowiadasz krótko: jedno lub dwa zdania,
bez list, nagłówków, emotikonów i markdownu. Zadajesz najwyżej jedno pytanie naraz.
Na początku poznaj cel treningu, potem doświadczenie użytkownika, dostępny sprzęt
i ile czasu ma na dzisiejszy trening.
Wykorzystuj informacje już podane w historii, zamiast pytać ponownie.
Gdy znasz wszystkie cztery odpowiedzi, a planu jeszcze nie ma, odpowiedz jednym krótkim
zdaniem i dopisz na końcu dokładnie jeden znacznik:
[PLAN goal=<cel> level=<poziom> equipment=<sprzęt> minutes=<liczba minut>]
gdzie cel to strength (siła), muscle (masa mięśniowa), endurance (kondycja, wytrzymałość)
albo general (ogólna sprawność); poziom to beginner, intermediate albo expert;
sprzęt to gym (siłownia), home_dumbbells (dom z hantlami lub kettlebell) albo bodyweight
(bez sprzętu). Planu nie wymyślaj ani nie wymieniaj ćwiczeń: plan ułoży i przeczyta aplikacja.
Gdy plan już jest, aplikacja sama zapowiada rozgrzewkę, serie i przerwy. Nie zapowiadaj ich
sam. Gdy użytkownik mówi, że skończył rozgrzewkę albo serię, albo chce przejść dalej, odpowiedz
najwyżej jednym krótkim zdaniem i dopisz znacznik [NEXT]. Na pytania o technikę odpowiadaj
krótko, w odniesieniu do aktualnego ćwiczenia.
Zmiany planu robi aplikacja; Ty tylko potwierdzasz jednym krótkim zdaniem i dopisujesz znacznik:
[SWAP] gdy ćwiczenie jest za ciężkie, nie pasuje albo użytkownik chce inne;
[SKIP] gdy chce pominąć ćwiczenie; [FEWER_SETS] gdy chce zrobić mniej serii;
[NO_GEAR gear=<sprzęt>] gdy brakuje sprzętu, gdzie sprzęt to bench (ławka), rack (stojak),
pullup_bar (drążek), dip_bars (poręcze), box (podest), ab_wheel (kółko), barbell (sztanga),
dumbbell (hantle), kettlebell, cable (wyciąg) albo machine (maszyny).
Nie wymieniaj sam nowego ćwiczenia: poda je aplikacja.
Ból i kontuzje: gdy użytkownik mówi, że coś go boli albo ma uraz (teraz albo w przeszłości,
także w trakcie wywiadu), odpowiedz krótko i ze spokojem, nie zachęcaj do ćwiczenia przez ból
i dopisz znacznik [PAIN part=<partia> severity=<low|medium|high>], gdzie partia to dokładnie
jedna wartość z listy: ${BODY_PART_IDS}. Gdy nie da się jej przypisać, użyj other.
Aplikacja sama przerwie ćwiczenie, dobierze zamiennik i zapamięta to na kolejne treningi.
Gdy mówi, że coś już nie boli, dopisz [PAIN_RESOLVED part=<partia>].
Przy bólu w klatce piersiowej, duszności, zawrotach głowy albo drętwieniu każ przerwać trening,
poradź kontakt z lekarzem i dopisz [END].
Nie masz obrazu z kamery ani pomiaru ruchu. Nie twierdź, że widzisz technikę,
liczysz powtórzenia lub oceniasz wykonanie ćwiczenia.
Gdy kamera jest włączona, aplikacja sama wypowiada w Twoim imieniu krótkie uwagi
o postawie, np. "Stań prosto, barki nad biodrami.". Możesz do nich nawiązać,
ale nie dopowiadaj własnej oceny ruchu.
Wiadomość "[EVENT: session_start]" oznacza początek sesji: przedstaw się krótko
jako Gym Coach i zapytaj o cel treningu.`;

// The marker the model writes once the interview is done; values are closed enums.
const PLAN_MARKER = /\[PLAN ([^\]]*)\]/g;
const PLAN_LEVELS = ["beginner", "intermediate", "expert"];

function parsePlanMarker(text) {
  const fields = Object.fromEntries([...text.matchAll(/(\w+)=([\w-]+)/g)].map(([, key, value]) => [key, value]));
  const minutes = Math.round(Number(fields.minutes));
  if (!GOALS.includes(fields.goal) || !PLAN_LEVELS.includes(fields.level) || !EQUIPMENT_PRESETS[fields.equipment]) return null;
  if (!Number.isFinite(minutes) || minutes < 10 || minutes > 180) return null;
  return { goal: fields.goal, level: fields.level, equipment: fields.equipment, minutes };
}

const PHASE_TEXT = {
  ready: "plan ogłoszony, czekamy na start rozgrzewki",
  warmup: "trwa rozgrzewka",
  set: "trwa seria",
  rest: "przerwa między seriami",
  done: "trening zakończony",
};

// What the model is told about the plan in every turn after it exists.
function planContext(plan, progress) {
  const items = plan.exercises.map((item, index) =>
    `${index + 1}. ${item.name}: ${item.sets} × ${item.reps ? `${item.reps} powt.` : `${item.seconds} s`}, przerwa ${item.restS} s`);
  const item = plan.exercises[progress.exerciseIndex];
  const now = progress.phase === "set" || progress.phase === "rest"
    ? `Teraz: ${PHASE_TEXT[progress.phase]} — ${item.name}, seria ${progress.setIndex + 1} z ${item.sets}.`
    : `Teraz: ${PHASE_TEXT[progress.phase]}.`;
  return `Plan dzisiejszego treningu (ułożony przez aplikację, nie zmieniaj go sam):\nRozgrzewka 5 min\n${items.join("\n")}\n${now}`;
}

// What the model knows about the user's injuries, so it can ask how they are and stay careful.
function injuryContext(injuries) {
  const lines = injuries.map((injury) => `${BODY_PART_NAMES[injury.body_part] || injury.body_part}`
    + `${injury.severity ? ` (${injury.severity})` : ""}${injury.note ? `: „${injury.note}”` : ""}`);
  return `Zgłoszone dolegliwości (aktywne): ${lines.join("; ")}. Plan omija ćwiczenia obciążające te miejsca. `
    + "Na początku zapytaj krótko, jak się teraz czują.";
}

// Timers of a session that has ended must not keep the process (or a test) alive.
const unrefTimer = (fn, ms) => {
  const timer = setTimeout(fn, ms);
  timer.unref?.();
  return timer;
};

// Phrases Whisper invents on silence; they come from subtitle credits in its training data.
const STT_HALLUCINATIONS = [
  /^dziękuj[eę]\s+(za\s+)?ogląda\w*\s*[.!…]*$/i,
  /^napisy\s.{0,40}(amara|społeczno)\S*\s*[.!…]*$/i,
  /^napisy[\s:].{0,20}$/i,
  /^[.…\s]+$/,
];

// Said alone (up to three words) while the avatar talks, these do not cut it
// off: the avatar carries on (isLoneCourtesy in src/engine/words.js).
const COURTESY_WORDS = [
  "dziękuję", "dziękujemy", "dzięki", "bardzo", "ci", "dzień", "dobry", "cześć",
  "mhm", "yhm", "hmm", "hm", "aha", "uhm",
];

// engine: emit and speakText of src/engine, passed in by server.js; tests pass the same.
// injuries: src/coach/injury-store.js, or null without Supabase (the session still adapts).
function createCoach({ voiceId, language = "pl", catalog = buildCatalog(), engine = require("../engine"), injuries: injuryStore = null }) {
  // The workout as the page shows it; sent on every change and to a page that (re)joins.
  function workoutEvent(session) {
    const { plan, runner } = session.coachState;
    return { stage: "workout", workout: plan ? { plan, progress: runner.snapshot() } : null };
  }

  function queueChange(session, change) {
    if (session.coachState.runner) session.coachState.change = change;
  }

  // The best replacement for plan entry `index` that is not in the plan already.
  // easier: "za ciężko" — no harder than the original when anything that easy fits.
  function replacementFor(state, index, { easier = false } = {}) {
    const { plan } = state;
    const old = plan.exercises[index];
    const inPlan = new Set(plan.exercises.map((item) => item.id));
    const filters = filtersFor(plan.profile, { avoid: state.avoid, missing: state.missing });
    const candidates = catalog.substitutes(old.id, filters).filter((candidate) => !inPlan.has(candidate.id));
    const oldLevel = LEVELS.indexOf(catalog.get(old.id).level);
    const exercise = (easier && candidates.find((candidate) => LEVELS.indexOf(candidate.level) <= oldLevel)) || candidates[0];
    return exercise ? toPlanItem(exercise, old, plan.profile.level) : null;
  }

  // Every plan entry from `from` on that `drop(exercise)` rules out gets a replacement
  // (or leaves the plan); the current one is announced, with `lead` first.
  // Returns { changed, spoken }.
  function replaceAhead(session, from, drop, { lead = "", easier = false } = {}) {
    const state = session.coachState;
    const { runner, plan } = state;
    let changed = 0;
    let spoken = false;
    for (let at = plan.exercises.length - 1; at >= from; at -= 1) {
      if (!drop(catalog.get(plan.exercises[at].id))) continue;
      changed += 1;
      const item = replacementFor(state, at, { easier });
      const isCurrent = at === from;
      if (item) spoken = runner.replace(at, item, { lead: isCurrent ? lead : "" }) || spoken;
      else if (isCurrent && ["set", "rest"].includes(runner.progress.phase)) spoken = runner.skip({ lead }) || spoken;
      else runner.remove(at);
    }
    return { changed, spoken };
  }

  // Pain right now: the exercise stops, the rest of the plan leaves that body
  // part alone, and the report is kept for the next sessions.
  function handlePain(session, { part, severity, note }) {
    const state = session.coachState;
    const name = BODY_PART_NAMES[part];
    engine.record(session, "injury.reported", { part, severity });
    if (!state.injuries.some((injury) => injury.body_part === part)) {
      state.injuries.push({ body_part: part, severity, note: note || null });
    }
    if (part !== "other" && !state.avoid.includes(part)) state.avoid.push(part);
    injuryStore?.report({ bodyPart: part, severity, note, sessionId: session.id })
      .then((saved) => engine.record(session, saved ? "injury.saved" : "injury.save_failed", { part }));

    const caution = severity === "high"
      ? " Przy ostrym bólu lepiej dziś skończyć: powiedz „kończymy”, jeśli tak czujesz."
      : "";
    const { runner } = state;
    if (!runner || part === "other" || runner.progress.phase === "done") {
      if (caution) engine.speakText(session, caution.trim());
      return;
    }
    const lead = `Przerywamy, nie obciążamy: ${name}.${caution} `;
    const { changed, spoken } = replaceAhead(session, runner.targetIndex(), (exercise) => exercise.loads.includes(part), { lead });
    publish(session);
    if (spoken) return;
    if (changed) engine.speakText(session, `Zmieniłem plan tak, żeby nie obciążać: ${name}. Nowe ćwiczenia widzisz na ekranie.${caution}`);
    else if (caution) engine.speakText(session, caution.trim());
  }

  function resolvePain(session, part) {
    const state = session.coachState;
    engine.record(session, "injury.resolved", { part });
    state.injuries = state.injuries.filter((injury) => injury.body_part !== part);
    // The plan of this session stays as it is; the next one may load the part again.
    injuryStore?.report({ bodyPart: part, status: "resolved", sessionId: session.id });
  }

  function applyChange(session, change) {
    const state = session.coachState;
    const { runner, plan } = state;
    const index = runner.targetIndex();
    if (index === null) return;
    if (change.kind === "skip") runner.skip();
    else if (change.kind === "fewer_sets") runner.fewerSets();
    else if (change.kind === "swap") {
      const item = replacementFor(state, index, { easier: true });
      if (item) runner.replace(index, item);
      else runner.skip();
    } else if (change.kind === "no_gear") {
      if (!state.missing.includes(change.gear)) state.missing.push(change.gear);
      const { changed } = replaceAhead(session, index,
        (exercise) => exercise.equipment === change.gear || exercise.needs.includes(change.gear));
      engine.record(session, "workout.no_gear", { gear: change.gear, changed });
      publish(session);
      // Before the first set nothing above was said out loud.
      if (changed && ["ready", "warmup"].includes(runner.progress.phase)) {
        engine.speakText(session, "Zmieniłem plan pod Twój sprzęt, nowe ćwiczenia widzisz na ekranie.");
      }
    }
  }

  function startRunner(session, plan) {
    return createWorkoutRunner(plan, {
      speak: (text) => { if (!session.closed) engine.speakText(session, text); },
      publish: () => { if (!session.closed) publish(session); },
      record: (type, payload) => engine.record(session, type, payload),
      canSpeakNow: () => !cueBlockedBy(session),
      setTimer: unrefTimer,
    });
  }
  const publish = (session) => engine.emit(session, workoutEvent(session));

  return {
    // setup.injuries: active ones from earlier sessions (read by server.js before the start).
    createState: (setup = {}) => {
      const injuries = (setup.injuries || []).filter((injury) => BODY_PARTS.includes(injury.body_part));
      return {
        plan: null, runner: null, planToAnnounce: false, advanceAfterTurn: false, change: null, missing: [],
        injuries,
        // "other" maps to no exercise: the model knows about it, the filter cannot use it.
        avoid: injuries.map((injury) => injury.body_part).filter((part) => part !== "other"),
      };
    },

    speech: () => ({
      voiceId,
      languageCode: null,
      sttLanguage: language,
      sttCandidates: [],
      sttHallucinations: STT_HALLUCINATIONS,
      courtesyWords: COURTESY_WORDS,
    }),

    buildMessages(session, { userText }) {
      const { plan, runner, injuries } = session.coachState;
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(injuries.length ? [{ role: "system", content: injuryContext(injuries) }] : []),
        ...(plan ? [{ role: "system", content: planContext(plan, runner.progress) }] : []),
        ...session.history,
      ];
      if (userText === null) messages.push({ role: "user", content: "[EVENT: session_start]" });
      return messages;
    },

    markers: [
      {
        pattern: PLAN_MARKER,
        handle(session, [, fields]) {
          const state = session.coachState;
          if (state.plan) return;
          const profile = parsePlanMarker(fields);
          if (!profile) {
            engine.record(session, "workout.plan_rejected", { marker: fields });
            console.warn(`Sesja ${session.id}: znacznik planu bez poprawnych pól („${fields}”).`);
            return;
          }
          state.plan = planWorkout(catalog, profile, { avoid: state.avoid });
          state.runner = startRunner(session, state.plan);
          state.planToAnnounce = true;
          engine.record(session, "workout.planned", { profile, exercises: state.plan.exercises.map((item) => item.id) });
          publish(session);
        },
      },
      {
        pattern: /\[NEXT\]/g,
        handle(session) {
          if (session.coachState.runner) session.coachState.advanceAfterTurn = true;
        },
      },
      // Changes run after the reply is spoken (afterTurn), so the model's "dobrze" comes first.
      { pattern: /\[SWAP\]/g, handle: (session) => queueChange(session, { kind: "swap" }) },
      { pattern: /\[SKIP\]/g, handle: (session) => queueChange(session, { kind: "skip" }) },
      { pattern: /\[FEWER_SETS\]/g, handle: (session) => queueChange(session, { kind: "fewer_sets" }) },
      {
        pattern: /\[PAIN part=(\w+)(?: severity=(\w+))?\]/g,
        handle(session, [, part, severity]) {
          if (!BODY_PARTS.includes(part)) {
            engine.record(session, "injury.rejected", { part });
            return;
          }
          session.coachState.pain = { part, severity: SEVERITIES.includes(severity) ? severity : null };
        },
      },
      {
        pattern: /\[PAIN_RESOLVED part=(\w+)\]/g,
        handle(session, [, part]) {
          if (BODY_PARTS.includes(part)) session.coachState.painResolved = part;
        },
      },
      {
        pattern: /\[NO_GEAR gear=(\w+)\]/g,
        handle(session, [, gear]) {
          if (!GEAR.includes(gear) && !EQUIPMENT.includes(gear)) {
            engine.record(session, "workout.change_rejected", { marker: `NO_GEAR ${gear}` });
            return;
          }
          queueChange(session, { kind: "no_gear", gear });
        },
      },
    ],

    // "Gotowe", "dalej", "zrobiłem 8": the step ends in code, without the model.
    beforeTurn(session, userText) {
      const { runner } = session.coachState;
      const intent = runner && advanceIntent(userText);
      if (!intent || !runner.advance(intent)) return undefined;
      engine.record(session, "workout.advance", { text: userText, reps: intent.reps });
      return { handled: true };
    },

    onPause: (session) => session.coachState.runner?.pause(),
    onResume: (session) => session.coachState.runner?.resume(),

    // The plan is read out with fixed text right after the reply that carried the marker.
    async afterTurn(session, { userText } = {}) {
      const state = session.coachState;
      if (state.painResolved) {
        const part = state.painResolved;
        state.painResolved = null;
        resolvePain(session, part);
      }
      if (state.pain) {
        const pain = state.pain;
        state.pain = null;
        handlePain(session, { ...pain, note: userText });
        return;
      }
      if (state.change) {
        const change = state.change;
        state.change = null;
        applyChange(session, change);
        return;
      }
      if (state.advanceAfterTurn) {
        state.advanceAfterTurn = false;
        state.runner.advance();
        return;
      }
      if (!state.planToAnnounce) return;
      state.planToAnnounce = false;
      await engine.speakText(session, describePlan(state.plan));
    },

    workoutEvent,
  };
}

module.exports = { createCoach, parsePlanMarker, SYSTEM_PROMPT };
