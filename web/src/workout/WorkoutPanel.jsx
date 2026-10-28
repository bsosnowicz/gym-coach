// Today's workout as the server sent it (the "workout" SSE stage, src/coach/index.js):
// the plan, where the user is now, and the rest counting down on the page's clock.
import { useEffect, useState } from "react";

const TARGET = (item) => (item.reps ? `${item.reps} powtórzeń` : `${item.seconds} s`);
const SETS = (item) => `${item.sets} × ${item.reps ? `${item.reps} powt.` : `${item.seconds} s`}${item.kg ? ` · ${String(item.kg).replace(".", ",")} kg` : ""}`;

// Ticks while a rest counts down; the server sends the time left, not a clock reading.
export function useRestLeft(progress, receivedAt) {
  const [now, setNow] = useState(() => Date.now());
  const counting = progress?.phase === "rest" && !progress.restPaused && progress.restLeftMs !== null;
  useEffect(() => {
    if (!counting) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [counting, receivedAt]);
  if (progress?.phase !== "rest" || progress.restLeftMs === null) return null;
  if (progress.restPaused) return progress.restLeftMs;
  // `now` may predate receivedAt (read before the event came): never count up.
  return Math.max(0, Math.min(progress.restLeftMs, progress.restLeftMs - (now - receivedAt)));
}

export function clock(ms) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Now({ plan, progress, restLeft }) {
  const item = plan.exercises[progress.exerciseIndex];
  if (progress.phase === "ready") return <p className="workout-now">Powiedz „gotowe”, żeby zacząć rozgrzewkę.</p>;
  if (progress.phase === "warmup") return <p className="workout-now"><strong>Rozgrzewka</strong> · powiedz „gotowe”, kiedy skończysz</p>;
  if (progress.phase === "done") return <p className="workout-now"><strong>Trening zrobiony</strong> · {progress.completed} serii</p>;
  const set = `seria ${progress.setIndex + 1} z ${item.sets}`;
  const last = progress.lastSet;
  const lastText = last && (last.reps || last.kg)
    ? ` · poprzednia: ${last.reps ? `${last.reps} powt.` : ""}${last.reps && last.kg ? " × " : ""}${last.kg ? `${String(last.kg).replace(".", ",")} kg` : ""}`
    : "";
  if (progress.phase === "ready_set") {
    return <p className="workout-now"><strong>Koniec przerwy</strong> · powiedz „tak”, gdy jesteś gotowy · dalej: {item.name}, {set}{lastText}</p>;
  }
  if (progress.phase === "rest") {
    return (
      <p className="workout-now">
        <strong>Przerwa {clock(restLeft ?? 0)}</strong>{progress.restPaused ? " (wstrzymana)" : ""} · dalej: {item.name}, {set}{lastText}
        {progress.adjustQuestion && <><br /><strong>{progress.adjustQuestion}</strong> (powiedz „tak” albo „nie”)</>}
      </p>
    );
  }
  return <p className="workout-now"><strong>{item.name}</strong> · {set} · {TARGET(item)}{lastText} · powiedz „gotowe” po serii</p>;
}

export function WorkoutPanel({ workout, receivedAt }) {
  const restLeft = useRestLeft(workout?.progress, receivedAt);
  if (!workout?.plan) return null;
  const { plan, progress } = workout;
  const started = !["ready", "warmup"].includes(progress.phase);
  const stateOf = (index) => {
    if (progress.phase === "done" || (started && index < progress.exerciseIndex)) return "done";
    return started && index === progress.exerciseIndex ? "current" : "todo";
  };
  return (
    <section className="workout" aria-label="Plan treningu" aria-live="polite">
      <h2 className="workout-title">Plan na dziś</h2>
      <Now plan={plan} progress={progress} restLeft={restLeft} />
      <ol className="workout-list">
        <li className="workout-item" data-state={progress.phase === "warmup" ? "current" : progress.phase === "ready" ? "todo" : "done"}>
          <span>Rozgrzewka</span>
          <span className="workout-meta">{Math.round(plan.warmup.durationS / 60)} min</span>
        </li>
        {plan.exercises.map((item, index) => (
          <li key={item.id} className="workout-item" data-state={stateOf(index)}>
            <span>{item.name}</span>
            <span className="workout-meta">{SETS(item)}, przerwa {item.restS} s</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
