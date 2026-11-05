// Gym Coach icon set: 24×24, 2px round strokes, currentColor. Drawn for this system.
const P = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>,
  "mic-off": <><path d="M15 10V6a3 3 0 0 0-5.6-1.5M9 9v2a3 3 0 0 0 4.6 2.5M5.5 11a6.5 6.5 0 0 0 10.4 5.2M18.5 11a6.4 6.4 0 0 1-.5 2.5M12 17.5V21M8.5 21h7M3 3l18 18" /></>,
  pause: <><rect x="6.5" y="5" width="3.5" height="14" rx="1.2" /><rect x="14" y="5" width="3.5" height="14" rx="1.2" /></>,
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  "chevron-left": <path d="m15 6-6 6 6 6" />,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  swap: <path d="M7 4 3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7" />,
  skip: <><path d="M5 5.5v13l10-6.5L5 5.5Z" /><path d="M19 5v14" /></>,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-8.5Z" />,
  dumbbell: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 4v4.5H8M12 8v4.5l3 2" /></>,
  camera: <><path d="M4 8a2 2 0 0 1 2-2h1.5l1.5-2h6l1.5 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" /><circle cx="12" cy="12.5" r="3.5" /></>,
  "camera-off": <><path d="M9 4h6l1.5 2H18a2 2 0 0 1 2 2v8.5M20 19H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M9.6 10.1a3.5 3.5 0 0 0 4.9 4.9M3 3l18 18" /></>,
  alert: <><path d="M10.3 4.3 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  flame: <path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3.2 2.4-5.2 3.6-7.4.5 1.6 1.4 2.6 2.4 3C11 7 12.7 4.6 15 3c-.2 3 1.3 4.6 2.6 6.3 1 1.3 1.4 2.8 1.4 4.5C19 18 15.9 21 12 21Z" />,
  timer: <><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 1.5M9.5 3h5" /></>,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z" />,
  heart: <path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" />,
  log: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4" /></>,
  undo: <path d="M9 7 5 11l4 4M5 11h9.5a4.5 4.5 0 0 1 0 9H12" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 0 1-13.2 4.9M4.5 12a7.5 7.5 0 0 1 13.2-4.9M18 3.5v4h-4M6 20.5v-4h4" />,
  "db-off": <><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5 1.6 0 3-.2 4.2-.5M19 6v8M5 12c0 1.4 3.1 2.5 7 2.5M3 3l18 18" /></>,
  volume: <><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  bandage: <><rect x="2.8" y="8.3" width="18.4" height="7.4" rx="3.7" transform="rotate(-45 12 12)" /><path d="M10.5 10.5h.01M13.5 13.5h.01M10.5 13.5h.01M13.5 10.5h.01" /></>,
  sparkle: <path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2L12 3.5Z" />,
  user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5" /></>,
  monitor: <><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M8.5 20h7M12 16.5V20" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />,
};

export function Icon({ name, size = 20, className = "", title, ...rest }) {
  const path = P[name];
  return (
    <svg className={`gc-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined} focusable="false" {...rest}>
      {title && <title>{title}</title>}
      {path}
    </svg>
  );
}
Icon.names = Object.keys(P);
