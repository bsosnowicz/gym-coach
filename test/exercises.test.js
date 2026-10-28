// The exercise catalogue (src/coach/exercises.js): free-exercise-db records
// joined with the Polish overlay, body parts from movement patterns, and the
// filters the planner and the injury handling rely on.

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCatalog, BODY_PARTS, PATTERN_LOADS } = require("../src/coach/exercises");

const catalog = buildCatalog();

test("Katalog: każde ćwiczenie z nakładki jest w bazie, ma polską nazwę, sprzęt i obciążane partie", () => {
  assert.ok(catalog.all.length >= 80);
  for (const exercise of catalog.all) {
    assert.match(exercise.name, /^[a-ząćęłńóśźż]/, exercise.id);
    assert.ok(exercise.loads.length > 0, exercise.id);
    assert.ok(exercise.loads.every((part) => BODY_PARTS.includes(part)), exercise.id);
  }
});

test("Katalog: baza to tylko fakty, bez opisów i zdjęć", () => {
  const source = require("../data/exercises.json");
  assert.equal(source.license, "Unlicense (public domain)");
  assert.ok(source.exercises.every((exercise) => !("instructions" in exercise) && !("images" in exercise)));
});

test("Katalog: każdy wzorzec ruchu ma ćwiczenie, każda partia z wzorców jest na zamkniętej liście", () => {
  for (const pattern of Object.keys(PATTERN_LOADS)) {
    assert.ok(catalog.all.some((exercise) => exercise.pattern === pattern), pattern);
  }
});

test("Katalog: przysiad obciąża oba kolana; sprzęt z nakładki tam, gdzie źródło go nie zna", () => {
  const squat = catalog.get("Barbell_Squat");
  assert.equal(squat.name, "przysiad ze sztangą");
  assert.equal(squat.equipment, "barbell");
  assert.ok(squat.loads.includes("knee_left") && squat.loads.includes("knee_right"));
  assert.deepEqual(squat.needs, ["rack"]);
  assert.equal(catalog.get("Farmers_Walk").equipment, "dumbbell");
});

test("Katalog: filtr sprzętu, wyposażenia, kontuzji i poziomu", () => {
  const home = catalog.available({ equipment: ["body_only", "dumbbell"], gear: [] });
  assert.ok(home.length > 5);
  assert.ok(home.every((exercise) => ["body_only", "dumbbell"].includes(exercise.equipment) && exercise.needs.length === 0));

  const kneeSafe = catalog.available({ avoid: ["knee_left"] });
  assert.ok(!kneeSafe.some((exercise) => exercise.pattern === "squat" || exercise.pattern === "lunge"));
  assert.ok(kneeSafe.some((exercise) => exercise.pattern === "horizontal_push"));

  const beginner = catalog.available({ level: "beginner" });
  assert.ok(!beginner.some((exercise) => exercise.level === "expert"));
});

test("Katalog: zamienniki — najpierw ten sam wzorzec, z uwzględnieniem braku ławki i kontuzji", () => {
  const noBench = catalog.substitutes("Dumbbell_Bench_Press", { gear: [] });
  assert.equal(noBench[0].pattern, "horizontal_push");
  assert.ok(noBench.every((exercise) => !exercise.needs.includes("bench")));
  assert.ok(noBench.some((exercise) => exercise.id === "Pushups"));

  const soreKnee = catalog.substitutes("Barbell_Squat", { avoid: ["knee_left", "knee_right"] });
  assert.ok(soreKnee.length > 0, "jest czym zastąpić przysiad przy bolącym kolanie");
  assert.ok(soreKnee.every((exercise) => !exercise.loads.includes("knee_left")));
  assert.ok(["hinge", "hip_extension"].includes(soreKnee[0].pattern), "nogi zastępują nogi, bez zginania kolan");
});

test("Katalog: literówka w nakładce zatrzymuje start, nie sesję", () => {
  const source = { exercises: [{ id: "A", level: "beginner", equipment: "dumbbell", primaryMuscles: [], secondaryMuscles: [] }] };
  assert.throws(() => buildCatalog({ source, overlay: { exercises: [{ id: "B", name: "x", pattern: "squat" }] } }), /brak „B”/);
  assert.throws(() => buildCatalog({ source, overlay: { exercises: [{ id: "A", name: "x", pattern: "jump" }] } }), /wzorzec/);
  assert.throws(() => buildCatalog({ source, overlay: { exercises: [{ id: "A", name: "x", pattern: "squat", needs: ["sofa"] }] } }), /wyposażenie/);
});
