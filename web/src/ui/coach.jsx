import { MASCOTS, SCENES, mascotById, sceneById } from "./art.js";
import { Icon } from "./icons.jsx";
import { Button, cx } from "./primitives.jsx";

const STATUS = {
  idle: { text: "Gotowy", icon: "user" },
  speaking: { text: "Trener mówi", icon: "volume" },
  listening: { text: "Słucham", icon: "mic" },
  thinking: { text: "Myślę…", icon: null },
  happy: { text: "Brawo!", icon: "sparkle" },
  paused: { text: "Przerwa", icon: "pause" },
};

/* Mascot — the inline SVG; state classes go on the host (an ancestor of the svg) */
export function Mascot({ id = "trener", state = "idle", level = 0, enter = false, className }) {
  return (
    <div className={cx("gc-mascot", `is-${state}`, enter && "m-enter", className)} style={{ "--level": level }}
      dangerouslySetInnerHTML={{ __html: mascotById(id).svg }} />
  );
}

/* CoachStatus — what the coach is doing now: speaking | listening | thinking | paused | idle | happy */
export function CoachStatus({ state = "idle", label, compact = false }) {
  const s = STATUS[state] || STATUS.idle;
  return (
    <p className={cx("gc-status", `gc-status--${state}`, compact && "gc-status--compact")} aria-live="polite">
      <span className="gc-status__sig" aria-hidden="true">
        {state === "speaking" && <><i /><i /><i /><i /></>}
        {state === "thinking" && <><b /><b /><b /></>}
        {s.icon && state !== "speaking" && <Icon name={s.icon} size={16} />}
      </span>
      <span>{label || s.text}</span>
    </p>
  );
}

/* CoachStage — the coach's place on screen: drawn mascot in a scene, or the avatar video.
   Children are overlays (pause, rest timer).
   The <video> is always mounted (videoRef; it must live through the whole session, or
   the avatar's stream ends) and only hidden by CSS in mascot mode.
   sceneRef: the .scene element, whose --level the page sets every frame (not React state). */
export function CoachStage({ mode = "mascot", mascot = "trener", scene = "silownia", state = "idle", status = true, statusLabel,
  aspect = "wide", enter = false, children, videoRef, sceneRef, className }) {
  const sc = sceneById(scene);
  return (
    <section className={cx("gc-stage", `gc-stage--${aspect}`, `gc-stage--${mode}`, className)} aria-label="Trener">
      <div className={cx("scene", `scene--${sc.id}`, `is-${state}`)} ref={sceneRef} hidden={mode !== "mascot"}>
        <div className="scene-bg" dangerouslySetInnerHTML={{ __html: sc.svg }} />
        <div className={cx("scene-mascot", enter && "m-enter")} dangerouslySetInnerHTML={{ __html: mascotById(mascot).svg }} />
      </div>
      {/* Previews (Start, picker) pass no videoRef and get no video: one #avatar-video per page. */}
      {videoRef && (
        <div className={cx("gc-video", `is-${state}`)} hidden={mode !== "video"}>
          <video id="avatar-video" ref={videoRef} autoPlay playsInline />
        </div>
      )}
      {status && <div className="gc-stage__status"><CoachStatus state={state} label={statusLabel} /></div>}
      {children}
    </section>
  );
}

/* CoachThumb — the chosen coach's face, a button that opens the coach picker */
export function CoachThumb({ mascot = "trener", onClick, size = 40, label }) {
  const m = mascotById(mascot);
  return (
    <button type="button" className="gc-thumb" style={{ width: size, height: size }} onClick={onClick}
      aria-label={label || `Trener: ${m.name}. Zmień trenera`}>
      <span className={cx("gc-thumb__art", `gc-thumb__art--${m.id}`)} dangerouslySetInnerHTML={{ __html: m.svg }} />
    </button>
  );
}

