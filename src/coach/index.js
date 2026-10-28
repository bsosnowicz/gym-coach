const { buildCatalog } = require("./exercises");
const { planWorkout, describePlan, toPlanItem, filtersFor, GOALS, EQUIPMENT_PRESETS } = require("./planner");
const { EQUIPMENT, GEAR, LEVELS } = require("./exercises");
const { createWorkoutRunner, advanceIntent } = require("./workout");
const { cueBlockedBy } = require("./cues");
const { BODY_PARTS, excludedBy } = require("./exercises");
const { SEVERITIES } = require("./injury-store");
const { findInjuryMentions, mentionsInjury } = require("./body-mentions");

const severityRank = (severity) => SEVERITIES.indexOf(severity);

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
Najkrótszy plan ma 10 minut: gdy ktoś ma mniej czasu, wpisz minutes=10 i powiedz, że zrobicie krótki trening.
Gdy plan już jest, aplikacja sama zapowiada rozgrzewkę, serie, przerwy, koniec przerwy i zmiany
ćwiczeń. Nigdy nie zapowiadaj ich sam ani nie mów, które ćwiczenie i seria są teraz, jeśli nie
pyta o to użytkownik. Nie obiecuj, że aplikacja „zaraz” coś zmieni: znacznik działa od razu. Gdy użytkownik mówi, że skończył rozgrzewkę albo serię, albo chce przejść dalej, odpowiedz
najwyżej jednym krótkim zdaniem i dopisz znacznik [NEXT], a gdy podał wynik serii:
[NEXT reps=<powtórzenia> kg=<ciężar>] (każde pole tylko, jeśli padło). Na pytania o technikę odpowiadaj
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
Liczy się każda wzmianka o kontuzji, urazie, operacji albo rehabilitacji, także bez bólu
i także podana jako cel („chcę potrenować stabilizację na kontuzjowanym lewym kolanie” to
[PAIN part=knee_left severity=low]). Nie zapisuj ponownie partii z listy aktywnych dolegliwości,
chyba że teraz boli mocniej.
Partia to miejsce, które BOLI, nie ćwiczenie: „boli mnie kolano przy martwym ciągu” to knee_…,
nie lower_back. Strona: left albo right; gdy nie padła, dopytaj albo wybierz tę, o której mówił
wcześniej. severity: low — lekki dyskomfort, medium — boli, high — mocno, ostro, „strasznie”.
Gdy użytkownik pyta, czemu w planie jest ćwiczenie mimo bólu, a ból jest już zgłoszony,
dopisz [PAIN …] jeszcze raz z mocniejszym severity: aplikacja wtedy wymieni ćwiczenie.
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
  // "5 minut" gets the shortest plan instead of none: a rejected marker left the session stuck.
  const minutes = Math.min(180, Math.max(10, Math.round(Number(fields.minutes))));
  if (!GOALS.includes(fields.goal) || !PLAN_LEVELS.includes(fields.level) || !EQUIPMENT_PRESETS[fields.equipment]) return null;
  if (!Number.isFinite(minutes)) return null;
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

// The previous workout from the journal, so the coach can refer to it.
function lastWorkoutContext(last) {
  const names = (last.exercises || []).map((item) => item.name).join(", ");
  const planned = (last.exercises || []).reduce((sum, item) => sum + (item.sets || 0), 0);
  const day = String(last.started_at || "").slice(0, 10);
  return `Poprzedni trening (${day}): ${names || "bez planu"}; zrobione serie: ${(last.sets || []).length} z ${planned}`
    + `${last.finished ? "" : ", nieukończony"}. Możesz krótko do niego nawiązać.`;
}

