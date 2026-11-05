// The session tab: the coach's stage (mascot or avatar video), what the
// workout needs now, the conversation and the controls. The session itself
// comes from useSession() in App.jsx; this tab is hidden, never unmounted,
// so the avatar's <video> lives through the whole session.
import { useRef } from "react";
import { Button, Card, CoachStage, DevLog, Dialog, EmptyState, Icon, Overlay, SessionControls, Transcript } from "../ui/index.js";
import { useMouth } from "../session/useMouth.js";

// The coach's state from what the session already knows. Joy (cheer) outranks the speech it
// comes with, or it would hardly ever be seen. The microphone is open the whole session, so
// "listening" means it is the user's turn; "thinking": the user spoke last, no answer yet.
export function coachState(session, cheer) {
  if (session.hold === "pause") return "paused";
  if (cheer) return "happy";
  if (session.speaking) return "speaking";
  if (!session.running) return "idle";
  if (session.transcript.at(-1)?.speaker === "user") return "thinking";
  return session.micMuted ? "idle" : "listening";
}

// phase: interview | plan | workout | summary (plan-view.js, workoutPhase).
// main: what the phase shows (plan, live workout, summary); aside: the app's own
// parts under the conversation (camera). doneText: "9 z 17" for the end dialog.
export function SessionScreen({ session, videoRef, phase, main, aside = null, mascot, scene, cheer = false, doneText = null, onGoStart }) {
  const t = session.texts;
  const sceneRef = useRef(null);
  const continueRef = useRef(null);
  const state = coachState(session, cheer);
  const paused = session.hold === "pause";
  const controlsOff = !session.running || session.reconnecting;
  useMouth(sceneRef, session.voiceOnly && state === "speaking", session.voiceLevel, session.voiceMouth);

  const transcript = session.transcript.map((item) => ({ id: item.id, role: item.speaker, text: item.text }));
  const lastCoach = transcript.findLast((item) => item.role === "coach");
  // The plain state word, unless the session has more to say (connecting, a failure, a handover).
  const statusLabel = state === "idle" || session.reconnecting ? session.status : undefined;
  const controls = (props) => (
    <SessionControls onPause={session.pause} onEnd={session.askEnd} onMic={session.toggleMic}
      micLive={!session.micMuted} disabled={controlsOff} {...props} />
  );
  const permission = session.micBlocked === "permission";

  return (
    <div className="gc-session" data-phase={phase} data-paused={paused || undefined}>
      <div className="gc-session__stage">
        <CoachStage mode={session.voiceOnly ? "mascot" : "video"} mascot={mascot} scene={scene} state={state}
          aspect={phase === "workout" ? "strip" : "wide"} statusLabel={statusLabel} videoRef={videoRef} sceneRef={sceneRef}>
          {paused && (
            <Overlay title={t.breakTitle} icon="pause"
              actions={<Button variant="primary" size="xl" icon="play" disabled={session.reconnecting} onClick={session.continueSession}>{t.breakContinue}</Button>}>
              <p>{t.breakHint}</p>
            </Overlay>
          )}
          {session.micBlocked && (
            <Overlay title={permission ? t.micPermissionTitle : t.micAudioTitle} icon="mic-off"
              actions={!permission && <Button variant="primary" size="lg" icon="mic" onClick={session.resumeMic}>{t.micAudioButton}</Button>}>
              <p>{permission ? t.micPermissionText : t.micAudioText}</p>
            </Overlay>
          )}
          {!paused && phase === "workout" && lastCoach && <p className="gc-stage__caption">{lastCoach.text}</p>}
          {/* Shown and hidden by public/ui/audio-unlock.js, which the adapter calls. */}
          <button id="audio-unlock-btn" type="button" className="gc-btn gc-btn--primary gc-btn--md audio-unlock" hidden>
            <Icon name="volume" />{t.audioUnlock}
          </button>
        </CoachStage>
      </div>

      <div className="gc-session__main">
        {session.phase === "idle" && !main ? (
          <EmptyState icon="dumbbell" title="Trening jeszcze nie trwa"
            action={<Button variant="primary" icon="arrow-right" onClick={onGoStart}>Przejdź do startu</Button>}>
            {session.status}
          </EmptyState>
        ) : main || (
          <Card className="gc-facts" eyebrow="Wywiad" title="Opowiedz o swoim treningu">
            <p className="gc-muted body-s">
              Trener zapyta o cel, doświadczenie, sprzęt, czas i kontuzje. Odpowiadaj normalnie, pełnymi zdaniami — plan pojawi się tutaj.
            </p>
          </Card>
        )}
      </div>

      <aside className="gc-session__aside">
        {phase !== "summary" && controls()}
        <Card className="gc-talk" eyebrow="Rozmowa">
          {transcript.length ? <Transcript items={phase === "workout" ? transcript.slice(-3) : transcript} mascot={mascot} />
            : <p className="gc-muted body-s">{t.voiceHint}</p>}
        </Card>
        {aside}
        <DevLog title={t.devLog}>
          <pre id="log" tabIndex={0} aria-label="Logi techniczne" />
          <pre id="provider-output" tabIndex={0} aria-label="Odpowiedzi dostawców" />
        </DevLog>
      </aside>

      {phase !== "summary" && !paused && session.running && (
        <div className="gc-session__bar">{controls({ size: "md", hint: false, bar: true })}</div>
      )}

      <Dialog open={session.hold === "end"} title={t.endTitle} onCancel={session.continueSession} initialFocusRef={continueRef}
        actions={(
          <>
            <Button variant="secondary" size="lg" ref={continueRef} disabled={session.reconnecting} onClick={session.continueSession}>{t.endContinue}</Button>
            <Button variant="danger" size="lg" disabled={session.finishing} onClick={session.finish}>{t.endFinish}</Button>
          </>
        )}>
        {doneText && <p>Zrobiłeś <strong className="gc-num">{doneText}</strong> serii. Wszystko, co zrobione, zapisałem w dzienniku.</p>}
        <p className="gc-muted body-s"><Icon name="mic" size={16} /> {t.endHint}</p>
      </Dialog>
    </div>
  );
}
