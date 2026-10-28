// The break over the video, with the button and the words that end it.
export function BreakOverlay({ open, onContinue, texts, reconnecting = false }) {
  return (
    <div className="overlay" hidden={!open}>
      <p className="overlay-title">{texts.breakTitle}</p>
      <button type="button" className="btn btn-primary" disabled={reconnecting} onClick={onContinue}>{texts.breakContinue}</button>
      <p className="hint">{texts.breakHint}</p>
    </div>
  );
}