/* CoachPicker — choose the mascot (radio cards) and the scene (chips) */
export function CoachPicker({ value = "trener", onChange, scene = "silownia", onSceneChange, showScenes = true }) {
  return (
    <div className="gc-picker">
      <div className="gc-picker__grid" role="radiogroup" aria-label="Wybierz trenera">
        {MASCOTS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={value === m.id} className="gc-pick" onClick={() => onChange?.(m.id)}>
            <span className="gc-pick__art" dangerouslySetInnerHTML={{ __html: m.svg }} />
            <span className="gc-pick__name">{m.name}{m.id === "trener" && <small> · domyślny</small>}</span>
            <span className="gc-pick__trait">{m.trait}</span>
            <span className="gc-pick__check" aria-hidden="true"><Icon name="check" size={14} /></span>
          </button>
        ))}
      </div>
      {showScenes && (
        <div className="gc-picker__scenes" role="radiogroup" aria-label="Wybierz tło">
          <span className="gc-eyebrow">Tło</span>
          <div className="gc-chips">
            {SCENES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={scene === s.id} className="gc-chip" onClick={() => onSceneChange?.(s.id)}>
                <span className={cx("gc-chip__swatch", `gc-chip__swatch--${s.id}`)} aria-hidden="true" />{s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* MicMeter — live voice level with the "heard" threshold */
export function MicMeter({ level = 0, verdict = "listening", threshold = 0.3 }) {
  return (
    <div className={cx("gc-meter", `gc-meter--${verdict}`)} role="meter" aria-label="Poziom głosu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
      <span className="gc-meter__fill" style={{ width: `${Math.round(level * 100)}%` }} />
      <span className="gc-meter__tick" style={{ left: `${threshold * 100}%` }} aria-hidden="true" />
    </div>
  );
}

const VERDICT = {
  idle: { icon: "mic", text: "Naciśnij „Sprawdź” i powiedz zdanie normalnym głosem." },
  listening: { icon: "mic", text: "Słucham…" },
  ok: { icon: "check", text: "Słyszę Cię dobrze." },
  weak: { icon: "alert", text: "Słyszę Cię, ale cicho — mów głośniej albo podejdź bliżej." },
  silent: { icon: "mic-off", text: "Nie słyszę Cię. Sprawdź, czy mikrofon nie jest wyciszony." },
};

/* MicCheck — the voice check before Start. level: the measured voice (0-1); text overrides the verdict line. */
export function MicCheck({ verdict = "idle", level = 0, onCheck, phrase = "Cześć, zaczynamy!", text, threshold }) {
  const v = VERDICT[verdict] || VERDICT.idle;
  return (
    <div className="gc-miccheck">
      <div className="gc-miccheck__head">
        <span className="gc-miccheck__icon"><Icon name="mic" size={20} /></span>
        <div>
          <p className="title-s">Sprawdźmy mikrofon</p>
          <p className="gc-muted body-s">Powiedz normalnym głosem: <strong className="gc-ink">„{phrase}”</strong></p>
        </div>
      </div>
      <MicMeter level={level} verdict={verdict} threshold={threshold} />
      <p className={cx("gc-verdict", `gc-verdict--${verdict}`)} aria-live="polite"><Icon name={v.icon} size={18} />{text || v.text}</p>
      {onCheck && <Button variant="secondary" icon="refresh" onClick={onCheck}>{verdict === "idle" ? "Sprawdź" : "Sprawdź jeszcze raz"}</Button>}
    </div>
  );
}

/* Transcript — the conversation as bubbles; role: coach | user; pending = still being heard */
export function Transcript({ items = [], mascot = "trener", label = "Rozmowa", compact = false }) {
  const m = mascotById(mascot);
  return (
    <ol className={cx("gc-transcript", compact && "gc-transcript--compact")} aria-label={label} aria-live="polite">
      {items.map((it, i) => (
        <li key={it.id ?? i} className={cx("gc-bubble", `gc-bubble--${it.role}`, it.pending && "is-pending", it.tone && `gc-bubble--${it.tone}`)}>
          {it.role === "coach" && <span className="gc-bubble__who" aria-hidden="true" dangerouslySetInnerHTML={{ __html: m.svg }} />}
          <div className="gc-bubble__body">
            <span className="gc-bubble__name">{it.role === "coach" ? m.name : "Ty"}</span>
            <p>{it.pending ? <span className="gc-typing" aria-label="Rozpoznaję mowę"><b /><b /><b /></span> : it.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
