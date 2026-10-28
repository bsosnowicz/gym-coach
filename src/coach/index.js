const { buildCatalog } = require("./exercises");
const { planWorkout, describePlan, toPlanItem, filtersFor, focusOf, GOALS, EQUIPMENT_PRESETS } = require("./planner");
const { EQUIPMENT, GEAR, LEVELS } = require("./exercises");
const { createWorkoutRunner, advanceIntent } = require("./workout");
const { cueBlockedBy } = require("./cues");
const { BODY_PARTS, excludedBy } = require("./exercises");
const { SEVERITIES } = require("./injury-store");
const { findInjuryMentions, mentionsInjury } = require("./body-mentions");
const { recoveryFor, agoText, RECOVERY_HOURS } = require("./schedule");
const { normalizeWords } = require("../engine/words");
const { INTERVIEW_PROMPT, knownProfileContext, parseProfileMarker, describeInterview, weekProfile } = require("./interview");
const { equipmentFromWords, userTexts } = require("./equipment-mentions");
const { buildWeekPlan, describeWeek, planFromDay, dayFor, weekdayOf, describeToday, weekContext } = require("./week-plan");
const { WEEKDAYS, WEEKDAY_NAMES } = require("./programming");

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

// Shared by both conversations (training and the interview).
const PAIN_RULES = `Ból i kontuzje: gdy użytkownik mówi, że coś go boli albo ma uraz (teraz albo w przeszłości,
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
poradź kontakt z lekarzem i dopisz [END].`;

const PERSONA = `Jesteś Gym Coachem, trenerem siłowym w aplikacji głosowej z awatarem.
Rozmawiasz po polsku, naturalnie i konkretnie. Odpowiadasz krótko: jedno lub dwa zdania,
bez list, nagłówków, emotikonów i markdownu. Zadajesz najwyżej jedno pytanie naraz.`;

// One workout planned from a short interview (no weekly plan).
const QUICK_PLAN_RULES = `Na początku poznaj cel treningu, potem doświadczenie użytkownika, dostępny sprzęt
i ile czasu ma na dzisiejszy trening.
Wykorzystuj informacje już podane w historii, zamiast pytać ponownie.
Sprzęt wpisuj tylko z tego, co użytkownik powiedział w tej rozmowie: „siłownia”, „siłka” to gym.
Niczego nie zgaduj: gdy brakuje którejś odpowiedzi, zapytaj o nią. Gdy użytkownik sam podał
wszystkie cztery, a planu jeszcze nie ma, odpowiedz jednym krótkim zdaniem i dopisz na końcu
dokładnie jeden znacznik (aplikacja przeczyta podsumowanie i zapyta, czy układać plan; gdy
użytkownik je poprawia, dopisz znacznik jeszcze raz z poprawionymi wartościami):
[PLAN goal=<cel> level=<poziom> equipment=<sprzęt> minutes=<liczba minut>]
gdzie cel to strength (siła), muscle (masa mięśniowa), endurance (kondycja, wytrzymałość)
albo general (ogólna sprawność); poziom to beginner, intermediate albo expert;
sprzęt to gym (siłownia), home_dumbbells (dom z hantlami lub kettlebell) albo bodyweight
(bez sprzętu). Gdy użytkownik chce popracować nad konkretną partią mięśni, dopisz w znaczniku
focus=<partia>: grupa legs (nogi, „wzmocnienie nóg”, „trening nóg”), back (plecy), arms (ramiona,
ręce), core (brzuch i mięśnie głębokie) albo pojedynczy mięsień: abdominals (brzuch), abductors, adductors, biceps, calves (łydki), chest (klatka),
forearms (przedramiona), glutes (pośladki), hamstrings (tył uda, dwugłowe uda), lats (najszersze
grzbietu), lower_back, middle_back, neck, quadriceps (przód uda, czworogłowe), shoulders (barki),
traps (kaptury), triceps. Planu nie wymyślaj ani nie wymieniaj ćwiczeń: plan ułoży i przeczyta aplikacja.
Najkrótszy plan ma 10 minut: gdy ktoś ma mniej czasu, wpisz minutes=10 i powiedz, że zrobicie krótki trening.`;

