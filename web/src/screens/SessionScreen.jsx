// The session page of the template, put together from the reusable parts.
// An app can keep it, add its own parts around it, or compose its own screen.
import { useRef, useState } from "react";
import { AvatarStage } from "../components/AvatarStage.jsx";
import { BreakOverlay } from "../components/BreakOverlay.jsx";
import { DevLog } from "../components/DevLog.jsx";
import { EndDialog } from "../components/EndDialog.jsx";
import { MicBlockedOverlay } from "../components/MicBlockedOverlay.jsx";
import { SessionControls } from "../components/SessionControls.jsx";
import { Transcript } from "../components/Transcript.jsx";
import { VoiceCheck } from "../components/VoiceCheck.jsx";
import { useSession } from "../session/useSession.js";

// texts: overrides of session/texts.js; onEvent(data): the app's own SSE stages.
// children(session, { start }): the app's own parts below the controls (e.g. a
// camera panel); start(setup) begins a session with that setup, after the voice check.
// overlay: the app's own layer on the avatar video (e.g. a rest countdown).
export function SessionScreen({ texts, onEvent, children, overlay = null }) {
  const videoRef = useRef(null);
  const session = useSession(videoRef, { texts, onEvent });
  const t = session.texts;
  // The setup the session starts with once the voice check is done; null: no check open.
  const [checking, setChecking] = useState(null);
  return (
    <>
      <main className="app">
        <AvatarStage videoRef={videoRef} status={session.status} audioUnlockText={t.audioUnlock}>
          <BreakOverlay open={session.hold === "pause"} onContinue={session.continueSession} texts={t} reconnecting={session.reconnecting} />
          <MicBlockedOverlay reason={session.micBlocked} onResume={session.resumeMic} texts={t} />
          {overlay}
        </AvatarStage>
        <SessionControls session={session} onStart={() => setChecking({})} />
        <p className="hint">{t.voiceHint}</p>
        {children?.(session, { start: (setup) => setChecking(setup) })}
        <Transcript items={session.transcript} />
        <DevLog title={t.devLog} />
      </main>
      <EndDialog
        open={session.hold === "end"}
        finishing={session.finishing}
        reconnecting={session.reconnecting}
        onFinish={session.finish}
        onContinue={session.continueSession}
        texts={t}
      />
      <VoiceCheck
        open={checking !== null}
        onDone={() => { const setup = checking; setChecking(null); session.start(setup); }}
        onClose={() => setChecking(null)}
        texts={t}
      />
    </>
  );
}
