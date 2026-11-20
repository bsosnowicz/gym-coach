// The weekly plan as a simple calendar: seven days, what each one trains,
// today marked, and the exercises of the chosen day. The plan comes from
// /api/plan before a session and from the "week_plan" SSE stage during one
// (src/coach/index.js, weekEvent). "Nowy plan / wywiad" starts the interview.
import { useState } from "react";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_SHORT = { mon: "Pn", tue: "Wt", wed: "Śr", thu: "Cz", fri: "Pt", sat: "Sb", sun: "Nd" };
const WEEKDAY_NAMES = { mon: "poniedziałek", tue: "wtorek", wed: "środa", thu: "czwartek", fri: "piątek", sat: "sobota", sun: "niedziela" };
const DAY_SHORT = {
  full_body: "Całe ciało", upper: "Góra", lower: "Dół", push: "Push", pull: "Pull", legs: "Nogi",
  chest: "Klatka", back: "Plecy", shoulders: "Barki", arms: "Ramiona",
};
const SPLIT_NAMES = {
  full_body: "full body", upper_lower: "góra / dół", push_pull_legs: "push / pull / nogi",
  ppl_upper_lower: "push / pull / nogi + góra / dół", body_part: "split na partie",
};
const INTENSITY_NAMES = { heavy: "ciężka", moderate: "umiarkowana", light: "lekka" };
// As src/coach/programming.js: every 5th week of a plan is lighter.
const WEEK_MS = 7 * 24 * 3600 * 1000;
const DELOAD_EVERY_WEEKS = 5;

const todayKey = () => WEEKDAYS[(new Date().getDay() + 6) % 7];
const target = (item) => `${item.sets} × ${item.reps ? `${item.reps} powt.` : `${item.seconds} s`}, przerwa ${item.restS} s`;

export function WeekCalendar({ week, onNewPlan, busy, saving }) {
  const today = todayKey();
  const [chosen, setChosen] = useState(null);
  if (!week?.days?.length) {
    return (
      <section className="week" aria-label="Plan tygodnia">
        <div className="week-head">
          <h2 className="workout-title">Plan tygodnia</h2>
          <button type="button" className="btn" disabled={busy} onClick={onNewPlan}>Nowy plan / wywiad</button>
        </div>
        <p className="hint">
          Nie masz jeszcze planu na tydzień. Naciśnij Start albo „Nowy plan / wywiad” — trener zacznie od krótkiego wywiadu.
          {saving === false && " Supabase jest wyłączony: plan będzie tylko na tę sesję."}
        </p>
      </section>
    );
  }
  const byDay = Object.fromEntries(week.days.map((day) => [day.weekday, day]));
  // Today, or on a rest day the next training day of the week.
  const next = WEEKDAYS.slice(WEEKDAYS.indexOf(today)).find((weekday) => byDay[weekday]) || week.days[0].weekday;
  const shown = byDay[chosen] ? chosen : next;
  const day = byDay[shown];
  const weekNo = week.startedAt ? Math.floor((Date.now() - Date.parse(week.startedAt)) / WEEK_MS) + 1 : 1;
  const deload = weekNo > 0 && weekNo % DELOAD_EVERY_WEEKS === 0;
  return (
    <section className="week" aria-label="Plan tygodnia">
      <div className="week-head">
        <h2 className="workout-title">
          Plan tygodnia <span className="workout-meta">
            {SPLIT_NAMES[week.split] || week.split} · intensywność {INTENSITY_NAMES[week.intensity] || week.intensity}
            {` · wariant ${week.variant || "A"}`}{deload ? " · tydzień lżejszy" : ""}
          </span>
        </h2>
        <button type="button" className="btn" disabled={busy} onClick={onNewPlan}>Nowy plan / wywiad</button>
      </div>
      <div className="week-grid" role="list">
        {WEEKDAYS.map((weekday) => {
          const planned = byDay[weekday];
          return (
            <button
              key={weekday}
              type="button"
              role="listitem"
              className="week-day"
              data-today={weekday === today || undefined}
              data-rest={!planned || undefined}
              aria-pressed={weekday === shown}
              aria-label={`${WEEKDAY_NAMES[weekday]}: ${planned ? DAY_SHORT[planned.type] : "odpoczynek"}`}
              disabled={!planned}
              onClick={() => setChosen(weekday)}
            >
              <span className="week-day-name">{WEEKDAY_SHORT[weekday]}</span>
              <span className="week-day-type">{planned ? DAY_SHORT[planned.type] : "—"}</span>
            </button>
          );
        })}
      </div>
      <h3 className="week-preview-title">
        {WEEKDAY_NAMES[shown]}{shown === today ? " (dziś)" : ""}: {DAY_SHORT[day.type].toLowerCase()}
      </h3>
      <ol className="workout-list">
        {day.exercises.map((item) => (
          <li key={item.id} className="workout-item">
            <span>{item.name}{item.priority && <span title="partia priorytetowa" aria-label="partia priorytetowa"> ★</span>}</span>
            <span className="workout-meta">{target(item)}</span>
          </li>
        ))}
      </ol>
      <p className="hint">Głosem: „ułóż nowy plan”, „zróbmy dziś czwartek”, „wróć do wariantu A”.</p>
    </section>
  );
}
