import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons.jsx";

const cx = (...a) => a.filter(Boolean).join(" ");
export { cx };

export const kg = (n) => `${String(n).replace(".", ",")} kg`;
export const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.ceil(s)) % 60).padStart(2, "0")}`;

/* Button — variant: primary | secondary | danger | quiet-danger | ghost | hero; size: md | lg | xl */
export function Button({ variant = "secondary", size = "md", icon, iconAfter, block, children, className, ...rest }) {
  return (
    <button type="button" className={cx("gc-btn", `gc-btn--${variant}`, `gc-btn--${size}`, block && "gc-btn--block", !children && "gc-btn--icon", className)} {...rest}>
      {icon && <Icon name={icon} size={size === "xl" ? 24 : 20} />}
      {children && <span>{children}</span>}
      {iconAfter && <Icon name={iconAfter} size={size === "xl" ? 24 : 20} />}
    </button>
  );
}

/* Badge — tone: neutral | accent | lime | violet | warn | danger | hero */
export function Badge({ tone = "neutral", icon, children, className, ...rest }) {
  return (
    <span className={cx("gc-badge", `gc-badge--${tone}`, className)} {...rest}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

/* Card — tone: default | hero | sunken | warn */
export function Card({ tone = "default", as: Tag = "section", title, eyebrow, actions, children, className, ...rest }) {
  return (
    <Tag className={cx("gc-card", `gc-card--${tone}`, className)} {...rest}>
      {(title || eyebrow || actions) && (
        <header className="gc-card__head">
          <div>
            {eyebrow && <p className="gc-eyebrow">{eyebrow}</p>}
            {title && <h3 className="gc-card__title">{title}</h3>}
          </div>
          {actions && <div className="gc-card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}

/* ProgressBar — value/max; tone: default | hero | warn; label is the accessible name */
export function ProgressBar({ value, max = 100, label, tone = "default", size = "md", showValue, valueText }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cx("gc-progress", `gc-progress--${tone}`, `gc-progress--${size}`)}>
      {(label || showValue) && (
        <div className="gc-progress__meta">
          <span>{label}</span>
          {showValue && <span className="gc-num">{valueText ?? `${value} z ${max}`}</span>}
        </div>
      )}
      <div className="gc-progress__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText}>
        <span className="gc-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* SetDots — one segment per set: done | current | todo | skipped */
export function SetDots({ sets, label = "Serie", tone = "hero" }) {
  return (
    <ol className={cx("gc-setdots", `gc-setdots--${tone}`)} aria-label={label}>
      {sets.map((s, i) => (
        <li key={i} data-state={s} aria-label={`Seria ${i + 1}: ${{ done: "zrobiona", current: "teraz", todo: "przed Tobą", skipped: "pominięta" }[s]}`} />
      ))}
    </ol>
  );
}

/* Countdown — the rest between sets as a ring, read from 2 m away */
export function Countdown({ seconds, total, size = "lg", label = "Przerwa", paused = false, caption, tone = "hero" }) {
  const dims = { lg: 280, md: 208, sm: 132 }[size];
  const stroke = { lg: 14, md: 12, sm: 9 }[size];
  const r = (dims - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ready = seconds <= 0;
  const frac = ready ? 0 : Math.max(0, Math.min(1, seconds / total));
  return (
    <div className={cx("gc-countdown", `gc-countdown--${size}`, `gc-countdown--${tone}`, paused && "is-paused", ready && "is-ready")}
      role="timer" aria-label={`${label}: ${ready ? "koniec" : clock(seconds)}${paused ? ", wstrzymana" : ""}`} style={{ width: dims, height: dims }}>
      <svg width={dims} height={dims} viewBox={`0 0 ${dims} ${dims}`} aria-hidden="true">
        <circle className="gc-countdown__track" cx={dims / 2} cy={dims / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle className="gc-countdown__arc" cx={dims / 2} cy={dims / 2} r={r} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${dims / 2} ${dims / 2})`} strokeLinecap="round" />
      </svg>
      <div className="gc-countdown__center">
        <span className="gc-countdown__label">{paused ? `${label} · wstrzymana` : ready ? "Koniec przerwy" : label}</span>
        <span className="gc-countdown__value gc-num">{ready ? "Gotowy?" : clock(seconds)}</span>
        {caption && <span className="gc-countdown__caption">{caption}</span>}
      </div>
    </div>
  );
}

