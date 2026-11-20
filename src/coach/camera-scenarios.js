// Which yolo-backend scenario watches an exercise, from which side the camera
// should see it and which angle counts the reps. All of it lives in the
// scenario files (yolo-backend/scenarios/*.json: view, rep, exercises,
// patterns), so a new exercise on camera is one JSON file, not code.
// A scenario's own list of exercises wins over a movement pattern: the
// pattern "horizontal_push" holds push-ups and the bench press alike.

const fs = require("fs");
const path = require("path");
const { DEFAULT_SCENARIOS_DIR } = require("./cues");

// [{ scenario, label, angle, view, rep, exercises, patterns }]; scenarios without a
// rep (standing) are left out. label and angle name the exercise and the measured
// angle for the camera test page.
function loadCameraScenarios(dir = DEFAULT_SCENARIOS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")))
    .filter((scenario) => scenario.rep && scenario.view)
    .map((scenario) => ({
      scenario: scenario.id,
      label: scenario.label || scenario.id,
      angle: (scenario.rules || []).find((rule) => rule.id === scenario.rep.rule)?.label || scenario.rep.rule,
      view: scenario.view,
      rep: scenario.rep,
      exercises: scenario.exercises || [],
      patterns: scenario.patterns || [],
    }));
}

// { scenario, view, rep } for a catalogue exercise, or null when no camera scenario fits.
function cameraFor(exercise, scenarios) {
  if (!exercise) return null;
  const found = scenarios.find((item) => item.exercises.includes(exercise.id))
    || scenarios.find((item) => item.patterns.includes(exercise.pattern));
  return found ? { scenario: found.scenario, view: found.view, rep: found.rep } : null;
}

// The exercise a camera test runs for a scenario (an item of loadCameraScenarios):
// its own first one, else the pattern's with the least equipment.
const EQUIPMENT_ORDER = ["body_only", "dumbbell", "kettlebell", "barbell"];
function testExercise(item, catalog) {
  const own = item.exercises.map((id) => catalog.get(id)).find(Boolean);
  if (own) return own;
  const rank = (exercise) => (EQUIPMENT_ORDER.includes(exercise.equipment) ? EQUIPMENT_ORDER.indexOf(exercise.equipment) : EQUIPMENT_ORDER.length);
  return catalog.all.filter((exercise) => item.patterns.includes(exercise.pattern)).sort((a, b) => rank(a) - rank(b))[0] || null;
}

// Said when the next exercise needs the camera on another side.
const VIEW_NOTES = {
  side: "Ustaw kamerę z boku, tak żeby było widać całą sylwetkę.",
  front: "Ustaw kamerę z przodu, tak żeby było widać całą sylwetkę.",
};

// A rep counted aloud by the coach; past twenty the digits, which the TTS reads.
const COUNT_WORDS = ["zero", "jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "siedem", "osiem", "dziewięć", "dziesięć",
  "jedenaście", "dwanaście", "trzynaście", "czternaście", "piętnaście", "szesnaście", "siedemnaście", "osiemnaście",
  "dziewiętnaście", "dwadzieścia"];
const countWord = (n) => COUNT_WORDS[n] || String(n);

module.exports = { loadCameraScenarios, cameraFor, testExercise, VIEW_NOTES, countWord };