// While a workout runs: the app leads, the model reports intents with markers.
const TRAINING_RULES = `Gdy plan już jest, aplikacja sama zapowiada rozgrzewkę, serie, przerwy, koniec przerwy i zmiany
ćwiczeń. Nigdy nie zapowiadaj ich sam ani nie mów, które ćwiczenie i seria są teraz, jeśli nie
pyta o to użytkownik. Nie obiecuj, że aplikacja „zaraz” coś zmieni: znacznik działa od razu. Gdy użytkownik mówi, że skończył rozgrzewkę albo serię, albo chce przejść dalej, odpowiedz
najwyżej jednym krótkim zdaniem i dopisz znacznik [NEXT], a gdy podał wynik serii:
[NEXT reps=<powtórzenia> kg=<ciężar>] (każde pole tylko, jeśli padło). Na pytania o technikę odpowiadaj
krótko, w odniesieniu do aktualnego ćwiczenia.
Zmiany planu robi aplikacja; Ty tylko potwierdzasz jednym krótkim zdaniem i dopisujesz znacznik:
[LIGHTER] gdy ciężar jest za duży („za ciężko”, „zmniejsz”), [HEAVIER] gdy za mały („za lekko”, „dołóż”),
a gdy podał liczbę: [LIGHTER kg=<ciężar>] albo [HEAVIER kg=<ciężar>];
[SWAP] gdy samo ćwiczenie nie pasuje, jest za trudne technicznie albo użytkownik chce inne,
a gdy chce inne na konkretny sprzęt: [SWAP equipment=<barbell|dumbbell|kettlebell|cable|machine|body_only|band>];
[SKIP] gdy chce pominąć ćwiczenie; [FEWER_SETS] gdy chce zrobić mniej serii; [MORE_SETS] gdy więcej;
[REST longer] albo [REST shorter] gdy chce dłuższe albo krótsze przerwy, a z liczbą: [REST seconds=<sekundy>];
[NO_GEAR gear=<sprzęt>] gdy brakuje sprzętu, gdzie sprzęt to bench (ławka), rack (stojak),
pullup_bar (drążek), dip_bars (poręcze), box (podest), ab_wheel (kółko), barbell (sztanga),
dumbbell (hantle), kettlebell, cable (wyciąg) albo machine (maszyny).
Nie wymieniaj sam nowego ćwiczenia: poda je aplikacja.`;

const CAMERA_RULES = `Nie masz obrazu z kamery ani pomiaru ruchu. Nie twierdź, że widzisz technikę,
liczysz powtórzenia lub oceniasz wykonanie ćwiczenia.
Gdy kamera jest włączona, aplikacja sama wypowiada w Twoim imieniu krótkie uwagi
o postawie, np. "Stań prosto, barki nad biodrami.". Możesz do nich nawiązać,
ale nie dopowiadaj własnej oceny ruchu.`;

// A session with a weekly plan: a short check-in, then today's day of the plan.
const WEEK_DAY_RULES = `Użytkownik ma już plan na cały tydzień, ułożony przez aplikację; nie przeprowadzaj
wywiadu od nowa. Na początku przywitaj się, powiedz jednym zdaniem, co dziś w planie, i zapytaj,
jak się dziś czuje i czy ma tyle czasu co zwykle. Gdy jest gotowy zacząć, dopisz znacznik [TODAY];
gdy ma dziś mniej czasu: [TODAY minutes=<minuty>]; gdy chce zrobić inny dzień planu:
[TODAY day=<mon|tue|wed|thu|fri|sat|sun>]. Planu nie wymyślaj ani nie wymieniaj ćwiczeń: przeczyta
je aplikacja. Gdy chce zmienić cały plan (inny cel, inne dni, nowy wywiad), a trening jeszcze się
nie zaczął albo już się skończył, dopisz [NEW_PLAN]. Zmiany ćwiczeń w trakcie treningu aplikacja zapisuje
jako kolejny wariant planu (B, C…), a poprzedni zostaje; gdy użytkownik chce wrócić do innego wariantu
(„wróć do wariantu A”, „poprzednia wersja planu” to A), dopisz [VARIANT name=<litera>].`;

