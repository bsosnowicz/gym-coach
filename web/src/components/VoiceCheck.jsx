import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { meterPosition, recentVoiceCheck, saveVoiceCheck } from "../../../public/mic-calibration.js";
import { startVoiceCheck } from "../../../public/voice-check.js";

// Readings every 50 ms jump between syllables; the bar falls slowly so it can be read.
const METER_DECAY = 0.8;

// The voice check before Start, as a modal <dialog>. The measured voice level
// lowers the session's speech threshold (sessionThresholds in
// public/mic-calibration.js), so a quiet or distant user is still heard.
// A good result from the last 30 minutes starts the session with one click.
// onDone(): the result is saved (or skipped) and the session may start; onClose(): back without starting.
export function VoiceCheck({ open, onDone, onClose, texts }) {
  const ref = useRef(null);
  const checkRef = useRef(null);
  const resultRef = useRef(null);
  const displayRef = useRef(0);
  const [recent, setRecent] = useState(null);
  // recent | intro | measuring | ok | weak | silent | error
  const [stage, setStage] = useState("intro");
  const [reading, setReading] = useState(null);
  const [errorName, setErrorName] = useState(null);

  // A layout effect: the stage set here is rendered before the browser paints,
  // so the opened dialog never flashes the previous stage.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) {
      const last = recentVoiceCheck();
      setRecent(last);
      setStage(last ? "recent" : "intro");
      setReading(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => () => checkRef.current?.cancel(), []);

  // Must run in the click handler: the AudioContext is created right away,
  // and Safari lets it start only within a user gesture.
  function begin() {
    checkRef.current?.cancel();
    setReading(null);
    displayRef.current = 0;
    resultRef.current = null;
    let check;
    try {
      check = startVoiceCheck({
        onUpdate: (state) => {
          displayRef.current = Math.max(state.level, displayRef.current * METER_DECAY);
          setReading({ ...state, display: displayRef.current });
        },
      });
    } catch (error) {
      setErrorName(error?.name || null);
      setStage("error");
      return;
    }
    checkRef.current = check;
    setStage("measuring");
    check.done.then((result) => {
      if (!result || checkRef.current !== check) return;
      resultRef.current = result;
      setStage(result.outcome);
    }).catch((error) => {
      if (checkRef.current !== check) return;
      setErrorName(error?.name || null);
      setStage("error");
    });
  }

  function stopMeasuring() {
    checkRef.current?.cancel();
    checkRef.current = null;
  }

  function finish(outcome) {
    stopMeasuring();
    const result = resultRef.current;
    if ((outcome === "ok" || outcome === "weak") && result) {
      saveVoiceCheck({ label: result.label, outcome, voiceLevel: result.voiceLevel, noiseFloor: result.noiseFloor });
    } else if (outcome === "skipped") {
      saveVoiceCheck({ outcome: "skipped" });
    }
    onDone();
  }

  function cancel() {
    stopMeasuring();
    onClose();
  }

  const button = (label, onClick, primary = false) => (
    <button type="button" className={primary ? "btn btn-primary" : "btn"} onClick={onClick}>{label}</button>
  );
  let body = null;
  let actions = null;
  if (stage === "recent") {
    body = <><p>{texts.checkRecent(recent?.outcome)}</p><p className="hint">{texts.checkRecentHint}</p></>;
    actions = <>{button(texts.checkGo, () => finish("recent"), true)}{button(texts.checkAgain, begin)}</>;
  } else if (stage === "intro") {
    body = <><p>{texts.checkIntro}</p><p className="voice-check-phrase">„{texts.checkPhrase}”</p></>;
    actions = <>{button(texts.checkStart, begin, true)}{button(texts.checkSkip, () => finish("skipped"))}</>;
  } else if (stage === "measuring") {
    const countdown = reading?.phase === "countdown";
    const status = !reading
      ? texts.checkOpening
      : countdown ? texts.checkCountdown(Math.max(1, Math.ceil(reading.remainingMs / 1000))) : texts.checkListening(reading.voiced);
    body = (
      <>
        <p className="voice-check-phrase">„{texts.checkPhrase}”</p>
        <p aria-live="polite">{status}</p>
        <div className={`voice-meter${reading?.voiced ? " voice-meter--heard" : ""}`} aria-hidden="true">
          <span style={{ width: `${Math.round(meterPosition(reading?.display ?? 0) * 100)}%` }} />
        </div>
      </>
    );
    actions = button(texts.checkCancel, () => { stopMeasuring(); setStage("intro"); });
  } else if (stage === "ok") {
    body = <p>{texts.checkOk}</p>;
    actions = button(texts.checkGo, () => finish("ok"), true);
  } else if (stage === "weak") {
    body = <p>{texts.checkWeak}</p>;
    actions = <>{button(texts.checkGo, () => finish("weak"), true)}{button(texts.checkAgain, begin)}</>;
  } else {
    body = <p>{stage === "silent" ? texts.checkSilent : texts.checkError(errorName)}</p>;
    actions = <>{button(texts.checkAgain, begin, true)}{button(texts.checkSkip, () => finish("skipped"))}</>;
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="voice-check-title" onCancel={(event) => { event.preventDefault(); cancel(); }}>
      <p className="dialog-title" id="voice-check-title">{texts.checkTitle}</p>
      <div className="voice-check-body">{body}</div>
      <div className="dialog-actions">{actions}</div>
    </dialog>
  );
}
