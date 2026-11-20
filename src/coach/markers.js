// The markers the model writes ([PLAN …], [NEXT], [PAIN …]): each handler only
// notes the intent in session.coachState; the coach acts on it after the turn.
const { focusOf, GOALS, EQUIPMENT_PRESETS } = require("./planner");
const { EQUIPMENT, GEAR, BODY_PARTS } = require("./exercises");
const { SEVERITIES } = require("./injury-store");
const { recoveryFor } = require("./schedule");
const { parseProfileMarker } = require("./interview");
const { equipmentFromWords, userTexts } = require("./equipment-mentions");
const { WEEKDAYS } = require("./programming");

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

// engine: record of src/engine, the same one the coach uses.
function createMarkers({ engine, catalog }) {
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
  return [
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
  ];
}

module.exports = { createMarkers, parsePlanMarker };
