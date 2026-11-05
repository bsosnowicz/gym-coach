// The Start tab: what the coach does, the voice check, the choice of the coach
// and "Zaczynamy". The voice check is the one VoiceCheck.jsx had: the measured
// voice level lowers the session's speech threshold (sessionThresholds in
// public/mic-calibration.js), so a quiet or distant user is still heard; a good
// result from the last 30 minutes is kept and needs no new check.
import { useEffect, useRef, useState } from "react";
import { meterPosition, recentVoiceCheck, saveVoiceCheck } from "../../../public/mic-calibration.js";
import { startVoiceCheck } from "../../../public/voice-check.js";
import { Button, Card, CoachPicker, CoachStage, Icon, MicMeter, cx } from "../ui/index.js";

// Readings every 50 ms jump between syllables; the bar falls slowly so it can be read.
const METER_DECAY = 0.8;
const VERDICTS = { intro: "idle", recent: "ok", measuring: "listening", ok: "ok", weak: "weak", silent: "silent", error: "silent" };
const VERDICT_ICONS = { idle: "mic", listening: "mic", ok: "check", weak: "alert", silent: "mic-off" };

function useVoiceCheck() {
  const checkRef = useRef(null);
  const resultRef = useRef(null);
  const displayRef = useRef(0);
  const [recent] = useState(recentVoiceCheck);
  // recent | intro | measuring | ok | weak | silent | error
  const [stage, setStage] = useState(() => (recent ? "recent" : "intro"));
  const [reading, setReading] = useState(null);
  const [errorName, setErrorName] = useState(null);

  useEffect(() => () => checkRef.current?.cancel(), []);

  function stop() {
    checkRef.current?.cancel();
    checkRef.current = null;
  }

  // Must run in the click handler: the AudioContext is created right away,
  // and Safari lets it start only within a user gesture.
  function begin() {
    stop();
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

  function cancel() {
    stop();
    setStage(recent ? "recent" : "intro");
  }

  // Before the session starts: a fresh result is saved; no check at all counts as skipped,
  // unless a recent one still holds.
  function save() {
    stop();
    const result = resultRef.current;
    if ((stage === "ok" || stage === "weak") && result) {
      saveVoiceCheck({ label: result.label, outcome: stage, voiceLevel: result.voiceLevel, noiseFloor: result.noiseFloor });
    } else if (stage !== "recent") {
      saveVoiceCheck({ outcome: "skipped" });
    }
  }

  return { stage, reading, errorName, recent, begin, cancel, save };
}

function VoiceCheckCard({ check, texts }) {
  const { stage, reading } = check;
  const verdict = VERDICTS[stage];
  let text;
  if (stage === "recent") text = `${texts.checkRecent(check.recent?.outcome)} ${texts.checkRecentHint}`;
  else if (stage === "intro") text = texts.checkIntro;
  else if (stage === "measuring") {
    text = !reading ? texts.checkOpening
      : reading.phase === "countdown" ? texts.checkCountdown(Math.max(1, Math.ceil(reading.remainingMs / 1000)))
        : texts.checkListening(reading.voiced);
  } else if (stage === "ok") text = texts.checkOk;
  else if (stage === "weak") text = texts.checkWeak;
  else if (stage === "silent") text = texts.checkSilent;
  else text = texts.checkError(check.errorName);
  const level = stage === "measuring" ? meterPosition(reading?.display ?? 0) : 0;
  return (
    <div className="gc-miccheck">
      <div className="gc-miccheck__head">
        <span className="gc-miccheck__icon"><Icon name="mic" size={20} /></span>
        <div>
          <p className="title-s">{texts.checkTitle}</p>
          <p className="gc-muted body-s">Powiedz normalnym głosem: <strong className="gc-ink">„{texts.checkPhrase}”</strong></p>
        </div>
      </div>
      <MicMeter level={level} verdict={verdict} />
      <p className={cx("gc-verdict", `gc-verdict--${verdict}`)} aria-live="polite"><Icon name={VERDICT_ICONS[verdict]} size={18} />{text}</p>
      {stage === "measuring"
        ? <Button variant="secondary" icon="x" onClick={check.cancel}>{texts.checkCancel}</Button>
        : <Button variant="secondary" icon="refresh" onClick={check.begin}>{stage === "intro" ? texts.checkStart : texts.checkAgain}</Button>}
    </div>
  );
}

// onStart() is called right in the click: the session creates its AudioContext
// there, which iOS allows only within a user gesture.
export function StartScreen({ mascot, onMascot, scene, onScene, onStart, busy = false, texts }) {
  const check = useVoiceCheck();
  return (
    <div className="gc-start">
      <div className="gc-start__intro">
        <p className="gc-eyebrow">Trener siłowy AI · rozmowa głosem</p>
        <h1 className="gc-start__title">Mów. Ćwicz. Trener liczy za Ciebie.</h1>
        <ul className="gc-start__points">
          <li><Icon name="mic" size={18} /><span><strong>Rozmawiasz głosem</strong> — mikrofon jest cały czas otwarty, nie trzeba dotykać telefonu.</span></li>
          <li><Icon name="dumbbell" size={18} /><span><strong>Plan pod Ciebie</strong> — cel, poziom, sprzęt, czas i kontuzje.</span></li>
          <li><Icon name="timer" size={18} /><span><strong>Seria po serii</strong> — odlicza przerwy, zmienia ćwiczenia, reaguje na ból.</span></li>
        </ul>
      </div>
      <div className="gc-start__stage"><CoachStage mode="mascot" mascot={mascot} scene={scene} state="idle" status={false} /></div>
      <Card className="gc-start__mic"><VoiceCheckCard check={check} texts={texts} /></Card>
      <Card className="gc-start__coach" eyebrow="Twój trener" title="Wybierz postać">
        <CoachPicker value={mascot} onChange={onMascot} scene={scene} onSceneChange={onScene} />
      </Card>
      <div className="gc-start__go">
        <Button variant="primary" size="xl" iconAfter="arrow-right" block disabled={busy}
          onClick={() => { check.save(); onStart(); }}>{texts.checkGo}</Button>
        <p className="gc-muted body-s">Najpierw krótki wywiad (ok. 2 min), potem plan i trening. Telefon oprzyj 1–2 m od siebie.</p>
      </div>
    </div>
  );
}
