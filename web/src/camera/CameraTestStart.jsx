// Starts the camera test with the coach: a session of one exercise from the
// camera scenarios, without the plan, the warm-up or the journal. The coach
// asks where to put the camera, counts the reps aloud and says the result.
import { useState } from "react";
import { CAMERA_TEST_TEXTS as t } from "./texts.js";

// start(setup): SessionScreen's start, through the voice check like Start.
export function CameraTestStart({ scenarios, start, busy }) {
  const [scenario, setScenario] = useState(scenarios.find((item) => item.scenario === "squat")?.scenario || scenarios[0]?.scenario);
  if (!scenarios.length) return null;
  return (
    <div className="camera-controls">
      <label className="camera-device">
        <span>{t.withCoach}</span>
        <select value={scenario} onChange={(event) => setScenario(event.target.value)} disabled={busy}>
          {scenarios.map((item) => <option key={item.scenario} value={item.scenario}>{t.option(item)}</option>)}
        </select>
      </label>
      <button type="button" className="btn" disabled={busy} onClick={() => start({ mode: "camera_test", scenario })}>{t.startWithCoach}</button>
    </div>
  );
}
