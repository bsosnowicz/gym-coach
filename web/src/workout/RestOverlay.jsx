// The rest between sets, large on the avatar video: seen from across the
// room, unlike the line in the panel below. In the corner, not over the face.
import { clock, useRestLeft } from "./WorkoutPanel.jsx";

export function RestOverlay({ workout, receivedAt }) {
  const progress = workout?.progress;
  const restLeft = useRestLeft(progress, receivedAt);
  if (!progress || !["rest", "ready_set"].includes(progress.phase)) return null;
  const item = workout.plan.exercises[progress.exerciseIndex];
  const next = `${item.name}, seria ${progress.setIndex + 1} z ${item.sets}`;
  return (
    <div className="rest-timer" role="timer" aria-live="off">
      {progress.phase === "rest" ? (
        <>
          <span className="rest-timer-label">Przerwa{progress.restPaused ? " (wstrzymana)" : ""}</span>
          <span className="rest-timer-clock">{clock(restLeft ?? 0)}</span>
        </>
      ) : (
        <>
          <span className="rest-timer-label">Koniec przerwy</span>
          <span className="rest-timer-clock rest-timer-ready">Gotowy?</span>
        </>
      )}
      <span className="rest-timer-next">Dalej: {next}</span>
    </div>
  );
}
