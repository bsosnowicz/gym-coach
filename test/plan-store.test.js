// Profile and weekly plans in Supabase (src/coach/plan-store.js): a new
// interview saves variant A and makes it the only active plan; a change
// during a workout keeps A and saves B; changes on B overwrite B; "wróć do
// wariantu A" moves the active flag back. A failing database gives empty reads.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createPlanStore } = require("../src/coach/plan-store");

const quiet = { warn() {} };

// A tiny PostgREST over one array per table: enough of eq/or filters for the store.
function fakeDb() {
  const tables = { user_profiles: [], training_plans: [] };
  const calls = [];
  let ids = 0;
  const matches = (row, params) => [...params].every(([key, value]) => {
    if (["select", "limit", "on_conflict", "order"].includes(key)) return true;
    if (key === "or") {
      return value.slice(1, -1).split(",").some((part) => {
        const [column, , wanted] = part.split(".");
        return String(row[column]) === wanted;
      });
    }
    return String(row[key]) === value.replace(/^eq\./, "");
  });
  async function fetchImpl(url, options = {}) {
    const { pathname, searchParams } = new URL(url);
    const table = pathname.split("/").pop();
    const method = options.method || "GET";
    calls.push({ method, table, url });
    const rows = tables[table];
    if (method === "GET") return new Response(JSON.stringify(rows.filter((row) => matches(row, searchParams))));
    const body = JSON.parse(options.body);
    if (method === "PATCH") {
      const changed = rows.filter((row) => matches(row, searchParams));
      for (const row of changed) Object.assign(row, body);
      return new Response(JSON.stringify(changed));
    }
    const inserted = body.map((row) => {
      if (table === "user_profiles") {
        const existing = rows.find((old) => old.user_id === row.user_id);
        if (existing) return Object.assign(existing, row);
      } else {
        if (row.active && rows.some((old) => old.user_id === row.user_id && old.active)) throw new Error("dwa aktywne plany");
        ids += 1;
        row = { id: `p${ids}`, created_at: new Date().toISOString(), ...row };
      }
      rows.push(row);
      return row;
    });
    return new Response(JSON.stringify(inserted), { status: 201 });
  }
  return { tables, calls, fetchImpl };
}

const week = [{ weekday: "mon", type: "upper", focus: "upper", exercises: [{ id: "a", sets: 3, reps: 10, restS: 120 }] }];

test("Plan store: bez SUPABASE_* go nie ma", () => {
  assert.equal(createPlanStore({ userId: "u" }), null);
});

test("Profil: zapis i odczyt z nazwami kolumn w bazie", async () => {
  const db = fakeDb();
  const store = createPlanStore({ url: "https://db.example", serviceKey: "k", userId: "u1", fetchImpl: db.fetchImpl, log: quiet });
  assert.equal(await store.profile(), null);
  await store.saveProfile({ age: 31, sex: "male", heightCm: 182, weightKg: 84.5, level: "intermediate", goal: "muscle", daysPerWeek: 4, weekdays: ["mon", "tue", "thu", "fri"], minutes: 60, equipment: "gym", priorities: ["chest"] });
  assert.equal(db.tables.user_profiles[0].height_cm, 182);
  assert.equal(db.tables.user_profiles[0].session_minutes, 60);
  const profile = await store.profile();
  assert.equal(profile.weightKg, 84.5);
  assert.deepEqual(profile.weekdays, ["mon", "tue", "thu", "fri"]);
  await store.saveProfile({ weightKg: 83 });
  assert.equal(db.tables.user_profiles.length, 1);
  assert.equal((await store.profile()).age, 31, "częściowy zapis nie kasuje reszty");
});

test("Warianty: nowy plan to A; zmiana w treningu — B obok A; zmiana na B nadpisuje B; powrót do A", async () => {
  const db = fakeDb();
  const store = createPlanStore({ url: "https://db.example", serviceKey: "k", userId: "u1", fetchImpl: db.fetchImpl, log: quiet });
  const a = await store.savePlan({ split: "upper_lower", intensity: "moderate", goal: "muscle", level: "intermediate", days: week });
  assert.equal(a.variant, "A");
  assert.equal(a.parentId, null);
  assert.equal((await store.activePlan()).id, a.id);

  const changed = [{ ...week[0], exercises: [{ id: "b", sets: 3, reps: 10, restS: 120 }] }];
  const b = await store.saveVariant(a, changed);
  assert.equal(b.variant, "B");
  assert.equal(b.parentId, a.id);
  assert.equal(b.startedAt, a.startedAt, "wariant trzyma tydzień planu (deload)");
  assert.equal((await store.activePlan()).id, b.id);
  assert.deepEqual(db.tables.training_plans.find((row) => row.id === a.id).days, week, "A zostaje bez zmian");

  const again = await store.saveVariant(b, week);
  assert.equal(again.id, b.id);
  assert.equal(db.tables.training_plans.length, 2, "bez wariantu C za każdą zmianę");

  const backToA = await store.activateVariant(b, "A");
  assert.equal(backToA.id, a.id);
  assert.equal(db.tables.training_plans.filter((row) => row.active).length, 1);
  const c = await store.saveVariant(backToA, changed);
  assert.equal(c.variant, "C", "kolejna zmiana na A to nowy wariant");
  assert.equal(await store.activateVariant(a, "Z"), null);

  const fresh = await store.savePlan({ split: "full_body", intensity: "heavy", days: week });
  assert.equal(fresh.variant, "A");
  assert.equal((await store.activePlan()).id, fresh.id);
});

test("Plan store: awaria bazy — pusty odczyt, zapis zwraca null", async () => {
  const store = createPlanStore({ url: "https://db.example", serviceKey: "k", userId: "u1", fetchImpl: async () => new Response("down", { status: 503 }), log: quiet });
  assert.equal(await store.profile(), null);
  assert.equal(await store.activePlan(), null);
  assert.equal(await store.savePlan({ split: "full_body", intensity: "heavy", days: [] }), null);
  assert.equal(await store.saveProfile({ age: 30 }), false);
});
