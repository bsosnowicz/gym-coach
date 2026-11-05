// The app shell parts of the design system (the prototype's app, device frames and demo
// states stay in the artifact; the real app is web/src/App.jsx).
import { CoachThumb } from "./coach.jsx";
import { Icon } from "./icons.jsx";

/* Logo — the Gym Coach mark (kettlebell with a face) + wordmark */
export function Logo({ compact = false }) {
  return (
    <span className="gc-logo">
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
        <rect width="32" height="32" rx="9" className="gc-logo__bg" />
        <path d="M11.2 13.2C10.2 6.8 21.8 6.8 20.8 13.2" className="gc-logo__handle" />
        <path d="M8.5 19c0-4 3-6.8 7.5-6.8s7.5 2.8 7.5 6.8c0 3.6-2.4 6-5.3 6h-4.4c-2.9 0-5.3-2.4-5.3-6Z" className="gc-logo__bell" />
        <circle cx="13.4" cy="18.4" r="1.4" className="gc-logo__eye" /><circle cx="18.6" cy="18.4" r="1.4" className="gc-logo__eye" />
        <path d="M14 21.6q2 1.4 4 0" className="gc-logo__smile" />
      </svg>
      {!compact && <span className="gc-logo__word">Gym Coach</span>}
    </span>
  );
}

const TABS = [
  { id: "start", label: "Start", icon: "home" },
  { id: "session", label: "Trening", icon: "dumbbell" },
  { id: "history", label: "Historia", icon: "history" },
];

/* NavBar — top bar on desktop, top + bottom tab bar on mobile; the coach's face opens the picker */
export function NavBar({ active = "start", onNavigate, mascot = "trener", onCoach, live = false }) {
  return (
    <>
      <header className="gc-topbar">
        <Logo />
        <nav className="gc-tabs" aria-label="Główna nawigacja">
          {TABS.map((t) => (
            <button key={t.id} type="button" className="gc-tab" aria-current={active === t.id ? "page" : undefined} onClick={() => onNavigate?.(t.id)}>
              <Icon name={t.icon} size={18} />{t.label}{t.id === "session" && live && <span className="gc-livedot" aria-label="trwa" />}
            </button>
          ))}
        </nav>
        <CoachThumb mascot={mascot} onClick={onCoach} />
      </header>
      <nav className="gc-tabbar" aria-label="Główna nawigacja">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="gc-tabbar__item" aria-current={active === t.id ? "page" : undefined} onClick={() => onNavigate?.(t.id)}>
            <span className="gc-tabbar__icon"><Icon name={t.icon} size={22} />{t.id === "session" && live && <span className="gc-livedot" aria-label="trwa" />}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
