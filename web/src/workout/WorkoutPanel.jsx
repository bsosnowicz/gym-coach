// Today's workout as the server sent it (the "workout" SSE stage, src/coach/index.js).
const SETS = (item) => `${item.sets} × ${item.reps ? `${item.reps} powt.` : `${item.seconds} s`}`;

export function WorkoutPanel({ workout }) {
  if (!workout?.plan) return null;
  const { plan } = workout;
  return (
    <section className="workout" aria-label="Plan treningu">
      <h2 className="workout-title">Plan na dziś</h2>
      <ol className="workout-list">
        <li className="workout-item">
          <span>Rozgrzewka</span>
          <span className="workout-meta">{Math.round(plan.warmup.durationS / 60)} min</span>
        </li>
        {plan.exercises.map((item) => (
          <li key={item.id} className="workout-item">
            <span>{item.name}</span>
            <span className="workout-meta">{SETS(item)}, przerwa {item.restS} s</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
