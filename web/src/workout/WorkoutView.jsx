// What the session tab shows of the workout, from the server's "workout" event:
// the plan before the first set, the live panel during it, the summary at the end.
// Changes ("za ciężko", "pomińmy to") are said to the coach, so the live panel has no change buttons.
import { Card, Icon, LiveWorkout, PlanCard, WorkoutSummary } from "../ui/index.js";
import { toLive, toPlan, toSummary, workoutPhase } from "./plan-view.js";
import { useRestLeft } from "./WorkoutPanel.jsx";

export function WorkoutView({ workout, receivedAt }) {
  const restLeft = useRestLeft(workout?.progress, receivedAt);
  const phase = workoutPhase(workout);
  if (phase === "interview") return null;
  if (phase === "summary") return <WorkoutSummary summary={toSummary(workout)} />;
  const { progress } = workout;
  if (phase === "plan") {
    return (
      <div className="gc-stack">
        <PlanCard plan={toPlan(workout)} />
        <p className="gc-muted body-s">
          <Icon name="mic" size={16} /> {progress.phase === "warmup"
            ? "Rozgrzewka trwa — powiedz „gotowe”, kiedy skończysz."
            : "Powiedz „gotowe”, żeby zacząć rozgrzewkę. Możesz też poprosić o zmianę ćwiczenia."}
        </p>
      </div>
    );
  }
  return (
    <div className="gc-stack">
      {progress.adjustQuestion && (
        <Card tone="sunken">
          <p className="title-s">{progress.adjustQuestion}</p>
          <p className="gc-muted body-s">Powiedz „tak” albo „nie”.</p>
        </Card>
      )}
      <LiveWorkout {...toLive(workout, restLeft)} />
      <PlanCard plan={{ ...toPlan(workout), eyebrow: "Cały plan" }} compact />
    </div>
  );
}
