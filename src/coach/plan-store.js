// The user's profile from the interview and their weekly plans in Supabase
// (tables user_profiles and training_plans, supabase/migrations/).
//
// Variants: a new interview saves variant A. The first change made during a
// workout on A keeps A and saves B (then C, …) with parent_id = A; further
// changes on a variant overwrite that variant, so one bad day does not breed
// a new letter each set. Only one plan per user is active; switching
// ("wróć do wariantu A") moves the flag.
//
// As with injuries, a failing database never stops a session: reads come
// back empty, writes are logged and return null.

const { createSupabase } = require("./supabase");

const PROFILE_COLUMNS = {
  age: "age", sex: "sex", heightCm: "height_cm", weightKg: "weight_kg", level: "level", goal: "goal",
  daysPerWeek: "days_per_week", weekdays: "weekdays", minutes: "session_minutes", equipment: "equipment",
  priorities: "priorities",
};

function toProfile(row) {
  if (!row) return null;
  const profile = {};
  for (const [key, column] of Object.entries(PROFILE_COLUMNS)) profile[key] = row[column] ?? null;
  if (profile.weightKg != null) profile.weightKg = Number(profile.weightKg);
  return profile;
}

function toPlan(row) {
  if (!row) return null;
  return {
    id: row.id, split: row.split_type, intensity: row.intensity, goal: row.goal, level: row.level,
    variant: row.variant, parentId: row.parent_id || null, active: row.active, days: row.days || [], profile: row.profile || {},
    startedAt: row.started_at, createdAt: row.created_at,
  };
}

const nextLetter = (letters) => String.fromCharCode(Math.max(...letters.map((letter) => letter.charCodeAt(0))) + 1);

function createPlanStore({ url, serviceKey, userId, fetchImpl = fetch, log = console } = {}) {
  const supabase = createSupabase({ url, serviceKey, fetchImpl });
  if (!supabase) return null;
  const { request } = supabase;
  const user = encodeURIComponent(userId);
  const json = { "Content-Type": "application/json" };

  async function read(resource, what) {
    try {
      return await (await request(resource)).json();
    } catch (error) {
      log.warn(`${what}: odczyt nieudany — ${error.message}`);
      return [];
    }
  }

  async function deactivateAll() {
    await request(`training_plans?user_id=eq.${user}&active=eq.true`, {
      method: "PATCH", headers: { ...json, Prefer: "return=minimal" }, body: JSON.stringify({ active: false }),
    });
  }

  async function insert(plan) {
    await deactivateAll();
    const response = await request("training_plans", {
      method: "POST",
      headers: { ...json, Prefer: "return=representation" },
      body: JSON.stringify([{
        user_id: userId, split_type: plan.split, intensity: plan.intensity, goal: plan.goal ?? null,
        level: plan.level ?? null, variant: plan.variant || "A", parent_id: plan.parentId || null,
        active: true, days: plan.days, profile: plan.profile || {}, started_at: plan.startedAt || new Date().toISOString(),
      }]),
    });
    return toPlan((await response.json())[0]);
  }

  return {
    userId,

    async profile() {
      return toProfile((await read(`user_profiles?user_id=eq.${user}&select=*`, "Profil"))[0]);
    },

    async saveProfile(profile) {
      const row = { user_id: userId, updated_at: new Date().toISOString() };
      for (const [key, column] of Object.entries(PROFILE_COLUMNS)) if (profile[key] !== undefined) row[column] = profile[key];
      try {
        await request("user_profiles?on_conflict=user_id", {
          method: "POST", headers: { ...json, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([row]),
        });
        return true;
      } catch (error) {
        log.warn(`Profil: zapis nieudany — ${error.message}`);
        return false;
      }
    },

    async activePlan() {
      return toPlan((await read(`training_plans?user_id=eq.${user}&active=eq.true&select=*&limit=1`, "Plan"))[0]);
    },

    // A new plan from the interview: variant A, active from now.
    async savePlan(plan) {
      try {
        return await insert({ ...plan, variant: "A", parentId: null, startedAt: null });
      } catch (error) {
        log.warn(`Plan: zapis nieudany — ${error.message}`);
        return null;
      }
    },

    // The plan with changed days: a new variant of A, or the same variant overwritten.
    async saveVariant(plan, days) {
      try {
        if (plan.parentId) {
          const response = await request(`training_plans?id=eq.${plan.id}&user_id=eq.${user}`, {
            method: "PATCH", headers: { ...json, Prefer: "return=representation" }, body: JSON.stringify({ days }),
          });
          return toPlan((await response.json())[0]);
        }
        const siblings = await (await request(`training_plans?user_id=eq.${user}&or=(id.eq.${plan.id},parent_id.eq.${plan.id})&select=variant`)).json();
        const variant = nextLetter(siblings.map((row) => row.variant).concat("A"));
        return await insert({ ...plan, days, variant, parentId: plan.id });
      } catch (error) {
        log.warn(`Plan: zapis wariantu nieudany — ${error.message}`);
        return null;
      }
    },

    // Makes variant `letter` of the plan family active ("wróć do wariantu A").
    async activateVariant(plan, letter) {
      const root = plan.parentId || plan.id;
      try {
        const rows = await (await request(`training_plans?user_id=eq.${user}&or=(id.eq.${root},parent_id.eq.${root})&variant=eq.${encodeURIComponent(letter)}&select=*`)).json();
        if (!rows.length) return null;
        await deactivateAll();
        const response = await request(`training_plans?id=eq.${rows[0].id}&user_id=eq.${user}`, {
          method: "PATCH", headers: { ...json, Prefer: "return=representation" }, body: JSON.stringify({ active: true }),
        });
        return toPlan((await response.json())[0]);
      } catch (error) {
        log.warn(`Plan: zmiana wariantu nieudana — ${error.message}`);
        return null;
      }
    },
  };
}

module.exports = { createPlanStore, toPlan, toProfile };