const WEEK_PROMPT = `${PERSONA}\n${WEEK_DAY_RULES}\n${TRAINING_RULES}\n${PAIN_RULES}\n${CAMERA_RULES}\nWiadomość "[EVENT: session_start]" oznacza początek sesji: przedstaw się krótko jako Gym Coach, powiedz, co dziś w planie, i zapytaj, jak się czuje.`;

const SYSTEM_PROMPT = `${PERSONA}\n${QUICK_PLAN_RULES}\n${TRAINING_RULES}\n${PAIN_RULES}\n${CAMERA_RULES}\nWiadomość "[EVENT: session_start]" oznacza początek sesji: przedstaw się krótko
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
  // A focus outside the list is dropped, not the whole plan.
  const focus = focusOf(fields.focus) ? fields.focus : null;
  return { goal: fields.goal, level: fields.level, equipment: fields.equipment, minutes, focus, fresh: fields.fresh === "yes" };
}

const PHASE_TEXT = {
  ready: "plan ogłoszony, czekamy na start rozgrzewki",
  warmup: "trwa rozgrzewka",
  set: "trwa seria",
  rest: "przerwa między seriami",
  ready_set: "koniec przerwy, aplikacja zapytała, czy użytkownik jest gotowy na serię",
  done: "trening zakończony",
};

// What the model is told about the plan in every turn after it exists.
function planContext(plan, progress) {
  const items = plan.exercises.map((item, index) =>
    `${index + 1}. ${item.name}: ${item.sets} × ${item.reps ? `${item.reps} powt.` : `${item.seconds} s`}, przerwa ${item.restS} s`);
  const item = plan.exercises[progress.exerciseIndex];
  const now = ["set", "rest", "ready_set"].includes(progress.phase)
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
// A returning user is not interviewed from scratch: goal and level are known.
function lastWorkoutContext(last) {
  const names = (last.exercises || []).map((item) => item.name).join(", ");
  const planned = (last.exercises || []).reduce((sum, item) => sum + (item.sets || 0), 0);
  const day = String(last.started_at || "").slice(0, 10);
  const known = last.profile
    ? ` Znane z poprzedniego treningu: goal=${last.profile.goal} level=${last.profile.level} equipment=${last.profile.equipment}`
      + `${last.profile.focus ? ` focus=${last.profile.focus}` : ""}.`
    : "";
  return `Poprzedni trening (${day}): ${names || "bez planu"}; zrobione serie: ${(last.sets || []).length} z ${planned}`
    + `${last.finished ? "" : ", nieukończony"}.${known} To kolejny trening: nie pytaj o doświadczenie ani o cel, `
    + "chyba że użytkownik sam chce coś zmienić. Zapytaj krótko, jak się dziś czuje, jaki ma dziś sprzęt i ile czasu, "
    + "i czy robimy to samo co ostatnio. Gdy chce nowy plan („ułóż nowy plan”, „coś innego”), dopisz w znaczniku fresh=yes.";
}

// What the journal keeps besides sets: how the plan changed during the session.
const CHANGE_EVENTS = new Set(["workout.replaced", "workout.skipped", "workout.removed", "workout.fewer_sets"]);
// Changes that make a new variant of the weekly plan; skipping or fewer sets is for today only.
const VARIANT_EVENTS = new Set(["workout.replaced", "workout.removed"]);
const nextLetter = (letters) => String.fromCharCode(Math.max(...letters.map((letter) => letter.charCodeAt(0))) + 1);

// Timers of a session that has ended must not keep the process (or a test) alive.
const unrefTimer = (fn, ms) => {
  const timer = setTimeout(fn, ms);
  timer.unref?.();
  return timer;
};

// Phrases Whisper invents on silence; they come from subtitle credits in its training data.
// The interview read back before the plan is built: what the model understood.
const GOAL_NAMES = { strength: "siła", muscle: "masa mięśniowa", endurance: "kondycja", general: "ogólna sprawność" };
const LEVEL_NAMES = { beginner: "początkujący", intermediate: "średniozaawansowany", expert: "zaawansowany" };
const EQUIPMENT_NAMES = { gym: "siłownia", home_dumbbells: "dom z hantlami", bodyweight: "bez sprzętu" };

// recovery: { hours } when the same muscles were trained less than 48 h ago.
function describeProfile(profile, recovery = null) {
  const focus = profile.focus ? `, skupiamy się na: ${focusOf(profile.focus).name}` : "";
  const fresh = profile.fresh ? ", nowy plan" : "";
  const rest = recovery
    ? ` Uwaga: te mięśnie trenowałeś ${agoText(recovery.hours)}, a regeneracja trwa około ${RECOVERY_HOURS} godzin. `
      + "Możemy wybrać inną partię albo trenować bez podnoszenia ciężarów."
    : "";
  return `Podsumuję: cel ${GOAL_NAMES[profile.goal]}, poziom ${LEVEL_NAMES[profile.level]}, `
    + `${EQUIPMENT_NAMES[profile.equipment]}, ${profile.minutes} minut${focus}${fresh}.${rest} Układam plan?`;
}

// A short yes to the summary; anything longer or with "nie"/"ale" is a correction for the model.
const YES_WORDS = new Set(["tak", "dobrze", "ok", "okej", "okay", "jasne", "pewnie", "ukladaj", "zgadza", "pasuje",
  "dawaj", "lecimy", "super", "swietnie", "mozemy", "prosze", "jasne"]);
// A short no: "nie", "nie trzeba", "zostaw", "zostajemy".
function noIntent(text) {
  const words = normalizeWords(text);
  return words.length > 0 && words.length <= 4
    && (words[0] === "nie" || words.some((word) => word.startsWith("zostaw") || word.startsWith("zostaj")));
}

const READY_WORDS = /^(jestem|gotow\w*|dawaj|start|zaczynam\w*|moge|mozemy)( gotow\w*)?$/;
function yesIntent(text) {
  const words = normalizeWords(text);
  return words.length > 0 && words.length <= 5 && !words.includes("nie") && !words.includes("ale")
    && words.some((word) => YES_WORDS.has(word));
}

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
// plans: src/coach/plan-store.js (profile and weekly plans), or null without Supabase.
function createCoach({
  voiceId, language = "pl", catalog = buildCatalog(), engine = require("../engine"),
  injuries: injuryStore = null, workoutLog = null, plans: planStore = null,
}) {
  // The workout as the page shows it; sent on every change and to a page that (re)joins.
  function workoutEvent(session) {
    const { plan, runner } = session.coachState;
    return { stage: "workout", workout: plan ? { plan, progress: runner.snapshot() } : null };
  }

  // The weekly plan for the calendar; sent when it changes and to a page that (re)joins.
  function weekEvent(session) {
    const { mode, weekPlan } = session.coachState;
    return { stage: "week_plan", mode, week: weekPlan };
  }

  // Today's workout from the weekly plan ([TODAY], or yes right after the interview).
  // weekday: another day of the plan; minutes: less time today.
  function startToday(session, { weekday = null, minutes = null } = {}) {
    const state = session.coachState;
    const { weekPlan } = state;
    const day = (weekday && weekPlan.days.find((item) => item.weekday === weekday)) || dayFor(weekPlan, weekdayOf()).day;
    const recovery = recoveryFor({ ...weekPlan.profile, focus: day.focus }, state.history, { catalog, focusOf });
    state.plan = planFromDay(catalog, weekPlan, day, { history: state.history, avoid: state.avoid, tired: Boolean(recovery), minutes });
    state.runner = startRunner(session, state.plan);
    engine.record(session, "workout.planned", { day: `${day.weekday}:${day.type}`, variant: weekPlan.variant, exercises: state.plan.exercises.map((item) => item.id) });
    publish(session);
    engine.speakText(session, describeToday(state.plan));
  }

  // A change of exercises in a day of the weekly plan: the plan as it is now
  // becomes variant B (C, …) and A stays; on a variant the variant is
  // overwritten. Saved in the order of changes; the user hears it at the end.
  function saveTodayVariant(session) {
    const state = session.coachState;
    const { weekPlan, plan } = state;
    const at = weekPlan.days.findIndex((day) => day.weekday === plan.day.weekday && day.type === plan.day.type);
    if (at < 0) return;
    const original = weekPlan.days[at].exercises;
    const exercises = plan.exercises.map((item) => {
      const kept = original.find((old) => old.id === item.id);
      if (kept) return kept;
      const { kg, progress, ...rest } = item;
      return rest;
    });
    const days = weekPlan.days.map((day, index) => (index === at ? { ...day, exercises } : day));
    state.variants ??= [weekPlan];
    let local;
    if (weekPlan.variant === "A") {
      local = { ...weekPlan, days, id: null, variant: nextLetter(state.variants.map((item) => item.variant)), parentId: weekPlan.id };
      state.variants.push(local);
    } else {
      local = { ...weekPlan, days };
      state.variants = state.variants.map((item) => (item.variant === local.variant ? local : item));
    }
    state.weekPlan = local;
    state.variantNote = `Zmiany z dzisiaj zapisałem w planie jako wariant ${local.variant}, a wariant A zostaje. `
      + "Jeśli wolisz poprzedni, powiedz: wróć do wariantu A.";
    engine.record(session, "week.variant", { variant: local.variant, day: `${plan.day.weekday}:${plan.day.type}` });
    engine.emit(session, weekEvent(session));
    if (!planStore) return;
    state.variantSave = (state.variantSave || Promise.resolve()).then(async () => {
      const base = state.storedPlan;
      if (!base?.id) return;
      const saved = await planStore.saveVariant(base, days);
      engine.record(session, saved ? "week.variant_saved" : "week.variant_save_failed", { variant: local.variant });
      if (!saved) return;
      state.storedPlan = saved;
      if (state.weekPlan === local) state.weekPlan = { ...local, id: saved.id, parentId: saved.parentId, variant: saved.variant };
    });
  }

  // [VARIANT name=A]: another variant of the plan becomes the active one.
  async function switchVariant(session, letter) {
    const state = session.coachState;
    let target = null;
    if (planStore && state.storedPlan?.id) {
      await state.variantSave;
      const saved = await planStore.activateVariant(state.storedPlan, letter);
      if (saved) {
        state.storedPlan = saved;
        target = { ...saved, conflicts: [] };
      }
    } else {
      target = (state.variants || []).find((item) => item.variant === letter) || null;
    }
    if (!target) {
      engine.record(session, "week.variant_missing", { variant: letter });
      engine.speakText(session, `Nie mam wariantu ${letter} tego planu. Zostajemy przy wariancie ${state.weekPlan.variant}.`);
      return;
    }
    state.weekPlan = target;
    state.variantNote = null;
    engine.record(session, "week.variant_active", { variant: letter });
    engine.emit(session, weekEvent(session));
    engine.speakText(session, `Dobrze, wracamy do wariantu ${letter}.`);
  }

  // [NEW_PLAN] or the page's button: the interview again, with the known profile.
  function startInterview(session) {
    const state = session.coachState;
    state.mode = "interview";
    engine.record(session, "week.interview_started", {});
    engine.emit(session, weekEvent(session));
    engine.speakText(session, state.profile
      ? "Dobrze, układamy nowy plan. Co się zmieniło: cel, dni treningowe, czas czy sprzęt?"
      : "Dobrze, układamy nowy plan. Jaki masz cel treningu?");
  }

  // The interview's yes: the week is built, shown and kept (profile and plan, variant A).
  function buildWeek(session, profile) {
    const state = session.coachState;
    const built = buildWeekPlan(catalog, weekProfile(profile), { avoid: state.avoid });
    state.profile = profile;
    state.weekPlan = { ...built, id: null, variant: "A", parentId: null, startedAt: new Date().toISOString() };
    // From here on the session is a training one: today's day can start right away.
    state.mode = "training";
    state.offerToday = true;
    engine.record(session, "week.planned", { split: built.split, intensity: built.intensity, days: built.days.map((day) => `${day.weekday}:${day.type}`) });
    engine.emit(session, weekEvent(session));
    if (!planStore) return;
    planStore.saveProfile(profile);
    planStore.savePlan(built).then((saved) => {
      engine.record(session, saved ? "week.saved" : "week.save_failed", {});
      // The id lets changes during a workout become variant B of this plan.
      if (!saved) return;
      state.storedPlan = saved;
      if (state.weekPlan?.days === built.days) state.weekPlan = { ...state.weekPlan, ...saved, conflicts: built.conflicts };
    });
  }

  // The model's equipment against the user's own words: one clear kind of
  // place said ("na siłowni") wins over what the marker says.
  function checkEquipment(session, profile) {
    const said = equipmentFromWords(userTexts(session.history));
    if (!said || said === profile.equipment) return profile;
    engine.record(session, "profile.equipment_corrected", { marker: profile.equipment, said });
    console.warn(`Sesja ${session.id}: znacznik ma sprzęt „${profile.equipment}”, a użytkownik mówił o „${said}” — biorę „${said}”.`);
    return { ...profile, equipment: said };
  }

  function queueChange(session, change) {
    if (session.coachState.runner) session.coachState.change = change;
  }

  // The best replacement for plan entry `index` that is not in the plan already.
  // easier: "za ciężko" — no harder than the original when anything that easy fits.
  // equipment: "zamień na hantle" — only exercises on that equipment.
  function replacementFor(state, index, { easier = false, equipment = null } = {}) {
    const { plan } = state;
    const old = plan.exercises[index];
    const inPlan = new Set(plan.exercises.map((item) => item.id));
    const filters = filtersFor(plan.profile, { avoid: state.avoid, missing: state.missing });
    const candidates = catalog.substitutes(old.id, filters)
      .filter((candidate) => !inPlan.has(candidate.id) && (!equipment || candidate.equipment === equipment));
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
      else if (isCurrent && ["set", "rest", "ready_set"].includes(runner.progress.phase)) spoken = runner.skip({ lead }) || spoken;
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
    else if (change.kind === "more_sets") runner.moreSets();
    else if (change.kind === "rest") runner.changeRest(change);
    else if (change.kind === "weight") {
      if (runner.changeWeight(change)) return;
      // An exercise without a weight (push-ups): "za ciężko" gets an easier one.
      if (!change.up) applyChange(session, { kind: "swap" });
      else engine.speakText(session, "To ćwiczenie robimy bez obciążenia. Żeby było trudniej, zwolnij tempo opuszczania albo dołóż dwa powtórzenia.");
    } else if (change.kind === "swap") {
      const item = replacementFor(state, index, { easier: true, equipment: change.equipment });
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

  function buildPlan(session, profile) {
    const state = session.coachState;
    state.plan = planWorkout(catalog, profile, {
      avoid: state.avoid, history: state.history, fresh: profile.fresh, tired: Boolean(state.recovery),
    });
    state.runner = startRunner(session, state.plan);
    engine.record(session, "workout.planned", { profile, exercises: state.plan.exercises.map((item) => item.id) });
    publish(session);
  }

  function startRunner(session, plan) {
    return createWorkoutRunner(plan, {
      speak: (text) => { if (!session.closed) engine.speakText(session, text); },
      publish: () => { if (!session.closed) publish(session); },
      record: (type, payload) => {
        engine.record(session, type, payload);
        if (CHANGE_EVENTS.has(type)) noteChange(session, type, payload);
        if (VARIANT_EVENTS.has(type) && session.coachState.weekPlan && plan.day) saveTodayVariant(session);
      },
      canSpeakNow: () => !cueBlockedBy(session),
      finishNote: () => session.coachState.variantNote || "",
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
        // interview: getting to know the user and building the weekly plan; training: a workout.
        mode: setup.mode === "interview" ? "interview" : "training",
        profile: setup.profile || null,
        weekPlan: setup.weekPlan || null,
        // The active plan as the database has it (with its id): the base for variants.
        storedPlan: setup.weekPlan?.id ? setup.weekPlan : null,
        pendingWeekProfile: null,
        plan: null, runner: null, pendingProfile: null, profileToConfirm: false, planRejected: false, advanceAfterTurn: false, change: null, missing: [],
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
      const { plan, runner, injuries, lastWorkout, mode, profile, weekPlan } = session.coachState;
      if (mode === "interview") {
        const messages = [
          { role: "system", content: `${INTERVIEW_PROMPT}\n${PAIN_RULES}` },
          ...(profile ? [{ role: "system", content: knownProfileContext(profile) }] : []),
          ...(injuries.length ? [{ role: "system", content: injuryContext(injuries) }] : []),
          ...session.history,
        ];
        if (userText === null) messages.push({ role: "user", content: "[EVENT: session_start]" });
        return messages;
      }
      const messages = [
        { role: "system", content: weekPlan ? WEEK_PROMPT : SYSTEM_PROMPT },
        ...(lastWorkout && !plan && !weekPlan ? [{ role: "system", content: lastWorkoutContext(lastWorkout) }] : []),
        ...(injuries.length ? [{ role: "system", content: injuryContext(injuries) }] : []),
        ...(weekPlan && !plan ? [{ role: "system", content: weekContext(weekPlan, weekdayOf()) }] : []),
        ...(plan ? [{ role: "system", content: planContext(plan, runner.progress) }] : []),
        ...session.history,
      ];
      if (userText === null) messages.push({ role: "user", content: "[EVENT: session_start]" });
      return messages;
    },

    markers: [
      {
        pattern: /\[PROFILE ([^\]]*)\]/g,
        handle(session, [, fields]) {
          const state = session.coachState;
          if (state.mode !== "interview") return;
          const parsed = parseProfileMarker(fields);
          const profile = parsed && checkEquipment(session, parsed);
          if (!profile) {
            engine.record(session, "week.profile_rejected", { marker: fields });
            console.warn(`Sesja ${session.id}: znacznik profilu bez poprawnych pól („${fields}”).`);
            state.planRejected = true;
            return;
          }
          state.pendingWeekProfile = profile;
          state.profileToConfirm = true;
          engine.record(session, "week.profile", { profile });
        },
      },
      {
        pattern: PLAN_MARKER,
        handle(session, [, fields]) {
          const state = session.coachState;
          if (state.plan) return;
          const parsed = parsePlanMarker(fields);
          const profile = parsed && checkEquipment(session, parsed);
          if (!profile) {
            engine.record(session, "workout.plan_rejected", { marker: fields });
            console.warn(`Sesja ${session.id}: znacznik planu bez poprawnych pól („${fields}”).`);
            state.planRejected = true;
            return;
          }
          // Not built yet: the coach reads back what it understood and waits for a yes.
          state.pendingProfile = profile;
          state.recovery = recoveryFor(profile, state.history, { catalog, focusOf });
          state.profileToConfirm = true;
          engine.record(session, "workout.profile", { profile });
        },
      },
      {
        pattern: /\[TODAY([^\]]*)\]/g,
        handle(session, [, fields = ""]) {
          const state = session.coachState;
          if (!state.weekPlan || state.plan) return;
          const weekday = (fields.match(/day=(\w+)/) || [])[1];
          const minutes = Number((fields.match(/minutes=(\d+)/) || [])[1]) || null;
          state.todayAfterTurn = {
            weekday: WEEKDAYS.includes(weekday) ? weekday : null,
            minutes: minutes ? Math.min(180, Math.max(10, minutes)) : null,
          };
        },
      },
      {
        pattern: /\[VARIANT name=([A-Za-z])\]/g,
        handle(session, [, letter]) {
          const state = session.coachState;
          if (!state.weekPlan) return;
          if (state.runner && !["ready", "done"].includes(state.runner.progress.phase)) {
            engine.record(session, "week.variant_rejected", { phase: state.runner.progress.phase });
            return;
          }
          state.variantAfterTurn = letter.toUpperCase();
        },
      },
      {
        pattern: /\[NEW_PLAN\]/g,
        handle(session) {
          const state = session.coachState;
          // Not in the middle of a workout: the plan in progress would be lost.
          if (state.runner && !["ready", "done"].includes(state.runner.progress.phase)) {
            engine.record(session, "week.new_plan_rejected", { phase: state.runner.progress.phase });
            return;
          }
          state.newPlanAfterTurn = true;
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
      {
        pattern: /\[SWAP(?: equipment=(\w+))?\]/g,
        handle: (session, [, equipment]) => queueChange(session, { kind: "swap", equipment: EQUIPMENT.includes(equipment) ? equipment : null }),
      },
      {
        pattern: /\[(LIGHTER|HEAVIER)(?: kg=([\d.,]+))?\]/g,
        handle: (session, [, way, kg]) => queueChange(session, { kind: "weight", up: way === "HEAVIER", kg: Number(kg?.replace(",", ".")) || null }),
      },
      { pattern: /\[MORE_SETS\]/g, handle: (session) => queueChange(session, { kind: "more_sets" }) },
      {
        pattern: /\[REST(?: (longer|shorter))?(?: seconds=(\d+))?\]/g,
        handle: (session, [, way, seconds]) => queueChange(session, { kind: "rest", longer: way !== "shorter", seconds: Number(seconds) || null }),
      },
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
      const state = session.coachState;
      if (state.pendingWeekProfile) {
        const profile = state.pendingWeekProfile;
        state.pendingWeekProfile = null;
        if (!yesIntent(userText)) return undefined;
        buildWeek(session, profile);
        const { day, planned } = dayFor(state.weekPlan, weekdayOf());
        engine.speakText(session, `${describeWeek(state.weekPlan)} ${planned
          ? "Zaczynamy dzisiejszy trening?"
          : `Dziś nie masz treningu w planie, najbliższy jest ${WEEKDAY_NAMES[day.weekday]}. Zrobimy go dziś?`}`);
        return { handled: true };
      }
      // Right after the weekly plan: "tak" starts today's day without the model.
      if (state.offerToday && !state.plan) {
        state.offerToday = false;
        if (yesIntent(userText) || READY_WORDS.test(normalizeWords(userText).join(" "))) {
          startToday(session);
          return { handled: true };
        }
      }
      if (state.pendingProfile && !state.plan) {
        if (yesIntent(userText)) {
          buildPlan(session, state.pendingProfile);
          state.pendingProfile = null;
          engine.speakText(session, describePlan(state.plan));
          return { handled: true };
        }
        // A correction: the model asks or writes the marker again with the new values.
        state.pendingProfile = null;
        return undefined;
      }
      const { runner } = state;
      // The weight question after a set far off the target: yes / no in code.
      if (runner?.pendingAdjust) {
        if (yesIntent(userText)) return runner.adjust(true) && { handled: true };
        if (noIntent(userText)) return runner.adjust(false) && { handled: true };
      }
      // After the rest: "tak", "jestem", "dawaj" start the set as well as "gotowe".
      const ready = runner?.progress.phase === "ready_set" && (yesIntent(userText) || READY_WORDS.test(normalizeWords(userText).join(" ")));
      const intent = runner && (advanceIntent(userText) || (ready ? { reps: null, kg: null } : null));
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
        await engine.speakText(session, state.mode === "interview"
          ? "Nie udało mi się ułożyć planu. Powiedz jeszcze raz: cel, doświadczenie, ile dni w tygodniu, ile minut i jaki masz sprzęt."
          : "Nie udało mi się ułożyć planu. Powiedz jeszcze raz: cel, doświadczenie, sprzęt i ile masz czasu.");
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
      if (state.todayAfterTurn) {
        const today = state.todayAfterTurn;
        state.todayAfterTurn = null;
        startToday(session, today);
        return;
      }
      if (state.variantAfterTurn) {
        const letter = state.variantAfterTurn;
        state.variantAfterTurn = null;
        await switchVariant(session, letter);
        return;
      }
      if (state.newPlanAfterTurn) {
        state.newPlanAfterTurn = false;
        state.runner?.stop();
        state.plan = null;
        state.runner = null;
        startInterview(session);
        return;
      }
      if (state.profileToConfirm) {
        state.profileToConfirm = false;
        await engine.speakText(session, state.pendingWeekProfile
          ? describeInterview(state.pendingWeekProfile)
          : describeProfile(state.pendingProfile, state.recovery));
      }
    },

    workoutEvent,
    weekEvent,
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

module.exports = { createCoach, holdPainDuringBreak, parsePlanMarker, SYSTEM_PROMPT, PAIN_RULES };
