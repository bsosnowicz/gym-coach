import { Icon } from "./icons.jsx";
import { Badge, Button, cx } from "./primitives.jsx";

// Skeleton points of a standing person (camera space 0..320 × 0..240, already mirrored)
const J = { head: [160, 46], neck: [160, 70], ls: [134, 76], rs: [186, 76], le: [124, 110], re: [198, 108], lw: [128, 140], rw: [194, 140],
  hip: [160, 134], lh: [144, 136], rh: [176, 136], lk: [140, 182], rk: [182, 180], la: [138, 226], ra: [184, 226] };
const BONES = [["neck", "ls"], ["neck", "rs"], ["ls", "le"], ["le", "lw"], ["rs", "re"], ["re", "rw"], ["neck", "hip"], ["hip", "lh"], ["hip", "rh"], ["lh", "lk"], ["lk", "la"], ["rh", "rk"], ["rk", "ra"]];

/* CameraPanel — optional pose check. state: off | starting | analysing | noPerson | unavailable */
export function CameraPanel({ state = "analysing", cues = [], onToggle, compact = false }) {
  const on = state !== "off";
  const analysing = state === "analysing";
  const status = {
    off: "Kamera wyłączona. Obraz zostaje w przeglądarce, do analizy trafiają tylko pomniejszone klatki.",
    starting: "Włączam kamerę…",
    analysing: "Analiza sylwetki działa.",
    noPerson: "Nie widzę sylwetki — odsuń się, żeby było widać całe ciało.",
    unavailable: "Analiza sylwetki niedostępna — widzisz sam podgląd, rozmowa działa normalnie.",
  }[state];
  return (
    <section className={cx("gc-camera", compact && "gc-camera--compact")} aria-label="Kamera">
      <header className="gc-camera__head">
        <p className="title-s"><Icon name="camera" size={18} /> Kamera <Badge tone="neutral">opcjonalnie</Badge></p>
        <Button variant={on ? "secondary" : "primary"} icon={on ? "camera-off" : "camera"} onClick={onToggle}>{on ? "Wyłącz" : "Włącz kamerę"}</Button>
      </header>
      <div className={cx("gc-camera__view", `is-${state}`)}>
        {on ? (
          <svg viewBox="0 0 320 240" className="gc-camera__img" role="img" aria-label={analysing ? "Podgląd z kamery z naniesionym szkieletem sylwetki" : "Podgląd z kamery"}>
            <rect width="320" height="240" className="gc-cam-bg" />
            <rect x="0" y="196" width="320" height="44" className="gc-cam-floor" />
            {state !== "noPerson" && <path className="gc-cam-person" d="M160 26a20 20 0 1 1 0 40 20 20 0 1 1 0-40ZM132 74h56l14 36-6 32-14-2-4 40 4 46h-14l-8-44-8 44h-14l4-46-4-40-14 2-6-32 14-36Z" />}
            {analysing && (
              <g className="gc-cam-skel">
                {BONES.map(([a, b]) => <line key={a + b} x1={J[a][0]} y1={J[a][1]} x2={J[b][0]} y2={J[b][1]} />)}
                {Object.entries(J).map(([k, [x, y]]) => <circle key={k} cx={x} cy={y} r={k === "head" ? 6 : 4.5} className={k === "ls" || k === "rs" ? "is-flag" : undefined} />)}
              </g>
            )}
          </svg>
        ) : (
          <div className="gc-camera__off"><Icon name="camera-off" size={32} /><span>Kamera wyłączona</span></div>
        )}
        {analysing && cues.length > 0 && (
          <ul className="gc-camera__cues" aria-live="polite">
            {cues.map((c) => <li key={c.text} data-tone={c.tone}><Icon name={c.tone === "ok" ? "check" : "arrow-right"} size={16} />{c.text}</li>)}
          </ul>
        )}
        {state === "unavailable" && <Badge tone="warn" icon="alert" className="gc-camera__badge">Brak analizy</Badge>}
        {state === "noPerson" && <Badge tone="warn" icon="user" className="gc-camera__badge">Brak sylwetki w kadrze</Badge>}
      </div>
      <p className="gc-camera__status body-s" aria-live="polite">{status}</p>
    </section>
  );
}
