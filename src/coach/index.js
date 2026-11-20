const { buildCatalog } = require("./exercises");
const { planWorkout, describePlan, toPlanItem, filtersFor, focusOf } = require("./planner");
const { LEVELS } = require("./exercises");
const { createWorkoutRunner, advanceIntent } = require("./workout");
const { cueBlockedBy } = require("./cues");
const { BODY_PARTS, excludedBy } = require("./exercises");
const { SEVERITIES } = require("./injury-store");
const { findInjuryMentions, mentionsInjury } = require("./body-mentions");
const { recoveryFor } = require("./schedule");
const { normalizeWords } = require("../engine/words");
const { INTERVIEW_PROMPT, knownProfileContext, describeInterview, weekProfile } = require("./interview");
const { breakOverIntent } = require("./end-guard");
const { buildWeekPlan, describeWeek, planFromDay, dayFor, weekdayOf, describeToday, weekContext } = require("./week-plan");
const { WEEKDAY_NAMES } = require("./programming");
const {
  BODY_PART_NAMES, PAIN_RULES, WEEK_PROMPT, SYSTEM_PROMPT,
  planContext, injuryContext, lastWorkoutContext, describeProfile,
} = require("./prompts");
const { yesIntent, noIntent, READY_WORDS, STT_HALLUCINATIONS, COURTESY_WORDS } = require("./speech-words");
const { createMarkers, parsePlanMarker } = require("./markers");

const severityRank = (severity) => SEVERITIES.indexOf(severity);

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

    markers: createMarkers({ engine, catalog }),

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
      const ready = (runner?.progress.phase === "ready_set" && (yesIntent(userText) || READY_WORDS.test(normalizeWords(userText).join(" "))))
        // "Koniec przerwy" during a rest between sets: the next set, not the end of the session.
        || (["rest", "ready_set"].includes(runner?.progress.phase) && breakOverIntent(userText));
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
