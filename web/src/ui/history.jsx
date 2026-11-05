import { useState } from "react";
import { Icon } from "./icons.jsx";
import { Badge, Button, Card, EmptyState, Sparkline, cx, kg } from "./primitives.jsx";

/* HistoryItem — one past workout, expandable */
export function HistoryItem({ w, defaultOpen = false }) {
  return (
    <details className="gc-hist" open={defaultOpen}>
      <summary>
        <span className="gc-hist__date"><b className="gc-num">{w.day}</b><small>{w.month}</small></span>
        <span className="gc-hist__main">
          <span className="gc-hist__title">{w.title}<small> · {w.weekday}</small></span>
          <span className="gc-hist__meta gc-num"><Icon name="timer" size={14} />{w.duration} · {w.exercises.length} ćwiczeń · {w.sets} serii · {w.volume}</span>
        </span>
        {w.pain && <Badge tone="warn" icon="bandage" className="gc-hist__flag">Ból</Badge>}
        {w.pr && <Badge tone="accent" icon="trophy" className="gc-hist__flag">Rekord</Badge>}
        <Icon name="chevron-down" className="gc-hist__chev" />
      </summary>
      <table className="gc-table gc-table--compact">
        <caption className="gc-sr">Ćwiczenia: {w.title}, {w.day} {w.month}</caption>
        <thead><tr><th scope="col">Ćwiczenie</th><th scope="col">Serie × powt.</th><th scope="col">Ciężar</th></tr></thead>
        <tbody>
          {w.exercises.map((e) => (
            <tr key={e.name} data-state={e.state}><th scope="row">{e.name}{e.state === "skipped" && <small> · pominięte</small>}</th><td className="gc-num">{e.reps}</td><td className="gc-num">{e.kg}</td></tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/* ProgressRow — the weight in one exercise over time */
export function ProgressRow({ p }) {
  const delta = p.values[p.values.length - 1] - p.values[0];
  return (
    <li className="gc-prog">
      <div className="gc-prog__name">
        <span className="title-s">{p.name}</span>
        <span className="gc-muted body-s gc-num">Najlepsza seria: {p.best}</span>
      </div>
      <Sparkline values={p.values} label={`${p.name}: od ${kg(p.values[0])} do ${kg(p.values[p.values.length - 1])} w ${p.values.length} treningach`} />
      <div className="gc-prog__now">
        <span className="gc-prog__kg gc-num">{kg(p.values[p.values.length - 1])}</span>
        <Badge tone={delta > 0 ? "accent" : "neutral"} icon={delta > 0 ? "arrow-right" : "minus"} className={delta > 0 ? "gc-badge--up" : undefined}>
          <span className="gc-num">{delta > 0 ? "+" : ""}{String(delta).replace(".", ",")} kg od {p.since}</span>
        </Badge>
      </div>
    </li>
  );
}

const SEV = { 1: "Lekki", 2: "Umiarkowany", 3: "Silny" };

/* InjuryCard — an active injury; "Wyleczone" moves it to the healed list */
export function InjuryCard({ injury, onHealed }) {
  return (
    <li className="gc-injury">
      <span className="gc-injury__icon"><Icon name="bandage" size={20} /></span>
      <div className="gc-injury__main">
        <p className="title-s">{injury.part}</p>
        <p className="gc-injury__meta">
          <span className="gc-sev" data-level={injury.severity} aria-label={`Nasilenie: ${SEV[injury.severity]}`}>
            <i /><i /><i /><span>{SEV[injury.severity]}</span>
          </span>
          <span className="gc-muted body-s">zgłoszone {injury.date}</span>
        </p>
        {injury.note && <p className="gc-injury__note">„{injury.note}”</p>}
      </div>
      <Button variant="secondary" icon="check" onClick={onHealed}>Wyleczone</Button>
    </li>
  );
}

/* InjuryList — active injuries + collapsed healed list, with empty and error states */
export function InjuryList({ active = [], healed = [], state = "ok" }) {
  const [list, setList] = useState(active);
  const [done, setDone] = useState(healed);
  if (state === "error") return <EmptyState tone="danger" icon="db-off" title="Brak połączenia z bazą" action={<Button variant="secondary" icon="refresh">Spróbuj ponownie</Button>}>Nie mogę pobrać kontuzji. Trening działa, ale nowe zgłoszenia zapiszę, gdy baza wróci.</EmptyState>;
  return (
    <div className="gc-injuries">
      {list.length === 0 ? (
        <EmptyState icon="heart" title="Brak aktywnych kontuzji">Jeśli coś zaboli w trakcie treningu, powiedz trenerowi — zapisze to tutaj i dobierze zamienniki.</EmptyState>
      ) : (
        <ul className="gc-injury-list">
          {list.map((inj) => <InjuryCard key={inj.part} injury={inj} onHealed={() => { setList(list.filter((x) => x !== inj)); setDone([{ ...inj, healed: "dziś" }, ...done]); }} />)}
        </ul>
      )}
      {done.length > 0 && (
        <details className="gc-healed">
          <summary><Icon name="check" size={16} />Wyleczone ({done.length})<Icon name="chevron-down" size={16} className="gc-healed__chev" /></summary>
          <ul>{done.map((h) => <li key={h.part + h.date}><span>{h.part}</span><span className="gc-muted body-s">{h.date} → {h.healed}</span></li>)}</ul>
        </details>
      )}
    </div>
  );
}

/* HistoryScreen body — workouts, progress, injuries. state: ok | empty | error */
export function HistoryView({ data, state = "ok", injuryState }) {
  const [tab, setTab] = useState("treningi");
  const err = state === "error";
  const empty = state === "empty";
  return (
    <div className="gc-history">
      <div className="gc-history__tabs gc-chips" role="tablist" aria-label="Historia">
        {[["treningi", "Treningi"], ["postepy", "Postępy"], ["kontuzje", "Kontuzje"]].map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} className="gc-chip" onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>
      {err && (
        <EmptyState tone="danger" icon="db-off" title="Brak połączenia z bazą" action={<Button variant="secondary" icon="refresh">Spróbuj ponownie</Button>}>
          Historia i kontuzje są teraz niedostępne. Możesz trenować normalnie — wynik zapiszę, gdy połączenie wróci.
        </EmptyState>
      )}
      {!err && (
        <div className="gc-history__grid" data-tab={tab}>
          <Card className="gc-history__col" data-col="treningi" title="Ostatnie treningi" eyebrow={empty ? undefined : `${data.workouts.length} w tym miesiącu`}>
            {empty ? (
              <EmptyState icon="dumbbell" title="Jeszcze nie ma treningów" action={<Button variant="primary" icon="play">Zacznij pierwszy</Button>}>Po pierwszym treningu zobaczysz tu ćwiczenia, serie i ciężary.</EmptyState>
            ) : (
              <div className="gc-hist-list">{data.workouts.map((w, i) => <HistoryItem key={w.day + w.title} w={w} defaultOpen={i === 0} />)}</div>
            )}
          </Card>
          <Card className="gc-history__col" data-col="postepy" title="Ciężar w czasie" eyebrow="Ostatnie 8 treningów">
            {empty ? <EmptyState icon="history" title="Za mało danych">Wykres pojawi się po dwóch treningach z tym samym ćwiczeniem.</EmptyState>
              : <ul className="gc-prog-list">{data.progress.map((p) => <ProgressRow key={p.name} p={p} />)}</ul>}
          </Card>
          <Card className="gc-history__col" data-col="kontuzje" title="Kontuzje" eyebrow="Trener omija te partie">
            <InjuryList active={empty ? [] : data.injuries} healed={empty ? [] : data.healed} state={injuryState} />
          </Card>
        </div>
      )}
    </div>
  );
}
