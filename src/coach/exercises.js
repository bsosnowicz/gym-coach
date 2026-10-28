// The exercise catalogue the coach plans from: the records of free-exercise-db
// (data/exercises.json, public domain) joined with our overlay
// (data/exercises-pl.json: Polish name, movement pattern, extra gear).
//
// Injuries are stored per joint and side (as in yoga-startup), while the
// source knows only muscles. The link is the movement pattern: one small table
// below says which body parts a pattern loads, instead of tagging every
// exercise by hand.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");

// Closed list, the same as BODY_PARTS in yoga-startup/memory-schema.js: code
// matches on these, so a free-form "right shoulder" would never filter anything.
const BODY_PARTS = [
  "shoulder_left", "shoulder_right", "elbow_left", "elbow_right",
  "knee_left", "knee_right", "wrist_left", "wrist_right",
  "ankle_left", "ankle_right", "hip_left", "hip_right",
  "lower_back", "upper_back", "neck",
  "calf_left", "calf_right", "hamstring_left", "hamstring_right",
  "ribs", "groin", "other",
];

// Sided parts are named once here and expanded to both sides: a squat loads both knees.
const PATTERN_LOADS = {
  squat: ["knee", "hip", "ankle", "lower_back"],
  hinge: ["lower_back", "hip", "hamstring"],
  hip_extension: ["hip", "lower_back"],
  lunge: ["knee", "hip", "ankle"],
  horizontal_push: ["shoulder", "elbow", "wrist"],
  chest_fly: ["shoulder"],
  vertical_push: ["shoulder", "elbow", "wrist"],
  shoulder_raise: ["shoulder"],
  rear_delt: ["shoulder", "upper_back"],
  horizontal_pull: ["shoulder", "elbow", "upper_back"],
  vertical_pull: ["shoulder", "elbow"],
  shrug: ["neck", "upper_back"],
  elbow_flexion: ["elbow", "wrist"],
  elbow_extension: ["elbow", "shoulder"],
  knee_extension: ["knee"],
  knee_flexion: ["knee", "hamstring"],
  calf_raise: ["ankle", "calf"],
  core_static: ["lower_back", "shoulder"],
  core_flexion: ["lower_back", "neck"],
  core_rotation: ["lower_back"],
  conditioning: ["wrist", "shoulder", "hip", "knee"],
  carry: ["wrist", "shoulder", "upper_back"],
};

// A replacement from the same region keeps the session balanced when nothing
// of the same pattern fits (a sore knee rules out every squat and lunge).
const PATTERN_REGION = {
  squat: "legs", hinge: "legs", hip_extension: "legs", lunge: "legs",
  knee_extension: "legs", knee_flexion: "legs", calf_raise: "legs",
  horizontal_push: "push", chest_fly: "push", vertical_push: "push", shoulder_raise: "push", elbow_extension: "push",
  horizontal_pull: "pull", vertical_pull: "pull", rear_delt: "pull", shrug: "pull", elbow_flexion: "pull",
  core_static: "core", core_flexion: "core", core_rotation: "core",
  conditioning: "full", carry: "full",
};

const SIDED = new Set(["shoulder", "elbow", "knee", "wrist", "ankle", "hip", "calf", "hamstring"]);
const expandParts = (parts) => parts.flatMap((part) => (SIDED.has(part) ? [`${part}_left`, `${part}_right`] : [part]));

// Main equipment, from the source's values; the overlay fills in null and "other".
const EQUIPMENT = ["body_only", "dumbbell", "barbell", "kettlebell", "cable", "machine", "band"];
const SOURCE_EQUIPMENT = {
  "body only": "body_only",
  dumbbell: "dumbbell",
  barbell: "barbell",
  "e-z curl bar": "barbell",
  kettlebells: "kettlebell",
  cable: "cable",
  machine: "machine",
  bands: "band",
};
// Gear beyond the main equipment that the user may not have ("nie mam ławki").
const GEAR = ["bench", "rack", "pullup_bar", "dip_bars", "box", "ab_wheel"];

const LEVELS = ["beginner", "intermediate", "expert"];

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}

// Throws on any mismatch, so a typo in the overlay fails the tests, not a session.
function buildCatalog({ source = readJson("exercises.json"), overlay = readJson("exercises-pl.json") } = {}) {
  const records = new Map(source.exercises.map((exercise) => [exercise.id, exercise]));
  const exercises = overlay.exercises.map((entry) => {
    const record = records.get(entry.id);
    if (!record) throw new Error(`Katalog: brak „${entry.id}” w exercises.json`);
    if (!PATTERN_LOADS[entry.pattern] || !PATTERN_REGION[entry.pattern]) throw new Error(`Katalog: nieznany wzorzec „${entry.pattern}” (${entry.id})`);
    const equipment = entry.equipment || SOURCE_EQUIPMENT[record.equipment];
    if (!EQUIPMENT.includes(equipment)) throw new Error(`Katalog: nieznany sprzęt „${record.equipment}” (${entry.id})`);
    for (const gear of entry.needs || []) {
      if (!GEAR.includes(gear)) throw new Error(`Katalog: nieznane wyposażenie „${gear}” (${entry.id})`);
    }
    return {
      id: entry.id,
      name: entry.name,
      pattern: entry.pattern,
      equipment,
      needs: entry.needs || [],
      loads: expandParts(PATTERN_LOADS[entry.pattern]),
      level: LEVELS.includes(record.level) ? record.level : "intermediate",
      mechanic: record.mechanic,
      primaryMuscles: record.primaryMuscles,
      secondaryMuscles: record.secondaryMuscles,
    };
  });
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  if (byId.size !== exercises.length) throw new Error("Katalog: powtórzony identyfikator w exercises-pl.json");

  // equipment / gear: what the user has (undefined = no limit); avoid: injured body parts;
  // level: the user's level — a beginner gets no expert exercises.
  function fits(exercise, { equipment, gear, avoid = [], level } = {}) {
    if (equipment && !equipment.includes(exercise.equipment)) return false;
    if (gear && exercise.needs.some((item) => !gear.includes(item))) return false;
    if (avoid.length && exercise.loads.some((part) => avoid.includes(part))) return false;
    if (level && LEVELS.indexOf(exercise.level) > LEVELS.indexOf(level) + 1) return false;
    return true;
  }

  return {
    all: exercises,
    get: (id) => byId.get(id) || null,
    available: (filters) => exercises.filter((exercise) => fits(exercise, filters)),

    // Replacements for an exercise, best first: the same movement pattern, the
    // same main muscle, the same region; only those that fit the filters (gear, injuries).
    substitutes(id, filters = {}) {
      const original = byId.get(id);
      if (!original) return [];
      const score = (exercise) =>
        (exercise.pattern === original.pattern ? 4 : 0)
        + (exercise.primaryMuscles.some((muscle) => original.primaryMuscles.includes(muscle)) ? 2 : 0)
        + (PATTERN_REGION[exercise.pattern] === PATTERN_REGION[original.pattern] ? 1 : 0);
      return exercises
        .filter((exercise) => exercise.id !== id && score(exercise) > 0 && fits(exercise, filters))
        .sort((a, b) => score(b) - score(a));
    },
  };
}

module.exports = { buildCatalog, BODY_PARTS, PATTERN_LOADS, EQUIPMENT, GEAR, LEVELS };
