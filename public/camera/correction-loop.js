// What happens with each YOLO result: from a deviation on the camera to one
// short correction by the avatar. From yoga-startup (public/posture/
// correction-loop.js), only its YOLO path (handleYoloAnalysis); the MediaPipe
// path, k-NN, the pose mismatch and praise stay in yoga-startup.
//
// Two filters, which look alike but guard against different things:
//   1. debouncer — a deviation must hold for 1 s, then 15 s of silence for
//      the same one: no correction for a brief wobble, no nagging;
//   2. scheduler — waits for a pause in the conversation, so the coach is not
//      cut off mid-sentence (public/camera/cue-scheduler.js).
// The server has the last word (src/coach/cues.js) on its own state.

import { createCueScheduler } from "./cue-scheduler.js";
import { createDeviationDebouncer } from "./deviation-debouncer.js";

// After the camera starts or the scenario changes, the user needs a moment
// to step into the frame before any correction counts.
const SCENARIO_GRACE_MS = 4000;

// floor: who has the floor now (public/session/conversation-floor.js).
// canSpeak(): whether the session may hear a correction at all — running,
//   no break, no end window, no avatar handover. While false, a waiting
//   correction is dropped, and the floor counts as busy so that after the
//   break the scheduler still waits for its quiet pause.
// onCue({ scenario, deviation }): time to say it.
export function createCorrectionLoop({ floor, canSpeak, onCue, log = () => {}, now = () => performance.now() }) {
  const debouncer = createDeviationDebouncer({ sustainMs: 1000, cooldownMs: 15000, now });
  const scheduler = createCueScheduler();
  let scenario = null;
  let scenarioSetAt = 0;
  let activeKeys = new Set();

  function forget() {
    scheduler.reset();
    debouncer.reset();
    activeKeys = new Set();
  }

  return {
    setScenario(id) {
      scenario = id || null;
      scenarioSetAt = now();
      forget();
    },

    // The camera went off: nothing calls handleAnalysis any more, so a waiting
    // correction would hang until the next start and come out of nowhere.
    reset: forget,

    handleAnalysis(analysis) {
      const at = now();
      const allowed = canSpeak();
      if (!allowed) scheduler.reset();
      const { cue, expired } = scheduler.tick(at, !allowed || floor.isBusy());
      if (expired) log(`Korekta „${expired.payload.deviation}” nieaktualna (brak przerwy w rozmowie) — pomijam.`);
      if (cue) onCue(cue.payload);

      if (!scenario || analysis.scenario !== scenario || at - scenarioSetAt < SCENARIO_GRACE_MS) return;

      const deviations = analysis.detected ? (analysis.deviations || []).map((deviation) => deviation.id).filter(Boolean) : [];
      const keys = new Set(deviations.map((deviation) => `${scenario}:${deviation}`));
      for (const key of activeKeys) {
        if (keys.has(key)) continue;
        debouncer.check(key, false);
        if (scheduler.cancel(key)) log(`Korekta „${key}” — poprawione, zanim trener zdążył powiedzieć; pomijam.`);
      }
      activeKeys = keys;
      if (!allowed) return;
      for (const deviation of deviations) {
        const key = `${scenario}:${deviation}`;
        if (debouncer.check(key, true)) {
          log(`Kamera: „${deviation}” — czekam na przerwę w rozmowie.`);
          scheduler.request(key, { scenario, deviation }, at);
        }
      }
    },
  };
}