/* Overlay — covers the coach's stage (pause, mic blocked). Children = text; actions = buttons */
export function Overlay({ title, icon = "pause", children, actions, tone = "scrim" }) {
  return (
    <div className={cx("gc-overlay", `gc-overlay--${tone}`)} role="group" aria-label={title}>
      <div className="gc-overlay__box">
        {icon && <span className="gc-overlay__icon"><Icon name={icon} size={28} /></span>}
        <p className="gc-overlay__title">{title}</p>
        {children && <div className="gc-overlay__body">{children}</div>}
        {actions && <div className="gc-overlay__actions">{actions}</div>}
      </div>
    </div>
  );
}

/* Dialog — modal <dialog>. Esc = the safe action (onCancel). inline = render in place (previews).
   initialFocusRef: focused after showModal(); React's autoFocus does not work in a <dialog>
   opened later (it fires on mount, while the dialog is still closed). */
export function Dialog({ open, title, children, actions, onCancel, inline = false, initialFocusRef }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (inline) return;
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); initialFocusRef?.current?.focus(); }
    if (!open && d.open) d.close();
  }, [open, inline]);
  if (inline) {
    return (
      <div className="gc-dialog-backdrop">
        <div className="gc-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <h2 id={titleId} className="gc-dialog__title">{title}</h2>
          <div className="gc-dialog__body">{children}</div>
          <div className="gc-dialog__actions">{actions}</div>
        </div>
      </div>
    );
  }
  return (
    <dialog ref={ref} className="gc-dialog" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onCancel?.(); }}>
      <h2 id={titleId} className="gc-dialog__title">{title}</h2>
      <div className="gc-dialog__body">{children}</div>
      <div className="gc-dialog__actions">{actions}</div>
    </dialog>
  );
}

/* EmptyState — tone: neutral | danger */
export function EmptyState({ icon = "info", title, children, action, tone = "neutral" }) {
  return (
    <div className={cx("gc-empty", `gc-empty--${tone}`)} role={tone === "danger" ? "alert" : undefined}>
      <span className="gc-empty__icon"><Icon name={icon} size={24} /></span>
      <p className="gc-empty__title">{title}</p>
      {children && <p className="gc-empty__text">{children}</p>}
      {action}
    </div>
  );
}

/* Sparkline — weights over time; the last point is marked; best = max */
export function Sparkline({ values, width = 160, height = 48, label }) {
  const min = Math.min(...values), max = Math.max(...values);
  const pad = 5;
  const x = (i) => pad + (i * (width - 2 * pad)) / Math.max(1, values.length - 1);
  const y = (v) => height - pad - ((v - min) / Math.max(0.0001, max - min)) * (height - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${pts} ${x(values.length - 1)},${height - pad}`;
  const last = values.length - 1;
  return (
    <svg className="gc-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polygon className="gc-spark__area" points={area} />
      <polyline className="gc-spark__line" points={pts} fill="none" />
      <circle className="gc-spark__dot" cx={x(last)} cy={y(values[last])} r="4" />
    </svg>
  );
}

/* DevLog — modest, collapsible technical log for developers.
   children: the live log (public/ui/log.js writes into #log); lines: a static log. */
export function DevLog({ lines = [], title = "Dziennik", defaultOpen = false, children }) {
  return (
    <details className="gc-devlog" open={defaultOpen}>
      <summary><Icon name="log" size={16} /> {title} {!children && <span className="gc-devlog__count">{lines.length}</span>}<Icon name="chevron-down" size={16} className="gc-devlog__chev" /></summary>
      {children ?? <pre className="mono" tabIndex={0} aria-label="Logi techniczne">{lines.join("\n")}</pre>}
    </details>
  );
}

/* Segmented — small radio group of chips (scene choice, history tabs) */
export function Chips({ options, value, onChange, label }) {
  return (
    <div className="gc-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className="gc-chip" onClick={() => onChange?.(o.value)}>
          {o.icon && <Icon name={o.icon} size={16} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function useTicker(active, ms = 1000) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setT((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return t;
}
