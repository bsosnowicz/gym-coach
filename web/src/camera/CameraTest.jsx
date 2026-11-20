// The camera test page (#test-kamery): the camera panel as in a set of the
// workout, without a session — no avatar, no model, no cost. The exercise
// comes from the scenario list of /api/config; "Nowa seria" starts the count
// from zero. With no session the panel sends nothing to the server.
import { useMemo, useState } from "react";
import { DevLog } from "../components/DevLog.jsx";
import CameraPanel from "./CameraPanel.jsx";
import { CAMERA_TEST_TEXTS as t } from "./texts.js";

// What the panel reads from a session; never running, so no corrections and no reps are sent.
const NO_SESSION = { floor: { isBusy: () => false }, running: false, sessionId: () => null };

export default function CameraTest({ config }) {
  const scenarios = config.scenarios || [];
  const [scenarioId, setScenarioId] = useState(scenarios.find((item) => item.scenario === "squat")?.scenario || scenarios[0]?.scenario);
  const [setIndex, setSetIndex] = useState(0);
  const target = scenarios.find((item) => item.scenario === scenarioId) || null;
  // The same shape as the coach's "workout" event, always in a set.
  const workout = useMemo(
    () => (target ? { camera: target, progress: { phase: "set", exerciseIndex: 0, setIndex } } : null),
    [target, setIndex],
  );

  return (
    <main className="app">
      <h1>{t.title}</h1>
      <p className="hint">{t.intro}</p>
      <div className="camera-controls">
        <label className="camera-device">
          <span>{t.exercise}</span>
          <select value={scenarioId} onChange={(event) => { setScenarioId(event.target.value); setSetIndex(0); }}>
            {scenarios.map((item) => <option key={item.scenario} value={item.scenario}>{t.option(item)}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => setSetIndex((n) => n + 1)}>{t.newSet}</button>
        <a className="btn" href="#">{t.back}</a>
      </div>
      <CameraPanel config={config} session={NO_SESSION} workout={workout} showAngles />
      <DevLog title={t.log} />
    </main>
  );
}
