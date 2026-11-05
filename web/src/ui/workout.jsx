import { Icon } from "./icons.jsx";
import { Badge, Button, Card, Countdown, ProgressBar, SetDots, clock, cx, kg } from "./primitives.jsx";

const target = (e) => (e.reps ? `${e.reps} × ${e.kg ? kg(e.kg) : "bez ciężaru"}` : `${e.seconds} s`);
const setsLine = (e) => `${e.sets} × ${e.reps ? e.reps : `${e.seconds} s`}${e.kg ? ` · ${kg(e.kg)}` : ""}`;

/* PlanCard — warm-up + exercises; rows carry state: done | current | todo | skipped | swapped | fewer */
export function PlanCard({ plan, compact = false, actions }) {
  return (
    <Card className={cx("gc-plan", compact && "gc-plan--compact")} eyebrow={plan.eyebrow || "Plan na dziś"} title={plan.title} actions={actions}>
      <div className="gc-plan__meta">
        <span className="gc-muted body-s"><Icon name="timer" size={16} /> ~{plan.minutes} min · {plan.exercises.length} ćwiczeń</span>
        <div className="gc-plan__focus" aria-label="Partie w fokusie">
          {plan.focus.map((f) => <Badge key={f} tone="violet">{f}</Badge>)}
        </div>
      </div>
      <ol className="gc-plan__list">
        <li className="gc-plan__row" data-state={plan.warmupState || "todo"}>
          <span className="gc-plan__idx" aria-hidden="true"><Icon name="flame" size={16} /></span>
          <div className="gc-plan__main">
            <span className="gc-plan__name">Rozgrzewka</span>
            <span className="gc-plan__sub">{plan.warmup}</span>
          </div>
          {plan.warmupState === "done" && <Icon name="check" size={18} className="gc-plan__done" title="Zrobione" />}
        </li>
        {plan.exercises.map((e, i) => (
          <li key={e.id} className="gc-plan__row" data-state={e.state || "todo"} aria-current={e.state === "current" ? "step" : undefined}>
            <span className="gc-plan__idx gc-num" aria-hidden="true">{e.state === "done" ? <Icon name="check" size={16} /> : i + 1}</span>
            <div className="gc-plan__main">
              <span className="gc-plan__name">{e.name}</span>
              {e.swappedFrom && <span className="gc-plan__was">zamiast: <s>{e.swappedFrom}</s></span>}
              <span className="gc-plan__sub gc-num">
                {e.setsBefore ? <><s>{e.setsBefore}</s> → </> : null}{setsLine(e)} · przerwa {clock(e.restS)}
              </span>
            </div>
            <div className="gc-plan__tags">
              {e.state === "skipped" && <Badge tone="neutral" icon="skip">Pominięte</Badge>}
              {e.swappedFrom && <Badge tone="violet" icon="swap">Zamienione</Badge>}
              {e.setsBefore && <Badge tone="neutral" icon="minus">Mniej serii</Badge>}
              {e.progression && e.state !== "skipped" && <Badge tone="accent" icon="arrow-right" className="gc-badge--up">{e.progression}</Badge>}
              {e.state === "current" && <Badge tone="lime">Teraz</Badge>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ChangeNotice — inline confirmation of an on-the-fly change, with undo */
export function ChangeNotice({ kind = "swap", children, onUndo, tone = "hero" }) {
  const icon = { swap: "swap", skip: "skip", fewer: "minus" }[kind];
  return (
    <div className={cx("gc-notice", `gc-notice--${tone}`)} role="status">
      <span className="gc-notice__icon"><Icon name={icon} size={18} /></span>
      <p>{children}</p>
      {onUndo && <button type="button" className="gc-link" onClick={onUndo}><Icon name="undo" size={16} />Cofnij</button>}
    </div>
  );
}

/* LiveWorkout — the main training panel. phase: set | rest | ready.
   restLeft / restTotal in seconds. The change buttons show only with their handlers;
   without them the voice hint stands in (changes are said to the coach). */
export function LiveWorkout({
  exercise, exerciseIndex, exerciseCount, setIndex, phase = "set", restLeft = 0, restTotal = 120, restPaused = false,
  previous = [], next, doneSets, totalSets, notice, onSwap, onSkip, onFewer, onDone, doneLabel = "Gotowe", dim = false,
}) {
  const setStates = Array.from({ length: exercise.sets }, (_, i) => (i < setIndex ? "done" : i === setIndex ? "current" : "todo"));
  const changes = onSwap || onSkip || onFewer || onDone;
  return (
    <Card tone="hero" className={cx("gc-live", `gc-live--${phase}`, dim && "is-dim")} aria-label="Trening na żywo">
      <header className="gc-live__head">
        <div>
          <p className="gc-eyebrow gc-eyebrow--hero">Ćwiczenie {exerciseIndex + 1} z {exerciseCount}</p>
          <h2 className="gc-live__name">{exercise.name}</h2>
        </div>
        {exercise.muscle && <Badge tone="hero">{exercise.muscle}</Badge>}
      </header>

      {notice}

      <div className="gc-live__core">
        {phase === "rest" || phase === "ready" ? (
          <div className="gc-live__rest">
            <Countdown seconds={phase === "ready" ? 0 : restLeft} total={restTotal} paused={restPaused} size="lg"
              caption={phase === "ready" ? "Powiedz „tak”, gdy jesteś gotowy" : undefined} />
            <div className="gc-live__upnext">
              <p className="gc-eyebrow gc-eyebrow--hero">Następna seria</p>
              <p className="gc-live__set gc-num">Seria {setIndex + 1} z {exercise.sets}</p>
              <p className="gc-live__target gc-num">{target(exercise)}</p>
            </div>
          </div>
        ) : (
          <div className="gc-live__now">
            <p className="gc-live__set gc-num" aria-live="polite">Seria {setIndex + 1} <span>z {exercise.sets}</span></p>
            <p className="gc-live__target gc-live__target--xl gc-num">{target(exercise)}</p>
            <p className="gc-live__hint"><Icon name="mic" size={18} />Powiedz „gotowe” po serii</p>
          </div>
        )}
      </div>

      <div className="gc-live__sets">
        <SetDots sets={setStates} />
        <ol className="gc-live__prev" aria-label="Poprzednie serie">
          {previous.map((p, i) => (
            <li key={i}><Badge tone="hero" icon={p.ok === false ? "minus" : "check"}><span className="gc-num">S{i + 1} · {p.reps}{p.kg ? ` × ${String(p.kg).replace(".", ",")}` : ""}</span></Badge></li>
          ))}
          {previous.length === 0 && <li className="gc-live__none">Pierwsza seria tego ćwiczenia</li>}
        </ol>
      </div>

      {changes ? (
        <div className="gc-live__actions" role="group" aria-label="Zmiany w planie">
          {onSwap && <Button variant="hero" size="lg" icon="swap" onClick={onSwap}>Zamień</Button>}
          {onSkip && <Button variant="hero" size="lg" icon="skip" onClick={onSkip}>Pomiń</Button>}
          {onFewer && <Button variant="hero" size="lg" icon="minus" onClick={onFewer}>Mniej serii</Button>}
          {onDone && <Button variant="primary" size="lg" icon="check" onClick={onDone} className="gc-live__done">{doneLabel}</Button>}
        </div>
      ) : (
        <p className="gc-live__hint"><Icon name="mic" size={18} />Zmiany głosem: „za ciężko”, „pomińmy to”, „zróbmy mniej serii”.</p>
      )}

      <footer className="gc-live__foot">
        <ProgressBar tone="hero" value={doneSets} max={totalSets} label="Cały trening" showValue valueText={`${doneSets} z ${totalSets} serii`} />
        {next && (
          <p className="gc-live__next"><span className="gc-eyebrow gc-eyebrow--hero">Potem</span><strong>{next.name}</strong><span className="gc-num">{setsLine(next)}</span></p>
        )}
      </footer>
    </Card>
  );
}

/* ChangeSheet — the three on-the-fly changes, as a sheet over the session */
export function ChangeSheet({ exercise, swapTo, onSwap, onSkip, onFewer, onClose }) {
  return (
    <div className="gc-sheet" role="dialog" aria-modal="true" aria-label="Zmiana w planie">
      <div className="gc-sheet__panel">
        <header className="gc-sheet__head">
          <div>
            <p className="gc-eyebrow">Zmiana w planie</p>
            <h2 className="title">{exercise.name}</h2>
          </div>
          <Button variant="ghost" icon="x" aria-label="Zamknij" onClick={onClose} />
        </header>
        <p className="gc-muted body-s"><Icon name="mic" size={16} /> Głosem: „zamień”, „pomiń”, „zróbmy dwie serie”.</p>
        <div className="gc-sheet__opts">
          <button type="button" className="gc-opt" onClick={onSwap}>
            <span className="gc-opt__icon"><Icon name="swap" /></span>
            <span><strong>Zamień ćwiczenie</strong><small>Na: {swapTo.name} · {setsLine(swapTo)}</small></span>
            <Icon name="chevron-right" />
          </button>
          <button type="button" className="gc-opt" onClick={onSkip}>
            <span className="gc-opt__icon"><Icon name="skip" /></span>
            <span><strong>Pomiń</strong><small>Przechodzimy do następnego ćwiczenia</small></span>
            <Icon name="chevron-right" />
          </button>
          <button type="button" className="gc-opt" onClick={onFewer}>
            <span className="gc-opt__icon"><Icon name="minus" /></span>
            <span><strong>Mniej serii</strong><small>{exercise.sets} → {exercise.sets - 1} serie, ciężar bez zmian</small></span>
            <Icon name="chevron-right" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* PainAlert — a warning, not an alarm: exercise stopped, a replacement, advice for sharp pain */
export function PainAlert({ part = "prawe kolano", during = "Przysiad ze sztangą", replacement, onTake, onSkip, onEnd }) {
  return (
    <section className="gc-pain" role="alert" aria-labelledby="gc-pain-title">
      <header className="gc-pain__head">
        <span className="gc-pain__icon"><Icon name="bandage" size={22} /></span>
        <div>
          <h2 id="gc-pain-title" className="gc-pain__title">Przerwane: {part}</h2>
          <p className="gc-pain__text">Zgłosiłeś ból przy ćwiczeniu „{during}”. Nie kontynuujemy go dzisiaj — zapisałem to w kontuzjach.</p>
        </div>
      </header>
      {replacement && (
        <div className="gc-pain__swap">
          <p className="gc-eyebrow">Zamiennik, mniej obciąża kolano</p>
          <p className="title-s">{replacement.name}</p>
          <p className="gc-muted body-s gc-num">{setsLine(replacement)} · {replacement.why}</p>
          <div className="gc-pain__actions">
            <Button variant="primary" icon="swap" onClick={onTake}>Biorę zamiennik</Button>
            <Button variant="secondary" icon="skip" onClick={onSkip}>Pomiń ćwiczenie</Button>
          </div>
        </div>
      )}
      <div className="gc-pain__advice">
        <Icon name="info" size={18} />
        <p><strong>Ostry, kłujący ból, obrzęk albo ból, który nie mija?</strong> Zakończ trening i skonsultuj się z lekarzem lub fizjoterapeutą. Nie ćwicz przez ból.</p>
        {onEnd && <Button variant="quiet-danger" size="md" onClick={onEnd}>Kończę na dziś</Button>}
      </div>
    </section>
  );
}

/* WorkoutSummary — after the workout */
export function WorkoutSummary({ summary, actions }) {
  return (
    <Card className="gc-summary" eyebrow={summary.date} title="Trening zrobiony" actions={actions}>
      <dl className="gc-stats">
        {summary.stats.map((s) => (
          <div key={s.label} className="gc-stat">
            <dt>{s.label}</dt>
            <dd className="gc-num">{s.value}{s.unit && <small> {s.unit}</small>}</dd>
          </div>
        ))}
      </dl>
      <table className="gc-table">
        <caption className="gc-sr">Ćwiczenia i serie</caption>
        <thead><tr><th scope="col">Ćwiczenie</th><th scope="col">Serie (powt.)</th><th scope="col">Ciężar</th><th scope="col"><span className="gc-sr">Uwagi</span></th></tr></thead>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={r.name} data-state={r.state}>
              <th scope="row">{r.name}</th>
              <td className="gc-num">{r.reps}</td>
              <td className="gc-num">{r.kg}</td>
              <td>{r.badge && <Badge tone={r.badge.tone} icon={r.badge.icon}>{r.badge.text}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* SessionControls — Przerwa / Zakończ (+ live mic state). onMic: the mic is a button (mute toggle). */
export function SessionControls({ onPause, onEnd, onMic, micLive = true, disabled = false, size = "lg", hint = true, bar = false }) {
  const micText = micLive ? "Mikrofon włączony" : "Mikrofon wyłączony";
  return (
    <div className={cx("gc-controls", bar && "gc-controls--bar")}>
      {onMic ? (
        <button type="button" className={cx("gc-mic", micLive && "is-live")} aria-pressed={!micLive} disabled={disabled} onClick={onMic}
          title={micLive ? "Wycisz mikrofon" : "Włącz mikrofon"}>
          <Icon name={micLive ? "mic" : "mic-off"} size={18} /><span className="gc-mic__text">{micText}</span>
        </button>
      ) : (
        <span className={cx("gc-mic", micLive && "is-live")} title={micText}>
          <Icon name={micLive ? "mic" : "mic-off"} size={18} /><span className="gc-mic__text">{micText}</span>
        </span>
      )}
      <div className="gc-controls__btns">
        <Button variant="secondary" size={size} icon="pause" disabled={disabled} onClick={onPause}>Przerwa</Button>
        <Button variant="quiet-danger" size={size} icon="stop" disabled={disabled} onClick={onEnd}>Zakończ</Button>
      </div>
      {hint && <p className="gc-controls__hint">Głosem: „zróbmy przerwę”, „kończymy”.</p>}
    </div>
  );
}
