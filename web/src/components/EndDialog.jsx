import { useEffect, useRef } from "react";

// "Na pewno kończymy?" as a modal <dialog>. Esc and the starting focus mean
// going back: a stray key must not end the session.
export function EndDialog({ open, finishing, onFinish, onContinue, texts, reconnecting = false }) {
  const ref = useRef(null);
  const continueRef = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) {
      dialog.showModal();
      // React's autoFocus focuses on mount, when the dialog is still closed, and
      // leaves no autofocus attribute for showModal(), which would then pick "Tak, kończymy".
      continueRef.current.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onCancel={(event) => { event.preventDefault(); onContinue(); }}>
      <p className="dialog-title">{texts.endTitle}</p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-danger" disabled={finishing} onClick={onFinish}>{texts.endFinish}</button>
        <button type="button" className="btn" ref={continueRef} disabled={reconnecting} onClick={onContinue}>{texts.endContinue}</button>
      </div>
      <p className="hint">{texts.endHint}</p>
    </dialog>
  );
}
