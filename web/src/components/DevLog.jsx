// Panels written to by public/ui/log.js (by id); React renders them once and leaves them alone.
export function DevLog({ title }) {
  return (
    <details className="dev">
      <summary>{title}</summary>
      <pre id="log" />
      <pre id="provider-output" />
    </details>
  );
}
