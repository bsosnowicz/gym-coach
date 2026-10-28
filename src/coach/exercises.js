// The exercise catalogue the coach plans from: the records of free-exercise-db
// (data/exercises.json, public domain) joined with our overlay
// (data/exercises-pl.json: Polish name, movement pattern, extra gear).
//
// Injuries are stored per joint and side (as in yoga-startup), while the
// source knows only muscles. The link is the movement pattern, with the two
// lists the yoga cards have (kontuzje_twarde / kontuzje_miekkie):
//   hard — the exercise is out with any injury of that part;
//   soft — out too, unless the pain is mild (severity "low").
// The overlay adds parts for single exercises where the pattern is not
// enough (a sumo deadlift is hard on the knees, a bent-over row on the low back).

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
  squat: { hard: ["knee"], soft: ["hip", "ankle", "lower_back"] },
  hinge: { hard: ["lower_back", "hamstring"], soft: ["knee", "hip"] },
  hip_extension: { hard: ["hip"], soft: ["lower_back", "knee"] },
  lunge: { hard: ["knee"], soft: ["hip", "ankle"] },
  horizontal_push: { hard: ["shoulder"], soft: ["elbow", "wrist"] },
  chest_fly: { hard: ["shoulder"], soft: ["elbow"] },
  vertical_push: { hard: ["shoulder"], soft: ["elbow", "wrist", "lower_back"] },
  shoulder_raise: { hard: ["shoulder"], soft: [] },
  rear_delt: { hard: [], soft: ["shoulder", "upper_back"] },
  horizontal_pull: { hard: [], soft: ["shoulder", "elbow", "upper_back"] },
  vertical_pull: { hard: ["shoulder"], soft: ["elbow", "wrist"] },
  shrug: { hard: ["neck"], soft: ["upper_back", "shoulder"] },
  elbow_flexion: { hard: ["elbow"], soft: ["wrist"] },
  elbow_extension: { hard: ["elbow"], soft: ["shoulder", "wrist"] },
  knee_extension: { hard: ["knee"], soft: [] },
  knee_flexion: { hard: ["knee", "hamstring"], soft: [] },
  calf_raise: { hard: ["ankle", "calf"], soft: [] },
  core_static: { hard: [], soft: ["lower_back", "shoulder", "wrist"] },
  core_flexion: { hard: [], soft: ["lower_back", "neck"] },
  core_rotation: { hard: ["lower_back"], soft: [] },
  conditioning: { hard: [], soft: ["wrist", "shoulder", "knee", "hip"] },
  carry: { hard: [], soft: ["wrist", "shoulder", "lower_back"] },
};

const SEVERITIES = ["low", "medium", "high"];

// injuries: body part ids, or { part, severity } — a bare id counts as more than mild.
function normalizeInjuries(injuries = []) {
  return injuries.map((injury) => (typeof injury === "string" ? { part: injury, severity: null } : injury));
}

// Whether the injuries rule the exercise out (the hard/soft rule above).
function excludedBy(exercise, injuries) {
  return normalizeInjuries(injuries).some(({ part, severity }) =>
    exercise.hard.includes(part) || (severity !== "low" && exercise.soft.includes(part)));
}

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

// The pattern's lists plus the overlay's own; a part named hard is not soft as well.
function partsFor(entry) {
  const pattern = PATTERN_LOADS[entry.pattern];
  const hard = [...new Set(expandParts([...pattern.hard, ...(entry.hard || [])]))];
  const soft = [...new Set(expandParts([...pattern.soft, ...(entry.soft || [])]))].filter((part) => !hard.includes(part));
  return { hard, soft, loads: [...hard, ...soft] };
}

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
    for (const part of [...(entry.hard || []), ...(entry.soft || [])]) {
      if (!BODY_PARTS.includes(part) && !SIDED.has(part)) throw new Error(`Katalog: nieznana partia ciała „${part}” (${entry.id})`);
    }
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
      ...partsFor(entry),
      level: LEVELS.includes(record.level) ? record.level : "intermediate",
      mechanic: record.mechanic,
      primaryMuscles: record.primaryMuscles,
      secondaryMuscles: record.secondaryMuscles,
    };
  });
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  if (byId.size !== exercises.length) throw new Error("Katalog: powtórzony identyfikator w exercises-pl.json");

  // equipment / gear: what the user has (undefined = no limit); avoid: injuries
  // (ids or { part, severity }); level: the user's level — a beginner gets no expert exercises.
  function fits(exercise, { equipment, gear, avoid = [], level } = {}) {
    if (equipment && !equipment.includes(exercise.equipment)) return false;
    if (gear && exercise.needs.some((item) => !gear.includes(item))) return false;
    if (avoid.length && excludedBy(exercise, avoid)) return false;
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
        // A shared muscle alone is not enough: mountain climbers are no squat.
        .filter((exercise) => exercise.id !== id && fits(exercise, filters)
          && (exercise.pattern === original.pattern || PATTERN_REGION[exercise.pattern] === PATTERN_REGION[original.pattern]))
        .sort((a, b) => score(b) - score(a));
    },
  };
}

module.exports = { buildCatalog, excludedBy, BODY_PARTS, PATTERN_LOADS, EQUIPMENT, GEAR, LEVELS, SEVERITIES };