// What the journal keeps besides sets: how the plan changed during the session.
const CHANGE_EVENTS = new Set(["workout.replaced", "workout.skipped", "workout.removed", "workout.fewer_sets"]);

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
// workoutLog: src/coach/workout-log.js, or null without Supabase.
function createCoach({
  voiceId, language = "pl", catalog = buildCatalog(), engine = require("../engine"),
  injuries: injuryStore = null, workoutLog = null,
}) {
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
  // After a break, once the engine's "wracamy" is said and nobody has spoken for a
  // moment (as holdPainNote in yoga-startup): the plan adapts to pain reported
  // during the break, and what named no clear body part goes to the model.
  // Earlier, the engine's resume line would cut the announcement off.
  const HELD_PAIN_QUIET_MS = 1500;
  const HELD_PAIN_POLL_MS = 250;
  const HELD_PAIN_MAX_WAIT_MS = 60000;
  function afterBreak(session) {
    const state = session.coachState;
    if ((!state.heldPain?.length && !state.painAfterBreak?.length) || state.heldPainTimer) return;
    const startedAt = Date.now();
    let quietSince = null;
    const check = () => {
      state.heldPainTimer = null;
      if (session.closed) return;
      const busy = cueBlockedBy(session);
      if (busy) quietSince = null;
      else if (quietSince === null) quietSince = Date.now();
      if ((quietSince !== null && Date.now() - quietSince >= HELD_PAIN_QUIET_MS) || Date.now() - startedAt > HELD_PAIN_MAX_WAIT_MS) {
        if (busy) return;
        const pains = state.painAfterBreak || [];
        state.painAfterBreak = [];
        for (const pain of pains) adaptPlanToPain(session, pain);
        const text = (state.heldPain || []).join(" ");
        state.heldPain = [];
        if (text) engine.runTurn(session, text);
        return;
      }
      state.heldPainTimer = unrefTimer(check, HELD_PAIN_POLL_MS);
    };
    state.heldPainTimer = unrefTimer(check, HELD_PAIN_POLL_MS);
  }

  // quiet: saved and noted, but the plan is not changed and nothing is said —
  // during a break; the coach reacts once the break is over.
  function handlePain(session, { part, severity, note, quiet = false }) {
    const state = session.coachState;
    const name = BODY_PART_NAMES[part];
    engine.record(session, "injury.reported", { part, severity });
    noteChange(session, "injury.reported", { part, severity });
    // No duplicates: a part already known (this session or active in the database)
    // is written again only when the pain is stronger now.
    const known = state.injuries.find((injury) => injury.body_part === part);
    const stronger = !known || severityRank(severity) > severityRank(known.severity);
    if (!known) state.injuries.push({ body_part: part, severity, note: note || null });
    else if (stronger) Object.assign(known, { severity, note: note || known.note });
    console.log(`Sesja ${session.id}: ból — ${name} (${severity || "bez oceny"})`
      + `${!stronger ? ", już zapisany wcześniej" : injuryStore ? ", zapisuję w Supabase" : ", Supabase wyłączony — bez zapisu"}.`);
    // A second report of the same part keeps the stronger pain.
    if (part !== "other") {
      const known = state.avoid.find((injury) => injury.part === part);
      if (!known) state.avoid.push({ part, severity });
      else if (SEVERITIES.indexOf(severity) > SEVERITIES.indexOf(known.severity)) known.severity = severity;
    }
    // The page's log shows whether it was saved: a silent failure looked like success before.
    const saving = !stronger ? Promise.resolve("known")
      : injuryStore ? injuryStore.report({ bodyPart: part, severity, note, sessionId: session.id }) : Promise.resolve(null);
    saving.then((saved) => {
      if (typeof saved === "boolean") engine.record(session, saved ? "injury.saved" : "injury.save_failed", { part });
      if (saved) console.log(`Sesja ${session.id}: ból — ${name} zapisany w Supabase.`);
      if (!session.closed) engine.emit(session, { stage: "injury_saved", part, name, severity, saved });
    });

    if (quiet) {
      state.painAfterBreak = [...(state.painAfterBreak || []), { part, severity }];
      return;
    }
    adaptPlanToPain(session, { part, severity });
  }

  // The exercise in progress stops and the rest of the plan leaves the part alone.
  function adaptPlanToPain(session, { part, severity }) {
    const state = session.coachState;
    const name = BODY_PART_NAMES[part];
    const caution = severity === "high"
      ? " Przy ostrym bólu lepiej dziś skończyć: powiedz „kończymy”, jeśli tak czujesz."
      : "";
    const { runner } = state;
    if (!runner || part === "other" || runner.progress.phase === "done") {
      if (caution) engine.speakText(session, caution.trim());
      return;
    }
    const lead = `Przerywamy, nie obciążamy: ${name}.${caution} `;
    const { changed, spoken } = replaceAhead(session, runner.targetIndex(), (exercise) => excludedBy(exercise, [{ part, severity }]), { lead });
    publish(session);
    if (spoken) return;
    if (changed) engine.speakText(session, `Zmieniłem plan tak, żeby nie obciążać: ${name}. Nowe ćwiczenia widzisz na ekranie.${caution}`);
    // Nothing to change still needs saying, or the user waits for a change that never comes.
    else engine.speakText(session, `Zapamiętałem: ${name}. Kolejne ćwiczenia nie obciążają tego miejsca, możemy kontynuować.${caution}`);
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
      noteChange(session, "workout.no_gear", { gear: change.gear });
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
      record: (type, payload) => {
        engine.record(session, type, payload);
        if (CHANGE_EVENTS.has(type)) noteChange(session, type, payload);
      },
      canSpeakNow: () => !cueBlockedBy(session),
      setTimer: unrefTimer,
    });
  }
  // Every change the page sees also goes to the journal (one row per session, upserted).
  function saveLog(session) {
    const { plan, runner, changes, startedAt } = session.coachState;
    if (!workoutLog || !plan) return;
    workoutLog.save({
      sessionId: session.id,
      startedAt,
      finished: runner.progress.phase === "done",
      profile: plan.profile,
      exercises: plan.exercises,
      sets: runner.progress.completed,
      changes,
    });
  }

  const publish = (session) => {
    engine.emit(session, workoutEvent(session));
    saveLog(session);
  };
  const noteChange = (session, type, payload) => {
    session.coachState.changes.push({ type, ...payload, at: new Date().toISOString() });
  };

  return {
    // setup.injuries: active ones from earlier sessions (read by server.js before the start).
    createState: (setup = {}) => {
      const injuries = (setup.injuries || []).filter((injury) => BODY_PARTS.includes(injury.body_part));
      return {
        plan: null, runner: null, planToAnnounce: false, planRejected: false, advanceAfterTurn: false, change: null, missing: [],
        injuries,
        // Newest first; the last one goes to the prompt, all of them to progression and variety.
        history: setup.history || [],
        lastWorkout: setup.history?.[0] || null,
        startedAt: new Date().toISOString(),
        changes: [],
        // "other" maps to no exercise: the model knows about it, the filter cannot use it.
        avoid: injuries.filter((injury) => injury.body_part !== "other")
          .map((injury) => ({ part: injury.body_part, severity: injury.severity || null })),
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
      const { plan, runner, injuries, lastWorkout } = session.coachState;
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(lastWorkout && !plan ? [{ role: "system", content: lastWorkoutContext(lastWorkout) }] : []),
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
            state.planRejected = true;
            return;
          }
          state.plan = planWorkout(catalog, profile, { avoid: state.avoid, history: state.history });
          state.runner = startRunner(session, state.plan);
          state.planToAnnounce = true;
          engine.record(session, "workout.planned", { profile, exercises: state.plan.exercises.map((item) => item.id) });
          publish(session);
        },
      },
      {
        pattern: /\[NEXT((?: (?:reps|kg)=[\d.,]+)*)\]/g,
        handle(session, [, fields = ""]) {
          if (!session.coachState.runner) return;
          const value = (name) => Number((fields.match(new RegExp(`${name}=([\\d.,]+)`)) || [])[1]?.replace(",", ".")) || null;
          session.coachState.advanceAfterTurn = { reps: value("reps"), kg: value("kg") };
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
            console.warn(`Sesja ${session.id}: znacznik bólu z partią spoza listy („${part}”) — pomijam.`);
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
    onResume: (session) => {
      session.coachState.runner?.resume();
      afterBreak(session);
    },

    // Called by holdPainDuringBreak (below) for what was said during a break.
    holdPain(session, text) {
      const state = session.coachState;
      console.log(`Sesja ${session.id}: wzmianka o bólu w przerwie — przekażę ją po powrocie („${text}”).`);
      engine.record(session, "injury.held_during_break", { text });
      // Saved now, in case the session ends without coming back from the break; the
      // plan changes on the way back. Only what names no clear body part goes to the model.
      const mentions = findInjuryMentions(text);
      for (const mention of mentions) handlePain(session, { ...mention, note: text, quiet: true });
      if (!mentions.length) state.heldPain = [...(state.heldPain || []), text].slice(-3);
    },

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
      // The model wrote no [PAIN ...], but the user clearly named an injury: the
      // safety net catches it (src/coach/body-mentions.js); parts known as bad are skipped.
      const missed = userText ? findInjuryMentions(userText).filter(({ part, severity }) => {
        const known = state.injuries.find((injury) => injury.body_part === part);
        return !known || severityRank(severity) > severityRank(known.severity);
      }) : [];
      if (missed.length) {
        for (const mention of missed) {
          engine.record(session, "injury.caught_without_marker", mention);
          handlePain(session, { ...mention, note: userText });
        }
        return;
      }
      // Without a plan the user would wait for one forever: ask again instead.
      if (state.planRejected) {
        state.planRejected = false;
        await engine.speakText(session, "Nie udało mi się ułożyć planu. Powiedz jeszcze raz: cel, doświadczenie, sprzęt i ile masz czasu.");
        return;
      }
      if (state.change) {
        const change = state.change;
        state.change = null;
        applyChange(session, change);
        return;
      }
      if (state.advanceAfterTurn) {
        const result = state.advanceAfterTurn;
        state.advanceAfterTurn = false;
        state.runner.advance(result);
        return;
      }
      if (!state.planToAnnounce) return;
      state.planToAnnounce = false;
      await engine.speakText(session, describePlan(state.plan));
    },

    workoutEvent,
  };
}

// Wraps the coach after withSessionControl: during a break or the end window the
// engine drops what the user says (only "wracamy" / "kończymy" count), so a
// word about pain would be lost. It is kept for the coach instead (coach.holdPain).
function holdPainDuringBreak(coach) {
  return {
    ...coach,
    beforeTurn(session, userText) {
      const control = session.control || {};
      const onHold = (control.paused || control.endPending) && !control.finishing;
      if (onHold && mentionsInjury(userText)) coach.holdPain(session, userText);
      return coach.beforeTurn(session, userText);
    },
  };
}

module.exports = { createCoach, holdPainDuringBreak, parsePlanMarker, SYSTEM_PROMPT };
