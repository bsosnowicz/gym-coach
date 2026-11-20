// Which yolo-backend scenario watches an exercise, from which side the camera
// should see it and which angle counts the reps. All of it lives in the
// scenario files (yolo-backend/scenarios/*.json: view, rep, exercises,
// patterns), so a new exercise on camera is one JSON file, not code.
// A scenario's own list of exercises wins over a movement pattern: the
// pattern "horizontal_push" holds push-ups and the bench press alike.

const fs = require("fs");
const path = require("path");
const { DEFAULT_SCENARIOS_DIR } = require("./cues");

// [{ scenario, view, rep, exercises, patterns }]; scenarios without a rep (standing) are left out.
function loadCameraScenarios(dir = DEFAULT_SCENARIOS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")))
    .filter((scenario) => scenario.rep && scenario.view)
    .map((scenario) => ({
      scenario: scenario.id,
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

// Said when the next exercise needs the camera on another side.
const VIEW_NOTES = {
  side: "Ustaw kamerę z boku, tak żeby było widać całą sylwetkę.",
  front: "Ustaw kamerę z przodu, tak żeby było widać całą sylwetkę.",
};

module.exports = { loadCameraScenarios, cameraFor, VIEW_NOTES };
